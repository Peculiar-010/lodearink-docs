const BASE='https://api.lodearink.name.ng';
const terminal=new Set(['completed','complete','success','succeeded','failed','error','cancelled','canceled','done']);
export function taskFollowup(data,currentUrl,inventory=[]){
  if(!data||typeof data!=='object')return null;
  const candidates=[data,data.data,data.result,data.task,data.job].filter(v=>v&&typeof v==='object');
  for(const value of candidates){
    const id=value.task_id??value.taskId??value.job_id??value.jobId;
    if(!['string','number'].includes(typeof id)||String(id).length>300||String(id).length===0)continue;
    const state=String(value.status||value.state||data.status||(value.ok===false&&value.error?'failed':'')).toLowerCase();
    const done=terminal.has(state)||Boolean(value.image_url||value.video_url||value.audio_url||value.download_url);
    const provided=value.status_url||value.statusUrl||value.poll_url||value.pollUrl||data.status_url;
    let url;
    if(provided){
      try{url=new URL(provided,BASE);}catch{continue;}
      if(url.origin!==BASE||url.username||url.password)continue;
    }else{
      const current=new URL(currentUrl);
      const parent=current.pathname.replace(/\/(?:submit|generate)$/,'').replace(/\/status$/,'');
      const path=parent+'/status';
      if(current.origin!==BASE)continue;
      if(current.pathname.endsWith('/status'))url=current;
      else{
        if(!inventory.some(e=>e.path===path&&e.methods.includes('GET')))continue;
        url=new URL(path,BASE);
      }
      url.searchParams.set('task_id',String(id));
    }
    const matching=inventory.find(e=>e.path===url.pathname);
    const idName=matching?.parameters.find(p=>p.in==='query'&&['task_id','job_id','taskId','jobId'].includes(p.name))?.name||'task_id';
    // Keep a provider-supplied populated ID; fill it only when omitted.
    if(!url.searchParams.has(idName))url.searchParams.set(idName,String(id));
    return {id:String(id),url:url.href,state:state||'pending',done,path:url.pathname};
  }
  return null;
}
