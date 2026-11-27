import {endpoints, categories, findEndpoint, findEndpointFromLocation, endpointLink, exampleRequest} from './catalog.js';
import {escapeHtml as esc, icon, renderBadge, formatTime, toast} from './ui.js';
import {endpointStatus, copyText, checkEndpoint} from './api.js';
import {generateCode} from './code-generator.js';
import {highlight} from './highlight.js';

const list=document.querySelector('#endpoint-list');
const detail=document.querySelector('#endpoint-detail');
const search=document.querySelector('#docs-search');
const category=document.querySelector('#docs-category');
let current=findEndpointFromLocation('docs')||findEndpoint('/health');
category.innerHTML='<option value="">All groups</option>'+categories.map(c=>`<option>${esc(c)}</option>`).join('');
category.value=new URL(location.href).searchParams.get('category')||'';

function renderList(){
  const term=search.value.toLowerCase();
  const filtered=endpoints.filter(e=>(!category.value||e.category===category.value)&&`${e.path} ${e.category} ${e.service||''} ${e.title}`.toLowerCase().includes(term));
  let previous='';
  list.innerHTML=filtered.map(e=>{
    const group=e.category;
    const heading=previous!==group?`<div class="endpoint-group-label">${esc(group)}</div>`:'';
    previous=group;
    return `${heading}<a class="endpoint-row ${e===current?'active':''}" ${e===current?'aria-current="page"':''} href="${endpointLink('docs',e.path)}" data-path="${esc(e.path)}"><span class="method">${esc(e.methods.join('/')||'—')}</span><code>${esc(e.path)}</code><span class="mini-status ${esc(endpointStatus(e).state)}" aria-label="${esc(endpointStatus(e).state)}"></span></a>`;
  }).join('')||'<div class="empty">No matching endpoints.</div>';
}
function renderDetail(){
  if(!current){detail.innerHTML='<div class="empty"><h2>Endpoint not found</h2><a class="button" href="/docs">Browse the reference</a></div>';return;}
  const e=current,status=endpointStatus(e),sample=exampleRequest(e);
  const latest=[...e.evidence].reverse().find(ev=>ev.response)||e.evidence.at(-1);
  const error=e.evidence.find(ev=>ev.httpStatus>=400&&ev.response);
  const bodyFields=e.parameters.filter(p=>['body','form','file'].includes(p.in));
  const queryFields=e.parameters.filter(p=>['query','path'].includes(p.in));
  const table=fields=>`<div class="table-wrap"><table class="data-table"><thead><tr><th>Parameter</th><th>Location</th><th>Example</th></tr></thead><tbody>${fields.map(p=>`<tr><td><code>${esc(p.name)}</code>${p.required===true?' <small class="muted">required</small>':''}</td><td>${esc(p.in)}</td><td><code>${esc(p.example||'Your value')}</code></td></tr>`).join('')}</tbody></table></div>`;
  detail.innerHTML=`<div class="eyebrow"><a href="/docs">Reference</a> / ${esc(e.category)}</div>
  <div class="detail-head"><div><h2>${esc(e.title)}</h2><code class="detail-path">${esc(e.path)}</code></div><a class="button button-primary button-small" href="${endpointLink('playground',e.path)}">Try it ${icon('arrow-right')}</a></div>
  <div class="detail-meta"><span class="method">${esc(e.methods.join(' / ')||'Method unconfirmed')}</span>${renderBadge(status.state)}<small class="muted">Checked ${esc(formatTime(status.checkedAt))}</small></div>
  ${status.state!=='online'?`<p class="notice">${esc(status.note)}</p>`:''}
  <div class="detail-section"><div class="section-head"><h3>Request URL</h3><button class="icon-button" data-copy="url" aria-label="Copy complete URL">${icon('copy')}</button></div><code class="request-url standalone-url">${esc(sample.url)}</code></div>
  ${queryFields.length?`<div class="detail-section"><h3>Parameters</h3>${table(queryFields)}</div>`:''}
  ${bodyFields.length?`<details class="detail-section"><summary>Body & upload fields</summary>${table(bodyFields)}</details>`:''}
  <div class="detail-section"><h3>Examples</h3>${(e.methods.length?e.methods:[sample.method]).map(method=>{
    const request=exampleRequest(e,method);
    return `<div class="example-method"><div class="section-head"><span class="method">${esc(method)}</span><button class="button button-small button-ghost" data-copy-method="${esc(method)}">${icon('copy')} Copy</button></div><pre class="code-block">${esc(generateCode(request,'cURL'))}</pre>${request.body?`<details><summary>JSON body</summary><pre class="code-block">${highlight(request.body,true)}</pre></details>`:''}</div>`;
  }).join('')}<a class="text-link" href="${endpointLink('playground',e.path)}">More languages in the playground ${icon('arrow-right')}</a></div>
  <details class="detail-section"><summary>Response example ${latest?.httpStatus?'· HTTP '+latest.httpStatus:''}</summary>${latest?.response?`<pre class="code-block">${highlight(latest.response,/json/.test(latest.contentType))}</pre>`:`<p class="muted">${esc(latest?.contentType||'No response received')}. Open the playground to inspect a live response.</p>`}<small class="muted">Checked ${esc(formatTime(latest?.checkedAt))}. Examples may be truncated.</small></details>
  ${error?`<details class="detail-section"><summary>Error example · HTTP ${error.httpStatus}</summary><pre class="code-block">${highlight(error.response,/json/.test(error.contentType))}</pre></details>`:''}
  ${e.safeCheck?'<button class="button button-ghost button-small" id="check-route">Refresh status</button>':''}`;
  detail.querySelectorAll('[data-copy],[data-copy-method]').forEach(button=>button.addEventListener('click',async()=>{
    try{await copyText(button.dataset.copy==='url'?sample.url:generateCode(exampleRequest(e,button.dataset.copyMethod),'cURL'));toast('Copied');}catch(error){toast(error.message);}
  }));
  detail.querySelector('#check-route')?.addEventListener('click',async event=>{
    event.currentTarget.disabled=true;event.currentTarget.textContent='Checking…';
    try{await checkEndpoint(e,{force:true});renderDetail();renderList();}catch(error){toast(error.message);renderDetail();}
  });
  document.title=`${e.path} — Lodearink API`;
}
function selectFromLocation(){
  current=findEndpointFromLocation('docs')||(location.pathname.replace(/\/$/,'')==='/docs'?findEndpoint('/health'):null);
  category.value=new URL(location.href).searchParams.get('category')||'';
  renderList();renderDetail();
}
list.addEventListener('click',event=>{
  const link=event.target.closest('[data-path]');
  if(!link||event.ctrlKey||event.metaKey||event.shiftKey)return;
  event.preventDefault();history.pushState({},'',link.href);selectFromLocation();
});
search.addEventListener('input',renderList);
category.addEventListener('change',()=>{
  const url=new URL(location.href);
  if(category.value)url.searchParams.set('category',category.value);else url.searchParams.delete('category');
  history.replaceState({},'',url);renderList();
});
window.addEventListener('popstate',selectFromLocation);
renderList();renderDetail();
