import {readFile,writeFile} from 'node:fs/promises';
import {PROBES} from '../cloudflare/probes.mjs';
export async function generateMonitoring(){
  const root=new URL('../',import.meta.url);
  const contracts=JSON.parse(await readFile(new URL('data/contracts.json',root),'utf8'));
  const routes=contracts.endpoints.map(e=>e.path).sort();
  for(const probe of PROBES){
    const entry=contracts.endpoints.find(e=>e.path===probe.path);
    if(!entry?.requests.GET||probe.path.includes(':')||/\/(?:download|stream|generate|upload|build|submit|batch|bulk|zip|random)(?:\/|$)/.test(probe.path))throw new Error('Probe needs explicit safety review: '+probe.path);
    for(const name of Object.keys(probe.query))if(!(name in entry.requests.GET.query))throw new Error('Unlisted probe parameter: '+probe.path+' '+name);
  }
  await writeFile(new URL('cloudflare/routes.mjs',root),'// Generated ONLY from the authoritative public contracts. No health-directory discovery.\nexport const ROUTES='+JSON.stringify(routes,null,2)+';\n');
  await writeFile(new URL('cloudflare/seed.sql',root),'-- Idempotent: does not reset due times or erase existing observation history.\n'+PROBES.map(p=>`INSERT INTO obs_probes (route) VALUES ('${p.path.replaceAll("'","''")}') ON CONFLICT(route) DO NOTHING;`).join('\n')+'\n');
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url)await generateMonitoring();
