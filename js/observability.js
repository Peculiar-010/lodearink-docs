// This client reads shared server snapshots. It never sends API probes or counts requests.
let configuration, lastSnapshot, cached, checkedAt=0;
export const REFRESH_MS=60_000;
export function snapshotState(snapshot,now=Date.now()){
  if(!snapshot||snapshot.schemaVersion!==1||!Number.isFinite(Date.parse(snapshot.generatedAt))||!snapshot.usage||!Array.isArray(snapshot.monitoring?.endpoints))throw new Error('The monitoring service returned an unsupported snapshot.');
  const age=Math.max(0,now-Date.parse(snapshot.generatedAt));
  const stale=age>5*60_000||snapshot.usage.state==='stale';
  const state=stale?'stale':snapshot.usage.state;
  return {state,snapshot,ageSeconds:Math.round(age/1000),message:stale?'Some measurements are stale. Check the snapshot time and scheduled Worker.':snapshot.usage.state==='waiting-for-traffic'?'Collection starts after the adapter receives its first real request.':snapshot.usage.state==='unavailable'?'Analytics is unavailable. The owner should check the Worker configuration and query permissions.':''};
}
export async function loadObservability({force=false,signal,fetcher=fetch}={}){
  if(!force&&cached&&Date.now()-checkedAt<REFRESH_MS)return cached;
  try{
    if(!configuration){
      const response=await fetcher('/data/observability-config.json',{signal});
      if(!response.ok)throw new Error('Monitoring configuration could not be loaded.');
      configuration=await response.json();
    }
    if(!configuration.snapshotUrl)return {state:'setup-required',snapshot:null,message:'Cloudflare monitoring is not connected. No usage totals have been collected by this site.'};
    const url=new URL(configuration.snapshotUrl);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/v1/snapshot')throw new Error('Configure a public HTTPS Worker URL ending in /v1/snapshot. Never put a token in this URL.');
    const response=await fetcher(url.href,{signal,credentials:'omit',cache:force?'no-cache':undefined});
    if(!response.ok)throw new Error(`The monitoring service is unavailable (HTTP ${response.status}).`);
    const snapshot=await response.json();
    const result=snapshotState(snapshot);
    lastSnapshot=snapshot;cached=result;checkedAt=Date.now();
    return result;
  }catch(error){
    return {state:'unavailable',snapshot:lastSnapshot||null,message:error.name==='AbortError'?'Monitoring refresh was cancelled.':'Cannot refresh shared monitoring data. Check the service URL, allowed docs origin and Worker setup.',ageSeconds:lastSnapshot?Math.max(0,Math.round((Date.now()-Date.parse(lastSnapshot.generatedAt))/1000)):null};
  }
}
export function resetObservability(){configuration=null;lastSnapshot=null;cached=null;checkedAt=0;}
