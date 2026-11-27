import {endpoints, findEndpoint, findEndpointFromLocation, endpointLink, exampleRequest, BASE_URL} from './catalog.js';
import {escapeHtml as esc, icon, toast, renderBadge, formatTime} from './ui.js';
import {executeRequest, copyText, downloadBlob, storeStatus, classifyResult} from './api.js';
import {generateCode, LANGUAGES} from './code-generator.js';
import {readStore, updateStore, saveRequest, addRecent, importRequests, exportRequests, validateRequest} from './storage.js';
import {highlight} from './highlight.js';
import {taskFollowup} from './task-followup.js';
const root = document.querySelector('#playground-root');
let selected = findEndpointFromLocation('playground') || findEndpoint('/health');
let state = exampleRequest(selected), language = LANGUAGES[0], codeCache = {}, savedId = null, controller = null, result = null, mediaUrl = null, files = {};
let nextTask=null;
const $ = selector => root.querySelector(selector);
root.innerHTML = `<div class="playground-layout"><section class="panel playground-panel request-panel">
<div class="section-head"><h2>Request builder</h2><span class="eyebrow">Live API</span></div>
<label class="field">Endpoint<select id="request-endpoint">${[...new Set(endpoints.map(e=>e.category))].map(group=>`<optgroup label="${esc(group)}">${endpoints.filter(e=>e.category===group).map(e=>`<option value="${esc(e.path)}">${esc(e.path)}</option>`).join('')}</optgroup>`).join('')}</select></label>
<p id="method-note" class="notice"></p><div class="request-bar"><select id="request-method" aria-label="HTTP method"></select><input id="request-url" aria-label="Complete request URL" spellcheck="false"><button class="button button-primary" id="send-request">${icon('arrow-right')} Send</button></div>
<div class="tabs" id="editor-tabs" role="tablist" aria-label="Request settings"><button class="tab active" data-editor="query" role="tab" aria-selected="true">Parameters</button><button class="tab" data-editor="headers" role="tab" aria-selected="false">Headers</button><button class="tab" data-editor="body" role="tab" aria-selected="false">Body</button></div>
<div id="editor-query" class="editor-pane"><div id="query-editor"></div><button class="button button-small button-ghost" id="add-parameter">${icon('plus')} Add parameter</button></div>
<div id="editor-headers" class="editor-pane" hidden><div id="headers-editor"></div><button class="button button-small button-ghost" id="add-header">${icon('plus')} Add header</button><p class="muted small">Browsers control forbidden headers and may hide response headers under CORS. Multipart boundaries are set automatically.</p></div>
<div id="editor-body" class="editor-pane" hidden><label class="field">Body format<select id="body-type"><option value="json">JSON</option><option value="raw">Raw text</option><option value="multipart">Multipart / form-data</option></select></label><label class="field" id="body-text-wrap">Request body<textarea id="request-body" rows="9" spellcheck="false" placeholder="Enter the request body"></textarea></label><div id="multipart-wrap" hidden><div id="multipart-fields"></div><button class="button button-small button-ghost" id="add-field">${icon('plus')} Add field</button><p class="muted small">Files stay in memory only. Reselect them when loading a saved request.</p></div><p id="body-note" class="notice"></p></div>
<div class="request-tools wrap"><button class="button button-small button-ghost" id="reset-request">Reset request</button><button class="button button-small button-ghost" id="save-request">${icon('bookmark')} Save request</button><button class="button button-small button-ghost" id="copy-url">Copy URL</button><button class="button button-small button-ghost" id="copy-get">Copy GET</button><button class="button button-small button-ghost" id="copy-post">Copy POST</button><button class="button button-small button-ghost" id="copy-body">Copy body</button></div>
<p id="request-error" class="error-message" role="alert"></p><details class="workspace-note"><summary>Browser storage & privacy</summary><p class="muted small">Requests are saved locally, including headers. Avoid saving secrets on a shared device.</p></details>
</section>
<section class="panel playground-panel response-panel"><div class="section-head"><h2>Response</h2><button class="button button-small button-ghost" id="cancel-request" hidden>Cancel</button></div><div id="response-meta"></div><div id="response-viewer" class="response-empty"><div>${icon('activity')}<p class="muted">Your response will appear here.</p></div></div></section>
<section class="panel playground-panel code-panel"><div class="section-head"><h2>Generated request</h2><button class="button button-small button-ghost" id="copy-code">${icon('copy')} Copy code</button></div><div class="tabs" id="code-tabs" role="tablist" aria-label="Code language">${LANGUAGES.map((l,i) => `<button class="tab ${i ? '' : 'active'}" role="tab" aria-selected="${!i}" data-language="${esc(l)}">${esc(l)}</button>`).join('')}</div><pre class="code-block" id="generated-code" tabindex="0"></pre><p class="muted small">Examples reflect this request, including URL encoding, headers and body. File paths refer to your own local files.</p></section>
<section class="panel playground-panel saved-panel"><div class="section-head"><h2>Saved & recent requests</h2><div class="wrap"><button class="button button-small button-ghost" id="export-requests">Export</button><button class="button button-small button-ghost" id="import-requests">Import</button><input id="import-file" type="file" accept=".json,application/json" hidden></div></div><div id="saved-requests"></div></section></div>`;

