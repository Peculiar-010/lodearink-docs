import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROUTES} from '../cloudflare/routes.mjs';
import {PROBES,PROBE_BY_PATH} from '../cloudflare/probes.mjs';
import {normalizePath,observeFetch,withObservability} from '../cloudflare/adapter.mjs';
import {analyticsQueries,prepareUsage} from '../cloudflare/analytics.mjs';
import {availability,monitoringSnapshot,runProbe} from '../cloudflare/monitor.mjs';
import {snapshotResponse} from '../cloudflare/worker.mjs';
const contracts=JSON.parse(readFileSync(new URL('../data/contracts.json',import.meta.url),'utf8'));
const marker='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('monitoring route list is the exact fixed inventory and probes are safe reviewed GETs',()=>{
  assert.equal(ROUTES.length,206);
  assert.deepEqual(new Set(ROUTES),new Set(contracts.endpoints.map(item=>item.path)));
  assert.equal(PROBES.length,PROBE_BY_PATH.size);
  for(const probe of PROBES){
    const entry=contracts.endpoints.find(item=>item.path===probe.path);
    assert.ok(entry?.requests.GET,probe.path);
    assert.ok(!/\/(?:download|stream|generate|upload|build|submit|batch|bulk|zip|random)(?:\/|$)/.test(probe.path),probe.path);
    for(const name of Object.keys(probe.query))assert.ok(Object.hasOwn(entry.requests.GET.query,name),`${probe.path}: ${name}`);
  }
  assert.ok(PROBE_BY_PATH.has('/uptodown/search'),'Probe coverage must not depend on past success');
  assert.ok(PROBE_BY_PATH.has('/football/standings'));
  assert.ok(!PROBE_BY_PATH.has('/movie/download/:slug'));
});

test('normalization removes resource IDs and never exposes query strings',()=>{
  assert.equal(normalizePath('/anime/image/a-user-value'),'\/anime/image/:slug');
  assert.equal(normalizePath('/movie/tv/4815162342/'),'\/movie/tv/:id');
  assert.equal(normalizePath('/playstore/app?token=sensitive'),'/playstore/app');
  assert.equal(normalizePath('/unlisted/private-record'),'__unmatched__');
});

test('adapter returns the original streaming response and records only approved dimensions',async()=>{
  const points=[];
  const env={MONITOR_TOKEN:marker,OBS_EVENTS:{writeDataPoint:value=>points.push(value)}};
  const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('first'));controller.close();}});
  const original=new Response(body,{status:206,headers:{'Content-Type':'text/plain','X-Result':'kept'}});
  const request=new Request('https://api.example/anime/image/secret-id?token=hidden',{method:'GET'});
  const returned=await observeFetch(async()=>original,request,env,{context:true});
  assert.equal(returned,original);
  assert.equal(returned.status,206);
  assert.equal(returned.headers.get('X-Result'),'kept');
  assert.equal(await returned.text(),'first');
  assert.equal(points.length,1);
  assert.deepEqual(points[0].indexes,['/anime/image/:slug']);
  assert.deepEqual(points[0].blobs,['/anime/image/:slug','GET','user']);
  assert.equal(points[0].doubles[0],206);
  assert.ok(Number.isFinite(points[0].doubles[1]));
  assert.equal(JSON.stringify(points).includes('secret-id'),false);
  assert.equal(JSON.stringify(points).includes('token'),false);
});

test('monitor secret is removed before the existing handler and monitor traffic is flagged',async()=>{
  const points=[];
  const env={MONITOR_TOKEN:marker,OBS_EVENTS:{writeDataPoint:value=>points.push(value)}};
  const request=new Request('https://api.example/health',{headers:{'X-Lodearink-Monitor':marker}});
  let handlerRequest;
  const response=await observeFetch(async value=>{handlerRequest=value;return new Response('ok');},request,env);
  assert.equal(response.status,200);
  assert.equal(handlerRequest.headers.has('X-Lodearink-Monitor'),false);
  assert.deepEqual(points[0].blobs,['/health','GET','monitor']);
});

