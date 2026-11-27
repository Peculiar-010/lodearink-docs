import {PROBE_BY_PATH} from './probes.mjs';
import {BATCH_SIZE,HISTORY_SIZE,INTERVAL_MS,runProbe,monitoringSnapshot,apiOrigin} from './monitor.mjs';
import {readAnalytics} from './analytics.mjs';
export async function scheduledSnapshot(env,{now=Date.now(),fetcher=fetch}={}){
  const db=env.OBS_DB;
  if(!db)throw new Error('Monitoring database is not configured');
  const slot=Math.floor(now/60_000);
  // One persisted lease per minute for the whole account, never per visitor/colocation.
  const lease=await db.prepare("UPDATE obs_state SET value=? WHERE key='cron_slot' AND CAST(value AS INTEGER)<? RETURNING key").bind(String(slot),slot).first();
  if(!lease)return {skipped:true};
  const previousRow=await db.prepare('SELECT payload FROM obs_snapshot WHERE id=1').first();
  const previous=previousRow?JSON.parse(previousRow.payload):null;
  let usage,started=(await db.prepare("SELECT value FROM obs_state WHERE key='collection_started_at'").first())?.value||null;
  try{
    usage=await readAnalytics(env,now,fetcher);
    if(!started&&usage.firstSeen){
      started=usage.firstSeen;
      await db.prepare("UPDATE obs_state SET value=? WHERE key='collection_started_at' AND value=''").bind(started).run();
    }
    if(started)usage.state='ready';
    delete usage.firstSeen;
  }catch{
    usage=previous?.usage?{...previous.usage,state:previous.usage.updatedAt?'stale':'unavailable',error:{code:'analytics-unavailable',at:new Date(now).toISOString()}}:{state:'unavailable',updatedAt:null,sampled:false,maxSampleInterval:1,windows:{},recent:[],error:{code:'analytics-unavailable',at:new Date(now).toISOString()}};
  }
  let configured=typeof env.MONITOR_TOKEN==='string'&&env.MONITOR_TOKEN.length>=32;
  try{apiOrigin(env.API_ORIGIN);}catch{configured=false;}
  if(configured){
    const due=await db.prepare('UPDATE obs_probes SET lease_until=? WHERE route IN (SELECT route FROM obs_probes WHERE next_due<=? AND lease_until<=? ORDER BY next_due,route LIMIT ?) RETURNING route,history').bind(now+120_000,now,now,BATCH_SIZE).all();
    // Four probes, two in flight. Never follow redirects or retry within this invocation.
    for(let index=0;index<due.results.length;index+=2){
      await Promise.all(due.results.slice(index,index+2).map(async row=>{
        const definition=PROBE_BY_PATH.get(row.route);
        if(!definition){
          await db.prepare('UPDATE obs_probes SET next_due=?,lease_until=0 WHERE route=?').bind(now+24*60*60_000,row.route).run();return;
        }
        const result=await runProbe(definition,env,{now,fetcher});
        const history=[result,...JSON.parse(row.history)].slice(0,HISTORY_SIZE);
        await db.prepare('UPDATE obs_probes SET history=?,next_due=?,lease_until=0 WHERE route=? AND lease_until=?').bind(JSON.stringify(history),now+INTERVAL_MS,row.route,now+120_000).run();
      }));
    }
  }
  const rows=await db.prepare('SELECT route,next_due,history FROM obs_probes').all();
  const snapshot={schemaVersion:1,generatedAt:new Date(now).toISOString(),collectionStartedAt:started,usage,monitoring:monitoringSnapshot(rows.results,usage,now,configured)};
  const payload=JSON.stringify(snapshot);
  if(payload.length>750_000)throw new Error('Snapshot exceeded its bounded storage budget');
  await db.prepare('INSERT INTO obs_snapshot(id,payload,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(payload,now).run();
  return {snapshot};
}
