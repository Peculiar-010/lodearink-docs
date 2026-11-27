import {scheduledSnapshot} from './storage.mjs';
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':status===200?'public, max-age=60':'no-store','X-Content-Type-Options':'nosniff'}});}
export async function snapshotResponse(request,env){
  const origin=request.headers.get('Origin');
  const headers={'Vary':'Origin','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Accept'};
  if(origin&&origin!==env.DOCS_ORIGIN)return json({error:'origin-not-allowed'},403);
  if(origin)headers['Access-Control-Allow-Origin']=origin;
  const finish=response=>{
    const result=new Response(request.method==='HEAD'?null:response.body,response);
    for(const [key,value] of Object.entries(headers))result.headers.set(key,value);
    return result;
  };
  const url=new URL(request.url);
  if(url.pathname!=='/v1/snapshot'||url.search)return finish(json({error:'not-found'},404));
  if(request.method==='OPTIONS')return finish(new Response(null,{status:204}));
  if(!['GET','HEAD'].includes(request.method))return finish(json({error:'method-not-allowed'},405));
  try{
    if(!env.OBS_DB)return finish(json({error:'setup-required'},503));
    // Cache only a fixed public read. Misses read one shared D1 row, never Analytics Engine.
    const cache=globalThis.caches?.default;
    const key=new Request(url.href,{method:'GET'});
    const hit=await cache?.match(key);
    if(hit)return finish(hit);
    const row=await env.OBS_DB.prepare('SELECT payload FROM obs_snapshot WHERE id=1').first();
    if(!row)return finish(json({error:'awaiting-first-scheduled-snapshot'},503));
    const response=new Response(row.payload,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'}});
    if(cache)await cache.put(key,response.clone());
    return finish(response);
  }catch{return finish(json({error:'monitoring-unavailable'},503));}
}
export default {
  fetch:snapshotResponse,
  async scheduled(controller,env,ctx){
    // Never expose a public refresh/probe endpoint. Local Wrangler provides cron simulation.
    await scheduledSnapshot(env,{now:controller.scheduledTime||Date.now()});
  }
};
