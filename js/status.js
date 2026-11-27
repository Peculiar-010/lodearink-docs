import {endpoints, categories, catalog, endpointLink} from './catalog.js';
import {endpointStatus, checkEndpoint} from './api.js';
import {escapeHtml as esc, renderBadge, formatTime, toast} from './ui.js';
const root = document.querySelector('#status-root');
const states = ['online','offline','degraded','requires-parameters','unknown'];
let active = '', search = '', category = '', running = false;
root.innerHTML = `<div class="status-summary" id="status-summary"></div><p class="muted small">Updated ${esc(formatTime(catalog.discoveredAt))}. Availability reflects the last check.</p><div class="status-controls"><input id="status-search" aria-label="Search status" placeholder="Filter endpoints…"><select id="status-category" aria-label="Filter by group"><option value="">All groups</option>${categories.map(c=>`<option>${esc(c)}</option>`).join('')}</select><select id="status-filter" aria-label="Filter by status"><option value="">All statuses</option>${states.map(s=>`<option value="${s}">${s.replaceAll('-',' ')}</option>`).join('')}</select><button class="button button-primary" id="refresh-status">Refresh status</button><span id="check-progress" class="muted small" role="status"></span></div><details class="workspace-note"><summary>About status checks</summary><p class="muted small">Read-only checks refresh every ten minutes. Generation, uploads and downloads run only when requested. Network and CORS failures appear as Unknown.</p></details><div class="panel status-list" id="status-list"></div>`;
function render() {
  const counts = Object.fromEntries(states.map(s=>[s,0]));
  endpoints.forEach(e=>{const state=endpointStatus(e).state;counts[state]=(counts[state]||0)+1;});
  document.querySelector('#status-summary').innerHTML = `<div class="panel status-metric"><strong>${endpoints.length}</strong><span>Total endpoints</span></div>` + states.map(s=>`<button class="panel status-metric" data-status="${s}" aria-label="Show ${s} endpoints"><strong>${counts[s]}</strong>${renderBadge(s)}</button>`).join('');
  const visible = endpoints.filter(e=>(!active || endpointStatus(e).state===active) && (!category || e.category===category) && `${e.path} ${e.category}`.toLowerCase().includes(search.toLowerCase()));
  document.querySelector('#status-list').innerHTML = visible.map(e=>{
    const s=endpointStatus(e);
    return `<a class="status-row" href="${endpointLink('docs',e.path)}"><div><code>${esc(e.path)}</code><br><small>${esc(e.service||e.category)}</small></div>${renderBadge(s.state)}<span class="status-time"><small>${esc(formatTime(s.checkedAt))}</small></span></a>`;
  }).join('') || '<div class="empty">No endpoints match these filters.</div>';
}
root.addEventListener('input',e=>{if(e.target.id==='status-search'){search=e.target.value;render();}});
root.addEventListener('change',e=>{
  if(e.target.id==='status-category')category=e.target.value;
  if(e.target.id==='status-filter')active=e.target.value;
  render();
});
async function refresh(manual = false) {
  if (running) return;
  running=true;
  const button=document.querySelector('#refresh-status'); button.disabled=true; button.textContent='Checking…';
  const candidates=endpoints.filter(e=>e.safeCheck && (!category||e.category===category) && (manual || Date.now()-Date.parse(endpointStatus(e).checkedAt)>10*60_000)).slice(0,manual ? 30 : 6);
  let completed=0;
  try {
    // Deliberately sequential to avoid overwhelming a public upstream.
    for (const e of candidates) {
      if (!manual && document.hidden) break;
      document.querySelector('#check-progress').textContent=`Checking ${++completed}/${candidates.length}: ${e.path}`;
      await checkEndpoint(e);render();
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    document.querySelector('#check-progress').textContent=`${completed} safe checks finished. Cached results are reused for ten minutes.`;
  } catch(error){toast(error.message);}
  finally{running=false;button.disabled=false;button.textContent='Check safe endpoints';}
}
root.addEventListener('click',e=>{
  const metric=e.target.closest('[data-status]');
  if(metric){active=metric.dataset.status;document.querySelector('#status-filter').value=active;render();}
  if(e.target.closest('#refresh-status'))refresh(true);
});
render();
const interval=setInterval(()=>{if(!document.hidden)refresh(false);},10*60_000);
window.addEventListener('pagehide',()=>clearInterval(interval),{once:true});