function queryRows() {
  try { return [...new URL(state.url).searchParams].map(([name, value]) => ({name,value})); } catch { return []; }
}
function renderPairs(kind) {
  const rows = kind === 'query' ? queryRows() : state.headers;
  $(`#${kind === 'query' ? 'query' : 'headers'}-editor`).innerHTML = rows.length ? rows.map((r,i) => `<div class="kv-row" data-kind="${kind}" data-index="${i}"><input data-key="name" aria-label="${kind} name ${i+1}" value="${esc(r.name)}" placeholder="Name" spellcheck="false"><input data-key="value" aria-label="${kind} value ${i+1}" value="${esc(r.value)}" placeholder="Value" spellcheck="false"><button class="icon-button" data-remove-pair aria-label="Remove ${kind} ${i+1}">${icon('trash')}</button></div>`).join('') : `<p class="muted small">No ${kind === 'query' ? 'query parameters' : 'custom headers'}.</p>`;
}
function renderFields() {
  $('#multipart-fields').innerHTML = state.fields.map((f,i) => `<div class="multipart-row" data-index="${i}"><input data-field-key="name" aria-label="Field name ${i+1}" value="${esc(f.name)}" placeholder="Field name"><select data-field-key="isFile" aria-label="Field type ${i+1}"><option value="text" ${!f.isFile ? 'selected' : ''}>Text</option><option value="file" ${f.isFile ? 'selected' : ''}>File</option></select>${f.isFile ? `<input type="file" data-field-file aria-label="Upload file ${i+1}"><small class="muted">${esc(f.value || 'Select a file')}</small>` : `<input data-field-key="value" aria-label="Field value ${i+1}" value="${esc(f.value)}" placeholder="Value">`}<button class="icon-button" data-remove-field aria-label="Remove field ${i+1}">${icon('trash')}</button></div>`).join('');
}
function renderMethod() {
  const methods = selected?.methods || [];
  const allowed = methods.length ? methods : [state.method || 'GET'];
  $('#request-method').innerHTML = allowed.map(m => `<option ${m === state.method ? 'selected' : ''}>${esc(m)}</option>`).join('');
  $('#request-method').disabled = !methods.length;
  $('#send-request').disabled = !methods.length || !!controller;
  $('#copy-get').hidden = !methods.includes('GET');
  $('#copy-post').hidden = !methods.includes('POST');
  $('#method-note').textContent = methods.length ? '' : 'This route is not currently available for the listed request formats.';
  $('#method-note').hidden=methods.length>0;
}
function renderBody() {
  const noBody = ['GET', 'HEAD'].includes(state.method);
  $('#body-type').value = state.payloadType;
  $('#body-text-wrap').hidden = state.payloadType === 'multipart';
  $('#multipart-wrap').hidden = state.payloadType !== 'multipart';
  $('#request-body').disabled = noBody;
  $('#body-type').disabled = noBody;
  $('#body-note').textContent = noBody ? 'GET requests use URL parameters, not a request body.' : '';
  $('#body-note').hidden=!noBody;
}
function regenerate() {
  try {
    const url = new URL(state.url);
    if (url.origin !== BASE_URL) throw new Error(`Use an ${BASE_URL} URL.`);
    codeCache = Object.fromEntries(LANGUAGES.map(l => [l, generateCode(state,l)]));
    $('#generated-code').textContent = codeCache[language];
    $('#request-error').textContent = '';
  } catch (error) {
    codeCache = {}; $('#generated-code').textContent = 'Correct the request URL to generate code.'; $('#request-error').textContent = error.message;
  }
}
function renderRequest() {
  $('#request-endpoint').querySelector('[data-task-option]')?.remove();
  if(selected&&!findEndpoint(selected.path)){
    const option=document.createElement('option');option.value=selected.path;option.textContent='Task progress · '+selected.path;option.dataset.taskOption='true';$('#request-endpoint').append(option);
  }
  $('#request-endpoint').value = selected?.path || '';
  $('#request-url').value = state.url;
  $('#request-body').value = state.body;
  renderMethod(); renderPairs('query'); renderPairs('headers'); renderFields(); renderBody(); regenerate();
  $('#save-request').innerHTML = icon('bookmark') + (savedId ? ' Update saved request' : ' Save request');
}
function inferSelected() {
  try {
    const path = new URL(state.url).pathname;
    const match = endpoints.find(e => e.path === path) || endpoints.find(e => {
      const parts = e.path.split('/'), actual = path.split('/');
      return parts.length === actual.length && parts.every((p,i) => p.startsWith(':') || p === actual[i]);
    });
    selected = match || (nextTask&&state.url===nextTask.url?{path:nextTask.path,methods:['GET'],parameters:[]}:null);
    $('#request-endpoint').value = match?.path || '';
    if (selected?.methods.length && !selected.methods.includes(state.method)) state.method = selected.methods[0];
    renderMethod(); renderBody();
  } catch { selected = null; renderMethod(); }
}
function loadRequest(item, id = null) {
  state = structuredClone(item);
  savedId = id; files = {}; inferSelected(); renderRequest();
  toast(id ? 'Saved request opened. Save to update it.' : 'Request loaded');
}
function renderSaved() {
  try {
    const data = readStore();
    const itemRow = (r, recent) => `<div class="saved-request"><button class="saved-load" data-load="${esc(r.id)}" data-recent="${recent}"><strong>${esc(r.name)}</strong><small>${esc(r.method)} · ${esc(new URL(r.url).pathname)} · ${esc(formatTime(r.updatedAt))}</small></button><div class="saved-actions">${!recent ? `<button class="icon-button" data-rename="${esc(r.id)}" aria-label="Rename ${esc(r.name)}">Rename</button><button class="icon-button" data-duplicate="${esc(r.id)}" aria-label="Duplicate ${esc(r.name)}">${icon('copy')}</button><button class="icon-button" data-delete="${esc(r.id)}" aria-label="Delete ${esc(r.name)}">${icon('trash')}</button>` : ''}</div></div>`;
    $('#saved-requests').innerHTML = `<h3 class="small-heading">Saved · ${data.saved.length}</h3>${data.saved.map(r => itemRow(r,false)).join('') || '<div class="empty">Save a request to keep it here. No account needed.</div>'}<h3 class="small-heading">Recent · ${data.recent.length}</h3><button class="button button-small button-ghost" id="clear-recent" ${!data.recent.length ? 'hidden' : ''}>Clear recent history</button>${data.recent.map(r => itemRow(r,true)).join('') || '<p class="muted small">Sent requests appear here, including failures.</p>'}`;
  } catch (error) { $('#saved-requests').textContent = error.message; }
}
function renderResponse(tab = 'formatted') {
  if (!result) return;
  const view = $('#response-viewer'); view.className = '';
  $('#response-meta').innerHTML = `<div class="response-metrics"><span class="method">HTTP ${result.status}</span>${renderBadge(classifyResult(result.status, result.data,new URL(result.requestUrl||result.url).pathname))}<span>${result.elapsed} ms</span><span>${(result.size/1024).toFixed(1)} KB</span></div><p class="muted small">${esc(result.contentType)}</p>`;
  const isMedia = /^(image|audio|video)\//.test(result.contentType);
  const tabs = ['formatted','raw','headers', ...(isMedia ? ['preview'] : [])];
  view.innerHTML = `<div class="tabs" role="tablist" aria-label="Response views">${tabs.map(t => `<button class="tab ${t===tab ? 'active' : ''}" data-response-tab="${t}" role="tab" aria-selected="${t===tab}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div><div id="response-content"></div><div id="task-followup"></div><div class="request-tools"><button class="button button-small button-ghost" id="copy-response">Copy response</button><button class="button button-small button-ghost" id="download-response">${icon('download')} Download</button></div>`;
  const content = $('#response-content');
  if (tab === 'headers') content.innerHTML = `<p class="muted small">Only headers exposed by the API’s CORS policy are visible to JavaScript.</p><pre class="code-block">${esc(result.headers.map(([k,v])=>`${k}: ${v}`).join('\n'))}</pre>`;
  else if (tab === 'preview' && isMedia) {
    if (!mediaUrl) mediaUrl = URL.createObjectURL(result.blob);
    content.innerHTML = result.contentType.startsWith('image/') ? `<img class="response-media" alt="Live API response" src="${mediaUrl}">` : `<${result.contentType.startsWith('audio/') ? 'audio' : 'video'} class="response-media" controls src="${mediaUrl}"></${result.contentType.startsWith('audio/') ? 'audio' : 'video'}>`;
  } else if (!result.text && result.size) content.innerHTML = `<div class="empty">${isMedia ? 'Media response received. Choose Preview to view it.' : 'Binary response received. Download it to inspect the file.'}</div>`;
  else content.innerHTML = `<pre class="code-block" tabindex="0">${highlight(tab === 'formatted' && result.data !== null ? JSON.stringify(result.data,null,2) : result.text || '(Empty response)', tab==='formatted' && result.data !== null)}</pre>`;
  nextTask=taskFollowup(result.data,result.requestUrl||result.url,endpoints);
  if(nextTask){
    const payload=result.data?.data||result.data?.result||result.data;
    const output=payload?.image_url||payload?.video_url||payload?.audio_url||payload?.download_url;
    let outputUrl;
    try{const parsed=new URL(output);if(parsed.protocol==='https:')outputUrl=parsed.href;}catch{}
    $('#task-followup').innerHTML=`<section class="task-card" aria-label="Task progress"><div class="section-head"><span class="eyebrow">Task progress</span><span class="task-state">${esc(nextTask.state)}</span></div><code>${esc(nextTask.id)}</code>${!nextTask.done?`<p class="muted small">Check this task’s latest status.</p><button class="button button-primary button-small" id="check-task">${icon('activity')} Check progress</button>`:`<p class="muted small">Task ${esc(nextTask.state)}.</p>${outputUrl?`<a class="button button-primary button-small" href="${esc(outputUrl)}" target="_blank" rel="noopener noreferrer">Open result ${icon('external')}</a>`:''}`}</section>`;
  }
}
async function send() {
  if (controller) return;
  let timeout;
  try {
    const sentRequest=structuredClone(state),sentEndpoint=selected;
    validateRequest(sentRequest);
    if (!sentEndpoint?.methods.includes(sentRequest.method)) throw new Error('This method is not available for the selected endpoint.');
    if (sentRequest.payloadType === 'json' && !['GET','HEAD'].includes(sentRequest.method) && sentRequest.body.trim()) JSON.parse(sentRequest.body);
    addRecent(sentRequest); renderSaved();
    controller = new AbortController(); $('#send-request').disabled = true; $('#send-request').textContent = 'Sending…'; $('#cancel-request').hidden = false;
    timeout = setTimeout(() => controller?.abort('Request timed out after 60 seconds.'), 60_000);
    result = null;
    if (mediaUrl) {URL.revokeObjectURL(mediaUrl); mediaUrl = null;}
    $('#response-meta').textContent = '';
    $('#response-viewer').className = '';
    $('#response-viewer').innerHTML = '<div class="empty"><span class="loading-dot"></span> Waiting for the real API response…</div>';
    result = await executeRequest(sentRequest, {signal: controller.signal, files, onProgress: (text, size) => {
      $('#response-viewer').innerHTML = `<p class="muted">Receiving stream · ${(size/1024).toFixed(1)} KB</p><pre class="code-block">${esc(text)}</pre>`;
    }});
    result.requestUrl=sentRequest.url;
    storeStatus(sentEndpoint.path, classifyResult(result.status,result.data,sentEndpoint.path), `HTTP ${result.status}`, result.status);
    renderResponse(/^(image|audio|video)\//.test(result.contentType) ? 'preview' : 'formatted');
  } catch (error) {
    const message = controller?.signal.aborted ? String(controller.signal.reason || 'Request cancelled.') : error.message;
    $('#request-error').textContent = message;
    $('#response-viewer').className = '';
    $('#response-viewer').innerHTML = `<div class="empty error-message">${esc(message)}<p class="muted">For network or CORS errors, try the cURL example in your terminal.</p></div>`;
  } finally {
    clearTimeout(timeout); controller = null; $('#cancel-request').hidden = true; $('#send-request').innerHTML = `${icon('arrow-right')} Send`; renderMethod();
  }
}
root.addEventListener('input', event => {
  const target = event.target;
  if (target.id === 'request-url') { state.url = target.value; inferSelected(); renderPairs('query'); }
  if (target.id === 'request-body') state.body = target.value;
  const row = target.closest('.kv-row');
  if (row && target.dataset.key) {
    const kind = row.dataset.kind;
    const rows = [...row.parentElement.querySelectorAll('.kv-row')].map(node => ({name: node.querySelector('[data-key="name"]').value, value: node.querySelector('[data-key="value"]').value}));
    if (kind === 'query') {
      try { const url = new URL(state.url); url.search = ''; rows.forEach(r => url.searchParams.append(r.name,r.value)); state.url = url.href; $('#request-url').value = state.url; } catch {}
    } else state.headers = rows;
  }
  const field = target.closest('.multipart-row');
  if (field && target.dataset.fieldKey && target.dataset.fieldKey !== 'isFile') state.fields[+field.dataset.index][target.dataset.fieldKey] = target.value;
  regenerate();
});
root.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'request-endpoint') {
    selected = findEndpoint(target.value); if (!selected) return;
    state = exampleRequest(selected); savedId = null; files = {}; renderRequest();
    history.pushState({},'',endpointLink('playground',selected.path));
  }
  if (target.id === 'request-method') {
    state.method = target.value;
    const preset = selected ? exampleRequest(selected, state.method) : null;
    if (preset && (preset.body || preset.fields.length)) {
      state.body = preset.body; state.payloadType = preset.payloadType;state.fields=preset.fields;files={};
      if (!state.headers.some(h=>h.name.toLowerCase()==='content-type')) state.headers.push(...preset.headers);
      $('#request-body').value=state.body;renderPairs('headers');renderFields();
    }
    renderBody(); regenerate();
  }
  if (target.id === 'body-type') {
    state.payloadType = target.value;
    const format=selected?.formats?.[state.method];
    const matching=[format,...(format?.alternatives||[])].find(f=>f?.payloadType===state.payloadType);
    if(state.payloadType==='multipart'&&matching?.fields&&!state.fields.length){
      state.fields=matching.fields.map(f=>({...f,value:f.isFile?'sample.jpg':f.value}));renderFields();
    }
    renderBody(); regenerate();
  }
  const field = target.closest('.multipart-row');
  if (field && target.dataset.fieldKey === 'isFile') {
    const i = +field.dataset.index;
    state.fields[i].isFile = target.value === 'file'; state.fields[i].value = ''; delete files[i]; renderFields(); regenerate();
  }
  if (field && target.hasAttribute('data-field-file')) {
    const i = +field.dataset.index;
    if (target.files[0]) {files[i] = target.files[0]; state.fields[i].value = target.files[0].name; target.nextElementSibling.textContent = target.files[0].name;}
    else {delete files[i]; state.fields[i].value = '';}
    regenerate();
  }
  if (target.id === 'import-file') (async () => {
    try {
      if (!target.files[0]) return;
      if (target.files[0].size > 2_000_000) throw new Error('Import must be smaller than 2 MB.');
      const count = importRequests(await target.files[0].text()); renderSaved(); toast(`Imported ${count} requests`);
    } catch (error) {toast(error.message);} finally {target.value = '';}
  })();
});
root.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  try {
    if (button.dataset.editor) {
      root.querySelectorAll('[data-editor]').forEach(b => {const active = b===button; b.classList.toggle('active',active); b.setAttribute('aria-selected',String(active));});
      root.querySelectorAll('.editor-pane').forEach(p => p.hidden = p.id !== `editor-${button.dataset.editor}`);
    }
    if (button.dataset.language) {
      language = button.dataset.language;
      root.querySelectorAll('[data-language]').forEach(b => {b.classList.toggle('active',b===button); b.setAttribute('aria-selected',String(b===button));}); regenerate();
    }
    if (button.dataset.responseTab) renderResponse(button.dataset.responseTab);
    if (button.hasAttribute('data-remove-pair')) {
      const row = button.closest('.kv-row'), kind = row.dataset.kind;
      if (kind === 'query') {
        const rows = queryRows(); rows.splice(+row.dataset.index,1);
        const url = new URL(state.url); url.search = ''; rows.forEach(r => url.searchParams.append(r.name,r.value)); state.url=url.href; $('#request-url').value=state.url;
      } else state.headers.splice(+row.dataset.index,1);
      renderPairs(kind); regenerate();
    }
    if (button.hasAttribute('data-remove-field')) {
      const index = +button.closest('.multipart-row').dataset.index;
      state.fields.splice(index,1);
      files = Object.fromEntries(Object.entries(files).filter(([i])=>+i!==index).map(([i,file])=>[+i>index ? +i-1 : +i,file])); renderFields(); regenerate();
    }
    switch (button.id) {
      case 'check-task': {
        if(!nextTask||controller)break;
        selected=findEndpoint(nextTask.path)||{path:nextTask.path,methods:['GET'],parameters:[]};
        state={endpoint:nextTask.path,url:nextTask.url,method:'GET',headers:[],payloadType:'raw',body:'',fields:[]};savedId=null;files={};
        renderRequest();await send();break;
      }
      case 'add-parameter': {const url = new URL(state.url); url.searchParams.append('',''); state.url=url.href; $('#request-url').value=state.url; renderPairs('query'); regenerate(); break;}
      case 'add-header': state.headers.push({name:'',value:''}); renderPairs('headers'); break;
      case 'add-field': state.fields.push({name:'',value:'',isFile:false}); renderFields(); break;
      case 'reset-request': if (selected) {state=exampleRequest(selected); savedId=null;files={}; renderRequest();} break;
      case 'send-request': await send(); break;
      case 'cancel-request': controller?.abort('Request cancelled.'); break;
      case 'save-request': {
        const existing = readStore().saved.find(r=>r.id===savedId);
        const name = prompt('Name this request',existing?.name || `${state.method} ${new URL(state.url).pathname}`);
        if (name === null) break;
        savedId=saveRequest(name,state,savedId).id; renderSaved(); renderRequest(); toast('Request saved in this browser'); break;
      }
      case 'copy-code': if (!codeCache[language]) throw new Error('Correct the request before copying code.'); await copyText(codeCache[language]); toast('Code copied'); break;
      case 'copy-url': await copyText(new URL(state.url).href); toast('URL copied'); break;
      case 'copy-body': await copyText(state.payloadType === 'multipart' ? JSON.stringify(state.fields,null,2) : state.body); toast('Body copied'); break;
      case 'copy-get': case 'copy-post': {
        const method = button.id === 'copy-get' ? 'GET' : 'POST';
        if (!selected?.methods.includes(method)) throw new Error('Method not observed for this route.');
        await copyText(generateCode({...state,method},'cURL')); toast(`${method} request copied`); break;
      }
      case 'copy-response': if (result) {if (!result.text) throw new Error('Use Download for binary/media responses.'); await copyText(result.text);toast('Response copied');} break;
      case 'download-response': if(result) {const ext = result.contentType.includes('json') ? 'json' : result.contentType.startsWith('image/') ? result.contentType.split('/')[1].split(';')[0].replace('svg+xml','svg') : result.contentType.startsWith('audio/') ? 'mp3' : result.contentType.startsWith('video/') ? 'mp4' : result.text ? 'txt' : 'bin'; downloadBlob(result.blob,`lodearink-response.${ext}`);} break;
      case 'export-requests': downloadBlob(new Blob([exportRequests()],{type:'application/json'}),'lodearink-requests.json'); break;
      case 'import-requests': $('#import-file').click(); break;
      case 'clear-recent': if(confirm('Clear recent request history from this browser?')) {updateStore(d=>d.recent=[]);renderSaved();} break;
    }
    const data = button.dataset;
    if (data.load) {const store=readStore(); const recent=data.recent==='true'; const item=(recent?store.recent:store.saved).find(r=>r.id===data.load);if(item)loadRequest(item,recent?null:item.id);}
    if (data.rename) {const item=readStore().saved.find(r=>r.id===data.rename);const name=prompt('Rename request',item.name);if(name!==null){saveRequest(name,item,item.id);renderSaved();}}
    if (data.duplicate) {const item=readStore().saved.find(r=>r.id===data.duplicate);saveRequest(`${item.name} copy`,item);renderSaved();toast('Request duplicated');}
    if (data.delete && confirm('Delete this saved request from this browser?')) {updateStore(d=>{d.saved=d.saved.filter(r=>r.id!==data.delete);}); if(savedId===data.delete){savedId=null;renderRequest();}renderSaved();}
  } catch(error) {toast(error.message);}
});
window.addEventListener('beforeunload',()=>{controller?.abort();if(mediaUrl)URL.revokeObjectURL(mediaUrl);});
window.addEventListener('popstate',()=>{
  selected=findEndpointFromLocation('playground')||findEndpoint('/health');
  state=exampleRequest(selected);savedId=null;files={};renderRequest();
});
renderRequest(); renderSaved();
