import {ROUTES} from './routes.mjs';
import {UNMATCHED} from './adapter.mjs';
const allowed=new Set([...ROUTES,UNMATCHED]);
const HOUR=3600_000;
export const WINDOWS={'1h':HOUR,'24h':24*HOUR,'7d':7*24*HOUR};
const iso=value=>{
  const normalized=typeof value==='number'?value<100_000_000_000?value*1000:value:typeof value==='string'&&!/[TZ+]/.test(value)?value.replace(' ','T')+'Z':value;
  const date=new Date(normalized);
  return Number.isFinite(date.getTime())?date.toISOString():null;
};
const number=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
export function analyticsQueries(dataset,now=Date.now()){
  if(!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(dataset))throw new Error('Invalid analytics dataset');
  // Fixed bounds are shared by all three queries so totals/history have the same cutoff.
  const until=Math.floor(now/1000),where=`timestamp >= toDateTime(${until-7*86400}) AND timestamp < toDateTime(${until}) AND blob3 = 'user'`;
  const columns=Object.entries(WINDOWS).flatMap(([key,duration])=>{
    const suffix=key.replace('h','h').replace('d','d'),condition=`timestamp >= toDateTime(${until-duration/1000})`;
    return [
      `SUM(IF(${condition}, _sample_interval, 0)) AS requests_${suffix}`,
      `SUM(IF(${condition} AND double1 >= 200 AND double1 < 400, _sample_interval, 0)) AS successes_${suffix}`,
      `SUM(IF(${condition} AND double1 >= 400 AND double1 < 500, _sample_interval, 0)) AS clientErrors_${suffix}`,
      `SUM(IF(${condition} AND double1 >= 500, _sample_interval, 0)) AS serverErrors_${suffix}`,
      `SUM(IF(${condition}, _sample_interval * double2, 0)) AS duration_${suffix}`
    ];
  });
  return [
    `SELECT blob1 AS endpoint, ${columns.join(', ')}, MAX(_sample_interval) AS sampleInterval, toUInt32(MIN(timestamp)) AS firstSeen, toUInt32(MAX(timestamp)) AS lastSeen, argMax(double1, timestamp) AS lastStatus FROM ${dataset} WHERE ${where} GROUP BY endpoint LIMIT 208 FORMAT JSON`,
    `SELECT intDiv(toUInt32(timestamp), 300) * 300 AS t, SUM(_sample_interval) AS requests, MAX(_sample_interval) AS sampleInterval FROM ${dataset} WHERE ${where} GROUP BY t ORDER BY t ASC LIMIT 2018 FORMAT JSON`,
    `SELECT toUInt32(timestamp) AS time, blob1 AS endpoint, blob2 AS method, double1 AS status, double2 AS responseMs, _sample_interval AS sampleInterval FROM ${dataset} WHERE ${where} ORDER BY timestamp DESC LIMIT 24 FORMAT JSON`
  ];
}
export async function readAnalytics(env,now=Date.now(),fetcher=fetch){
  if(!/^[a-f0-9]{32}$/i.test(env.ACCOUNT_ID||'')||!env.CF_ANALYTICS_TOKEN)throw new Error('Analytics is not configured');
  const queries=analyticsQueries(env.DATASET||'lodearink_requests',now);
  const results=[];
  // Sequential requests bound concurrent connections and JSON parsing peaks.
  for(const sql of queries){
    const response=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/analytics_engine/sql`,{
      method:'POST',headers:{Authorization:`Bearer ${env.CF_ANALYTICS_TOKEN}`,'Content-Type':'text/plain'},
      body:sql,redirect:'error',signal:AbortSignal.timeout(8000)
    });
    if(!response.ok)throw new Error('Analytics query failed');
    // Bound parsing work under the free Worker CPU/memory envelope.
    const text=await response.text();
    if(text.length>512_000)throw new Error('Analytics response exceeded the bounded snapshot budget');
    const result=JSON.parse(text);
    if(!Array.isArray(result.data))throw new Error('Unsupported analytics response');
    results.push(result.data);
  }
  if(results[0].length>208||results[1].length>2018||results[2].length>24)throw new Error('Analytics row budget exceeded');
  return prepareUsage(results,now);
}
export function prepareUsage([aggregate,timeline,recent],now=Date.now()){
  if(aggregate.some(row=>!allowed.has(row.endpoint)))throw new Error('Dataset contains unrecognized endpoint dimensions');
  const windows={};let maxSampleInterval=1,firstSeen=null;
  for(const row of [...aggregate,...timeline,...recent])maxSampleInterval=Math.max(maxSampleInterval,number(row.sampleInterval)||1);
  for(const row of aggregate){
    const date=iso(row.firstSeen);
    if(date&&(!firstSeen||date<firstSeen))firstSeen=date;
  }
  for(const [key,duration] of Object.entries(WINDOWS)){
    const from=new Date(now-duration).toISOString(),to=new Date(now).toISOString();
    const endpoints=aggregate.map(row=>{
      const requests=number(row['requests_'+key]);
      return {
        path:row.endpoint,requests,successes:number(row['successes_'+key]),
        clientErrors:number(row['clientErrors_'+key]),serverErrors:number(row['serverErrors_'+key]),
        avgResponseMs:requests?number(row['duration_'+key])/requests:null,
        lastSeenAt:iso(row.lastSeen),lastStatus:Math.min(599,Math.floor(number(row.lastStatus)))
      };
    }).filter(row=>row.requests>0).sort((a,b)=>b.requests-a.requests);
    const total=field=>endpoints.reduce((sum,row)=>sum+row[field],0);
    const requests=total('requests');
    windows[key]={
      from,to,requests,successes:total('successes'),clientErrors:total('clientErrors'),serverErrors:total('serverErrors'),
      avgResponseMs:requests?endpoints.reduce((sum,row)=>sum+(row.avgResponseMs||0)*row.requests,0)/requests:null,
      endpoints,timeline:timeline.filter(row=>number(row.t)*1000>=Math.floor((now-duration)/300000)*300000&&number(row.t)*1000<now).map(row=>({time:new Date(number(row.t)*1000).toISOString(),requests:number(row.requests)}))
    };
  }
  const methods=new Set(['GET','HEAD','POST','PUT','PATCH','DELETE','OTHER']);
  const events=recent.filter(row=>allowed.has(row.endpoint)&&methods.has(row.method)&&iso(row.time)).slice(0,24).map(row=>({
    time:iso(row.time),endpoint:row.endpoint,method:row.method,status:Math.min(599,Math.floor(number(row.status))),
    responseMs:number(row.responseMs),sampleInterval:number(row.sampleInterval)||1
  }));
  return {state:firstSeen?'ready':'waiting-for-traffic',updatedAt:new Date(now).toISOString(),sampled:maxSampleInterval>1,maxSampleInterval,error:null,windows,recent:events,firstSeen};
}
