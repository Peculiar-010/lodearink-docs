import test from 'node:test';
import assert from 'node:assert/strict';
import {loadObservability,resetObservability,snapshotState} from '../js/observability.js';
const now=Date.now();
const base={schemaVersion:1,generatedAt:new Date(now).toISOString(),collectionStartedAt:null,usage:{state:'waiting-for-traffic',updatedAt:null,sampled:false,maxSampleInterval:1,windows:{},recent:[]},monitoring:{state:'setup-required',endpoints:[]}};
test('missing configuration is an explicit setup state with no invented data',async()=>{
  resetObservability();let calls=0;
  const result=await loadObservability({fetcher:async()=>{calls++;return Response.json({snapshotUrl:null,refreshSeconds:60});}});
  assert.equal(calls,1);
  assert.equal(result.state,'setup-required');
  assert.equal(result.snapshot,null);
  assert.equal(result.message,'Live data is not available yet.');
});
test('malformed snapshots and stale snapshots are distinguished',()=>{
  assert.throws(()=>snapshotState({schemaVersion:1,generatedAt:'bad',usage:{},monitoring:{endpoints:[]}}));
  assert.equal(snapshotState({...base,generatedAt:new Date(now-6*60_000).toISOString()},now).state,'stale');
  assert.equal(snapshotState({...base,usage:{...base.usage,state:'unavailable'}},now).state,'unavailable');
});
test('configured snapshots use HTTPS without browser credentials and refresh from shared data only',async()=>{
  resetObservability();const requested=[];
  const result=await loadObservability({fetcher:async(input,options)=>{
    requested.push({url:String(input),options});
    return String(input).endsWith('observability-config.json')
      ? Response.json({snapshotUrl:'https://monitor.example/v1/snapshot'})
      : Response.json(base);
  }});
  assert.equal(result.state,'waiting-for-traffic');
  assert.deepEqual(result.snapshot,base);
  assert.equal(requested.length,2);
  assert.equal(requested[1].url,'https://monitor.example/v1/snapshot');
  assert.equal(requested[1].options.credentials,'omit');
  assert.equal(requested[1].options.headers,undefined);
  resetObservability();
  const invalid=await loadObservability({fetcher:async(input)=>String(input).endsWith('observability-config.json')
    ? Response.json({snapshotUrl:'https://monitor.example/snapshot?token=secret'})
    : Response.json(base)});
  assert.equal(invalid.state,'unavailable');
  assert.doesNotMatch(invalid.message,/secret/);
  resetObservability();
});