test('telemetry failure never changes success, stream identity, or handler exceptions',async()=>{
  const env={OBS_EVENTS:{writeDataPoint(){throw new Error('telemetry unavailable');}}};
  const response=new Response('success',{status:201});
  assert.equal(await observeFetch(async()=>response,new Request('https://api.example/health'),env),response);
  const failure=new Error('router failure');
  await assert.rejects(observeFetch(async()=>{throw failure;},new Request('https://api.example/search'),env),error=>error===failure);
});

test('module wrapper preserves other Worker handlers and their original receiver',async()=>{
  const calls=[];
  const original={value:'original',fetch(){return Promise.resolve(new Response(this.value));},scheduled(){calls.push(this.value);}};
  const wrapped=withObservability(original);
  assert.equal(await (await wrapped.fetch(new Request('https://api.example/health'),{OBS_EVENTS:{writeDataPoint(){}}})).text(),'original');
  wrapped.scheduled();
  assert.deepEqual(calls,['original']);
});

test('preflight and metrics plumbing do not write usage datapoints',async()=>{
  let writes=0;const env={OBS_EVENTS:{writeDataPoint(){writes++;}}};
  await observeFetch(async()=>new Response(null,{status:204}),new Request('https://api.example/search',{method:'OPTIONS'}),env);
  await observeFetch(async()=>new Response('ok'),new Request('https://api.example/metrics/snapshot'),env);
  assert.equal(writes,0);
});

test('analytics uses three fixed weighted user-only queries and caps data',()=>{
  const queries=analyticsQueries('lodearink_requests',Date.UTC(2026,10,27));
  assert.equal(queries.length,3);
  for(const query of queries){assert.match(query,/blob3 = 'user'/);assert.match(query,/_sample_interval/);}
  assert.match(queries[0],/LIMIT 208/);
  assert.match(queries[1],/LIMIT 2018/);
  assert.match(queries[2],/LIMIT 24/);
  assert.throws(()=>analyticsQueries('bad dataset; DROP TABLE X'));
  assert.throws(()=>prepareUsage([[{endpoint:'/not-a-route'}],[],[]]));
});

test('sample intervals weight totals and average response time; empty data stays honest',()=>{
  const usage=prepareUsage([[
    {endpoint:'/health',requests_1h:5,successes_1h:4,clientErrors_1h:1,serverErrors_1h:0,duration_1h:50,sampleInterval:5,firstSeen:'2026-11-27 08:00:00',lastSeen:'2026-11-27 08:02:00',lastStatus:200},
    {endpoint:'/search',requests_1h:0,successes_1h:0,clientErrors_1h:0,serverErrors_1h:0,duration_1h:0,sampleInterval:1,lastStatus:0}
  ],[{t:1795766400,requests:5,sampleInterval:5}],
   [{time:'2026-11-27 08:02:00',endpoint:'/health',method:'GET',status:200,responseMs:10,sampleInterval:5}]],Date.UTC(2026,10,27,8,3));
  assert.equal(usage.state,'ready');
  assert.equal(usage.windows['1h'].requests,5);
  assert.equal(usage.windows['1h'].successes,4);
  assert.equal(usage.windows['1h'].avgResponseMs,10);
  assert.equal(usage.sampled,true);
  assert.equal(usage.recent[0].sampleInterval,5);
  const empty=prepareUsage([[],[],[]],Date.UTC(2026,10,27));
  assert.equal(empty.state,'waiting-for-traffic');
  assert.equal(empty.windows['1h'].requests,0);
  assert.equal(empty.windows['1h'].avgResponseMs,null);
});

test('availability excludes validation and network failures instead of calling them downtime',()=>{
  const result=availability([
    {at:'2026-11-27T00:00:00Z',state:'online',reason:'checked'},
    {at:'2026-11-27T01:00:00Z',state:'unknown',reason:'network-error'},
    {at:'2026-11-27T02:00:00Z',state:'requires-parameters',reason:'validation'},
    {at:'2026-11-27T03:00:00Z',state:'degraded',reason:'http-5xx'}
  ]);
  assert.equal(result.percent,50);
  assert.equal(result.successful,1);
  assert.equal(result.unsuccessful,1);
  assert.equal(result.excluded,2);
  assert.equal(result.sampleCount,4);
  assert.equal(availability([{state:'unknown',reason:'timeout'}]).percent,null);
});

