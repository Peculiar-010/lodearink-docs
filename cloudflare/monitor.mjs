import {ROUTES} from './routes.mjs';
import {PROBE_BY_PATH} from './probes.mjs';
export const INTERVAL_MS=2*60*60_000,BATCH_SIZE=4,HISTORY_SIZE=12,MAX_PROBE_BYTES=8192;
export function apiOrigin(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw new Error('API_ORIGIN must be an HTTPS origin');
  return url.origin;
}
async function limitedJson(response){
  if(!/application\/(?:[\w.+-]*\+)?json\b/i.test(response.headers.get('Content-Type')||''))return {reason:'non-json'};
  if(!response.body)return {reason:'empty-response'};
  const reader=response.body.getReader();const decoder=new TextDecoder();let size=0,text='';
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      size+=value.length;if(size>MAX_PROBE_BYTES)return {reason:'response-too-large'};
      text+=decoder.decode(value,{stream:true});
    }
    text+=decoder.decode();
    try{return {data:JSON.parse(text)};}catch{return {reason:'invalid-json'};}
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function runProbe(definition,env,{fetcher=fetch,now=Date.now()}={}){
  if(PROBE_BY_PATH.get(definition.path)!==definition)throw new Error('Probe is not in the reviewed registry');
  const url=new URL(definition.path,apiOrigin(env.API_ORIGIN));
  for(const [key,value] of Object.entries(definition.query))url.searchParams.set(key,value);
  const start=performance.now();
  const result={at:new Date(now).toISOString(),state:'unknown',status:0,responseMs:null,reason:'network-error'};
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetcher(url,{method:'GET',redirect:'manual',headers:{'X-Lodearink-Monitor':env.MONITOR_TOKEN,Accept:'application/json'},signal:controller.signal});
    result.status=response.status;result.responseMs=Math.round((performance.now()-start)*100)/100;
    if(response.status>=500){await response.body?.cancel();return {...result,state:'degraded',reason:'http-5xx'};}
    if([400,405,422].includes(response.status)){await response.body?.cancel();return {...result,state:'requires-parameters',reason:'validation'};}
    if(response.status===429){await response.body?.cancel();return {...result,state:'degraded',reason:'rate-limited'};}
    if(response.status<200||response.status>=300){await response.body?.cancel();return {...result,reason:response.status>=300&&response.status<400?'redirect-not-followed':[401,403].includes(response.status)?'access-denied':'not-found'};}
    if(definition.expect==='http'){await response.body?.cancel();return {...result,state:'online',reason:'http-health-signal'};}
    const parsed=await limitedJson(response);
    if(parsed.reason)return {...result,reason:parsed.reason};
    const data=parsed.data;
    if(data&&typeof data==='object'&&(data.ok===false||data.success===false||data.status===false||data.error))return {...result,state:'degraded',reason:'application-error'};
    if(!data||typeof data!=='object')return {...result,reason:'unexpected-payload'};
    return {...result,state:'online',reason:'checked'};
  }catch{return {...result,reason:controller.signal.aborted?'timeout':'network-error'};}
  finally{clearTimeout(timeout);}
}
export function availability(history){
  const successful=history.filter(item=>item.state==='online').length;
  const unsuccessful=history.filter(item=>['http-5xx','application-error'].includes(item.reason)).length;
  return {
    percent:successful+unsuccessful?successful/(successful+unsuccessful)*100:null,
    successful,unsuccessful,excluded:history.length-successful-unsuccessful,sampleCount:history.length,
    from:history.at(-1)?.at||null,to:history[0]?.at||null
  };
}
export function monitoringSnapshot(rows,usage,now=Date.now(),configured=true){
  const saved=new Map(rows.map(row=>[row.route,row]));
  const passive=new Map((usage?.windows?.['7d']?.endpoints||[]).map(entry=>[entry.path,entry]));
  const hour=new Map((usage?.windows?.['1h']?.endpoints||[]).map(entry=>[entry.path,entry]));
  return {
    state:configured&&[...PROBE_BY_PATH.keys()].every(path=>saved.has(path))?'ready':'setup-required',
    updatedAt:new Date(now).toISOString(),intervalSeconds:INTERVAL_MS/1000,
    endpoints:ROUTES.map(path=>{
      const active=PROBE_BY_PATH.has(path),row=saved.get(path);
      const history=active&&row?JSON.parse(row.history).slice(0,HISTORY_SIZE):[];
      const latest=history[0],observation=passive.get(path),hourly=hour.get(path);
      const lastStatus=observation?.lastStatus;
      const observedFresh=observation&&now-Date.parse(observation.lastSeenAt)<60*60_000&&usage?.state==='ready';
      const passiveState=!observedFresh?'unknown':lastStatus>=500?'degraded':[400,405,422].includes(lastStatus)?'requires-parameters':lastStatus>=200&&lastStatus<400?'online':'unknown';
      const activeFresh=latest&&now-Date.parse(latest.at)<=INTERVAL_MS+15*60_000;
      return {
        path,coverage:active?'active':'passive',state:active?(activeFresh?latest.state:'unknown'):passiveState,
        lastCheckAt:latest?.at||null,nextCheckAt:active&&configured&&row?new Date(row.next_due||now).toISOString():null,
        durationMs:latest?.responseMs??null,httpStatus:latest?.status??null,
        reason:active?(!configured?'monitor-not-configured':!row?'queue-not-initialized':!latest?'awaiting-check':activeFresh?latest.reason:'stale-check'):'passive-only',
        history,observedAvailability:availability(history),
        passive:observation?{lastSeenAt:observation.lastSeenAt,lastStatus,requests1h:hourly?.requests||0,successRate1h:hourly?.requests?hourly.successes/hourly.requests*100:null}:null
      };
    })
  };
}
