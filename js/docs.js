import {endpoints, categories, findEndpoint, endpointLink, exampleRequest} from './catalog.js';
import {escapeHtml as esc, icon, renderBadge, formatTime, toast} from './ui.js';
import {endpointStatus, copyText, checkEndpoint} from './api.js';
import {generateCode} from './code-generator.js';
import {highlight} from './highlight.js';
const list = document.querySelector('#endpoint-list');
const detail = document.querySelector('#endpoint-detail');
const search = document.querySelector('#docs-search');
const category = document.querySelector('#docs-category');
const params = new URL(location.href).searchParams;
let current = findEndpoint(params.get('endpoint')) || endpoints.find(e => e.path === '/health');
category.innerHTML = '<option value="">All categories</option>' + categories.map(c => `<option>${esc(c)}</option>`).join('');
category.value = params.get('category') || '';
function renderList() {
  const term = search.value.toLowerCase();
  const filtered = endpoints.filter(e => (!category.value || e.category === category.value) && `${e.path} ${e.category} ${e.title}`.toLowerCase().includes(term));
  list.innerHTML = `<small class="muted">${filtered.length} endpoints</small>` + (filtered.map(e => `<a class="endpoint-row ${e === current ? 'active' : ''}" ${e === current ? 'aria-current="page"' : ''} href="${endpointLink('docs', e.path)}" data-path="${esc(e.path)}"><span class="method">${esc(e.methods.join('/') || '?')}</span> <code>${esc(e.path)}</code><span class="mini-status ${esc(endpointStatus(e).state)}" aria-label="${esc(endpointStatus(e).state)}"></span></a>`).join('') || '<div class="empty">No matching endpoints. Try another search or category.</div>');
}
function renderDetail() {
  if (!current) return;
  const e = current, status = endpointStatus(e), sample = exampleRequest(e);
  const last = e.evidence.at(-1), success = e.evidence.find(x => x.httpStatus >= 200 && x.httpStatus < 300 && x.response), error = e.evidence.find(x => x.httpStatus >= 400 && x.response);
  const bodyFields = sample.body && sample.payloadType === 'json' ? Object.entries(JSON.parse(sample.body)) : [];
  detail.innerHTML = `<div class="eyebrow"><a href="docs.html">Reference</a> / ${esc(e.category)}</div><div class="detail-head"><div><h2>${esc(e.title)}</h2><div class="detail-meta"><span class="method">${esc(e.methods.join(' / ') || 'Method unconfirmed')}</span>${renderBadge(status.state)}</div></div><a class="button button-primary button-small" href="${endpointLink('playground', e.path)}">Try it ${icon('arrow-right')}</a></div>
  <p class="muted">${esc(status.note)}</p><small class="muted">Last checked ${esc(formatTime(status.checkedAt))} · ${e.listed ? 'Included in your requested inventory' : 'Discovered from the live API directory'}</small>
  <div class="detail-section"><h3>Complete request URL</h3><div class="copy-row"><code class="request-url">${esc(sample.url)}</code><button class="icon-button" data-copy="url" aria-label="Copy complete URL">${icon('copy')}</button></div>${!e.verified ? '<p class="notice">This route has not yet returned a successful test response. The URL and any inputs below are recorded probes, not a promise of supported behavior.</p>' : ''}${e.methods.length === 0 ? '<p class="notice">Neither GET nor POST resolved to this route. No supported method is claimed.</p>' : ''}</div>
  <div class="detail-section"><h3>Parameters</h3>${e.parameters.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Location</th><th>Requirement</th><th>Test value</th></tr></thead><tbody>${e.parameters.map(p => `<tr><td><code>${esc(p.name)}</code><p class="muted">${esc(p.description)}</p></td><td>${esc(p.in)}</td><td>${p.required ? 'Required by validation' : 'Candidate / unconfirmed'}</td><td><code>${esc(p.example)}</code></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No query parameters have been confirmed for this route. This does not imply that all optional parameters have been discovered.</p>'}
  ${bodyFields.length ? `<h4>Tested JSON body fields</h4><p class="muted">These fields were sent together. Individual required/optional semantics are not inferred.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Field</th><th>Test value</th></tr></thead><tbody>${bodyFields.map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td><code>${esc(JSON.stringify(v))}</code></td></tr>`).join('')}</tbody></table></div><pre class="code-block">${highlight(sample.body, true)}</pre><button class="button button-ghost button-small" data-copy="body">Copy request body</button>` : ''}
  </div><div class="detail-section"><div class="section-head"><h3>Request example · ${esc(sample.method)}</h3><button class="button button-ghost button-small" data-copy="curl">${icon('copy')} Copy cURL</button></div><pre class="code-block">${esc(generateCode(sample, 'cURL'))}</pre>${e.methods.filter(m=>m!==sample.method).map(m=>{const other=exampleRequest(e,m);return `<h4>Also observed · ${esc(m)}</h4><pre class="code-block">${esc(generateCode(other,'cURL'))}</pre>${other.body?`<p class="muted">Content-Type: application/json</p><pre class="code-block">${highlight(other.body,true)}</pre>`:''}<button class="button button-small button-ghost" data-copy-method="${esc(m)}">Copy ${esc(m)} request</button>`;}).join('')}<p class="muted">All eight language examples are editable in the <a href="${endpointLink('playground', e.path)}">playground</a>.</p></div>
  <div class="detail-section"><h3>Observed response</h3><p class="muted">HTTP ${last.httpStatus || 'not received'} · ${esc(last.contentType || 'No content type received')} · ${last.responseTime} ms. Captured ${esc(formatTime(last.checkedAt))}.</p>${last.response ? `<pre class="code-block">${highlight(last.response, /json/.test(last.contentType))}</pre><small class="muted">Response evidence is limited to 5,000 characters and may be truncated. No response has been fabricated.</small>` : '<div class="empty">This probe returned media, a redirect, an oversized response, or no readable response body. Use the playground to inspect it live.</div>'}</div>
  ${error ? `<div class="detail-section"><h3>Observed error example · HTTP ${error.httpStatus}</h3><pre class="code-block">${highlight(error.response, /json/.test(error.contentType))}</pre></div>` : '<div class="detail-section"><h3>Error behavior</h3><p class="muted">No error response was captured for this endpoint. No error schema is assumed.</p></div>'}
  ${success && last !== success ? `<details class="detail-section"><summary>Earlier successful response</summary><pre class="code-block">${highlight(success.response, /json/.test(success.contentType))}</pre></details>` : ''}
  <details class="detail-section"><summary>Discovery evidence · ${e.evidence.length} real probes</summary>${e.evidence.map(x => `<div class="evidence-row"><span class="method">${esc(x.method)}</span> HTTP ${x.httpStatus || 'network error'}<code>${esc(x.url)}</code><small class="muted">${esc(formatTime(x.checkedAt))}${x.error ? ' · ' + esc(x.error) : ''}</small>${x.requestBody ? `<pre class="code-block">${esc(JSON.stringify(x.requestBody, null, 2))}</pre>` : ''}</div>`).join('')}</details>
  ${e.safeCheck ? '<button class="button button-ghost" id="check-route">Recheck safe request</button>' : '<p class="notice">Automatic probes are disabled for expensive, mutating, unresolved, and generation endpoints. Test deliberately in the playground.</p>'}`;
  detail.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    try {
      await copyText(button.dataset.copy === 'url' ? sample.url : button.dataset.copy === 'body' ? sample.body : generateCode(sample, 'cURL'));
      toast('Copied to clipboard');
    } catch (err) {toast(err.message);}
  }));
  detail.querySelectorAll('[data-copy-method]').forEach(button=>button.addEventListener('click',async()=>{
    try {await copyText(generateCode(exampleRequest(e,button.dataset.copyMethod),'cURL'));toast('Request copied');}catch(error){toast(error.message);}
  }));
  detail.querySelector('#check-route')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true; event.currentTarget.textContent = 'Checking…';
    try { await checkEndpoint(e, {force: true}); renderDetail(); renderList(); } catch (err) {toast(err.message); event.currentTarget.disabled = false;}
  });
  document.title = `${e.path} — Lodearink API`;
}
function selectFromLocation() {
  const url = new URL(location.href);
  current = findEndpoint(url.searchParams.get('endpoint')) || endpoints.find(e => e.path === '/health');
  category.value = url.searchParams.get('category') || '';
  renderList(); renderDetail();
}
list.addEventListener('click', event => {
  const link = event.target.closest('[data-path]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey) return;
  event.preventDefault(); history.pushState({}, '', link.href); selectFromLocation();
});
search.addEventListener('input', renderList);
category.addEventListener('change', () => {
  const url = new URL(location.href);
  if (category.value) url.searchParams.set('category', category.value); else url.searchParams.delete('category');
  history.replaceState({}, '', url); renderList();
});
window.addEventListener('popstate', selectFromLocation);
renderList(); renderDetail();