test('probe registry prevents arbitrary URLs, redirects and validates short response bodies',async()=>{
  const def=PROBE_BY_PATH.get('/health');
  const env={API_ORIGIN:'https://api.example',MONITOR_TOKEN:marker};
  let target,init;
  const online=await runProbe(def,env,{now:Date.UTC(2026,10,27),fetcher:async(url,options)=>{target=url;init=options;return new Response('ok',{status:200});}});
  assert.equal(online.state,'online');
  assert.equal(target.href,'https://api.example/health');
  assert.equal(init.redirect,'manual');
  assert.equal(init.method,'GET');
  const protectedProbe=PROBE_BY_PATH.get('/search');
  const validation=await runProbe(protectedProbe,env,{fetcher:async()=>new Response('{"error":"query required"}',{status:422,headers:{'Content-Type':'application/json'}})});
  assert.equal(validation.state,'requires-parameters');
  assert.equal(validation.reason,'validation');
  const network=await runProbe(protectedProbe,env,{fetcher:async()=>{throw new Error('timeout');}});
  assert.equal(network.reason,'network-error');
  await assert.rejects(runProbe({...def},env));
  await assert.rejects(runProbe(def,{...env,API_ORIGIN:'http://api.example'}));
});

test('monitoring response is bounded to public snapshot GET/HEAD/OPTIONS with exact-origin CORS',async()=>{
  const payload=JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),collectionStartedAt:null,usage:{state:'waiting-for-traffic'},monitoring:{endpoints:[]}});
  let reads=0;
  const env={DOCS_ORIGIN:'https://lodearink-docs-o4dd.vercel.app',OBS_DB:{prepare(sql){return {first:async()=>{reads++;return sql.includes('obs_snapshot')?{payload}:null;}};}}};
  const good=new Request('https://monitor.example/v1/snapshot',{headers:{Origin:env.DOCS_ORIGIN}});
  const response=await snapshotResponse(good,env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),env.DOCS_ORIGIN);
  assert.deepEqual(await response.json(),JSON.parse(payload));
  const hostile=await snapshotResponse(new Request('https://monitor.example/v1/snapshot',{headers:{Origin:'https://evil.example'}}),env);
  assert.equal(hostile.status,403);
  const denied=await snapshotResponse(new Request('https://monitor.example/v1/snapshot?route=/health'),env);
  assert.equal(denied.status,404);
  assert.equal((await snapshotResponse(new Request('https://monitor.example/v1/snapshot',{method:'POST'}),env)).status,405);
  assert.equal((await snapshotResponse(new Request('https://monitor.example/v1/snapshot',{method:'OPTIONS',headers:{Origin:env.DOCS_ORIGIN}}),env)).status,204);
  assert.ok(reads<=1);
});

test('website status and homepage do not create hidden user-counted probes',()=>{
  for(const filename of ['../js/home.js','../js/docs.js','../js/status.js']){
    const source=readFileSync(new URL(filename,import.meta.url),'utf8');
    assert.doesNotMatch(source,/checkEndpoint|fetch\s*\(/,filename);
  }
});

test('monitoring snapshot covers every route and marks untested routes passive',()=>{
  const rows=PROBES.map(probe=>({route:probe.path,next_due:Date.UTC(2026,10,27)+2*60*60_000,history:JSON.stringify([{at:'2026-11-27T08:00:00Z',state:'online',status:200,responseMs:45,reason:'checked'}])}));
  const result=monitoringSnapshot(rows,null,Date.UTC(2026,10,27,9),true);
  assert.equal(result.endpoints.length,206);
  assert.equal(result.endpoints.filter(row=>row.coverage==='active').length,PROBES.length);
  assert.equal(result.endpoints.filter(row=>row.coverage==='passive').length,206-PROBES.length);
  const active=result.endpoints.find(row=>row.path==='/health');
  assert.equal(active.state,'online');
  assert.equal(active.nextCheckAt,new Date(Date.UTC(2026,10,27)+2*60*60_000).toISOString());
  assert.equal(active.observedAvailability.percent,100);
  assert.equal(result.endpoints.find(row=>row.path==='/aivideo/wan').state,'unknown');
});
