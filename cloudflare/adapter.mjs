import {ROUTES} from './routes.mjs';
export const UNMATCHED='__unmatched__';
const exact=new Set(ROUTES.filter(path=>!path.includes(':')));
const templates=ROUTES.filter(path=>path.includes(':')).map(path=>({
  path,pattern:new RegExp('^'+path.split('/').map(part=>part.startsWith(':')?'[^/]+':part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')+'/?$')
}));
const METHODS=new Set(['GET','HEAD','POST','PUT','PATCH','DELETE']);
export function normalizePath(path){
  const canonical=path.replace(/\/$/,'')||'/';
  if(exact.has(canonical))return canonical;
  return templates.find(entry=>entry.pattern.test(path))?.path||UNMATCHED;
}
export function sameSecret(left,right){
  if(typeof left!=='string'||typeof right!=='string'||right.length<32||left.length!==right.length)return false;
  let mismatch=0;for(let i=0;i<right.length;i++)mismatch|=left.charCodeAt(i)^right.charCodeAt(i);
  return mismatch===0;
}
function record(request,env,status,elapsed){
  try{
    const url=new URL(request.url);
    if(request.method==='OPTIONS'||/^\/(?:__observability|metrics)(?:\/|$)/.test(url.pathname))return;
    const route=normalizePath(url.pathname);
    const source=sameSecret(request.headers.get('X-Lodearink-Monitor'),env.MONITOR_TOKEN)?'monitor':'user';
    env.OBS_EVENTS?.writeDataPoint({
      indexes:[route],
      blobs:[route,METHODS.has(request.method)?request.method:'OTHER',source],
      doubles:[status,Math.max(0,Math.min(3_600_000,elapsed))]
    });
  }catch{/* Deliberately fail open: telemetry must never change the API response. */}
}
export async function observeFetch(fetchHandler,request,env,ctx){
  const start=performance.now();
  try{
    const response=await fetchHandler(request,env,ctx);
    record(request,env,response.status,performance.now()-start);
    return response; // Same object: never clone, buffer, consume, or reconstruct a stream.
  }catch(error){
    record(request,env,500,performance.now()-start);
    throw error;
  }
}
export function withObservability(handler){
  if(typeof handler==='function')return {fetch:(request,env,ctx)=>observeFetch(handler,request,env,ctx)};
  if(!handler||typeof handler.fetch!=='function')throw new TypeError('Wrap a module Worker fetch handler; keep your existing router.');
  return {...handler,fetch(request,env,ctx){return observeFetch(handler.fetch.bind(handler),request,env,ctx);}};
}
