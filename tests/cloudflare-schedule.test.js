import test from 'node:test';
import assert from 'node:assert/strict';
import {PROBES} from '../cloudflare/probes.mjs';
import {scheduledSnapshot} from '../cloudflare/storage.mjs';

function fakeDatabase(){
  let cronSlot=0,snapshot=null,started='';
  const rows=PROBES.map(probe=>({route:probe.path,next_due:0,lease_until:0,history:'[]'}));
  return {
    rows,get snapshot(){return snapshot;},
    prepare(sql){
      let values=[];
      const statement={
        bind(...items){values=items;return statement;},
        async first(){
          if(sql.includes("key='cron_slot'")){
            const [value,slot]=values;
            if(cronSlot>=slot)return null;
            cronSlot=Number(value);return {key:'cron_slot'};
          }
          if(sql.includes('SELECT payload FROM obs_snapshot'))return snapshot?{payload:snapshot}:null;
          if(sql.includes("key='collection_started_at'"))return {value:started};
          return null;
        },
        async all(){
          if(sql.startsWith('UPDATE obs_probes SET lease_until')){
            const [lease,now,notLeased,limit]=values;
            const due=rows.filter(row=>row.next_due<=now&&row.lease_until<=notLeased).sort((a,b)=>a.next_due-b.next_due||a.route.localeCompare(b.route)).slice(0,limit);
            for(const row of due)row.lease_until=lease;
            return {results:due.map(row=>({...row}))};
          }
          if(sql.startsWith('SELECT route,next_due,history'))return {results:rows.map(row=>({...row}))};
          return {results:[]};
        },
        async run(){
          if(sql.includes("key='collection_started_at'"))started=values[0];
          if(sql.startsWith('UPDATE obs_probes SET history')){
            const [history,next_due,route,_lease]=values;
            const row=rows.find(item=>item.route===route);
            if(row){row.history=history;row.next_due=next_due;row.lease_until=0;}
          }
          if(sql.startsWith('UPDATE obs_probes SET next_due')){
            const [next_due,_lease,route]=values;
            const row=rows.find(item=>item.route===route);
            if(row){row.next_due=next_due;row.lease_until=0;}
          }
          if(sql.startsWith('INSERT INTO obs_snapshot'))snapshot=values[0];
          return {success:true};
        }
      };
      return statement;
    }
  };
}

test('each shared schedule runs only three analytics reads and four bounded probes',async()=>{
  const now=Date.UTC(2026,10,27,9,0);
  const db=fakeDatabase();const calls={analytics:0,probes:[]};
  const env={OBS_DB:db,ACCOUNT_ID:'0123456789abcdef0123456789abcdef',DATASET:'lodearink_requests',CF_ANALYTICS_TOKEN:'kept-in-worker-secret',API_ORIGIN:'https://api.example',MONITOR_TOKEN:'not-written-to-dataset-12345678901234567890'};
  const fetcher=async(input,options)=>{
    const url=new URL(String(input));
    if(url.hostname==='api.cloudflare.com'){calls.analytics++;return Response.json({data:[]});}
    calls.probes.push({url:String(input),method:options.method,header:options.headers['X-Lodearink-Monitor']});
    return calls.probes.at(-1).url.endsWith('/health')
      ? new Response('ok',{status:200})
      : Response.json({ok:true},{status:200});
  };
  const result=await scheduledSnapshot(env,{now,fetcher});
  assert.equal(calls.analytics,3);
  assert.equal(calls.probes.length,4);
  assert.ok(calls.probes.every(item=>item.method==='GET'&&item.header===env.MONITOR_TOKEN));
  assert.equal(result.snapshot.usage.state,'waiting-for-traffic');
  assert.equal(result.snapshot.monitoring.endpoints.length,206);
  assert.equal(db.rows.filter(row=>JSON.parse(row.history).length).length,4);
  assert.ok(db.rows.filter(row=>JSON.parse(row.history).length).every(row=>row.next_due===now+2*60*60_000));
  assert.doesNotMatch(db.snapshot,/kept-in-worker-secret|not-written-to-dataset/);
  const duplicate=await scheduledSnapshot(env,{now,fetcher});
  assert.equal(duplicate.skipped,true);
  assert.equal(calls.analytics,3);
  assert.equal(calls.probes.length,4);
});
