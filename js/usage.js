import { loadObservability, REFRESH_MS } from './observability.js';
import { endpoints, endpointLink } from './catalog.js';
import { escapeHtml as esc, formatTime } from './ui.js';
import { renderTrafficChart, disposeTrafficChart } from './usage-chart.js';

const root = document.querySelector('#usage-root');
const metrics = document.querySelector('#usage-metrics');
const message = document.querySelector('#usage-message');
const freshness = document.querySelector('#usage-freshness');
const chart = document.querySelector('#usage-chart');
const endpointList = document.querySelector('#usage-endpoints');
const recentList = document.querySelector('#usage-recent');
const refreshButton = document.querySelector('#usage-refresh');
let selectedWindow = '24h';
let endpointSearch = '';
let result = null;
let controller = null;
let timer = 0;
let running = false;
let disposed = false;

const dash = '—';
const hasNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const number = value => hasNumber(value) ? new Intl.NumberFormat().format(Number(value)) : dash;
const ms = value => hasNumber(value) ? `${new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(Number(value))} ms` : dash;
const rate = (part, total) => Number(total) > 0 && hasNumber(part)
  ? `${(Number(part) / Number(total) * 100).toFixed(1)}%`
  : dash;
const catalogFor = path => endpoints.find(item => item.path === path);
const safeDate = value => value ? formatTime(value) : dash;
const methodSafe = value => ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(String(value || '').toUpperCase())
  ? String(value).toUpperCase() : '—';
function textMessage(state, body, tone = 'info', action = '') {
  message.innerHTML = `<div class="obs-banner" data-tone="${esc(tone)}"><div><div class="obs-banner-label">${esc(state)}</div><p>${esc(body)}</p></div>${action}</div>`;
}
function renderStateNotice(value) {
  const state = value?.state;
  if (!value) {
    textMessage('Connecting to shared measurements', 'Reading the public snapshot. This page never sends API probes.', 'info');
    return;
  }
  if (state === 'setup-required') {
    textMessage('Monitoring not connected', value.message || 'No usage totals have been collected by this site.', 'warning',
      '<a class="obs-banner-action" href="/monitoring-setup">Monitoring setup guide →</a>');
  } else if (state === 'unavailable') {
    textMessage('Snapshot unavailable', value.message || 'Shared measurements could not be refreshed.', 'error',
      '<a class="obs-banner-action" href="/monitoring-setup">Monitoring setup guide →</a>');
  } else if (state === 'stale') {
    textMessage('Snapshot is stale', value.message || 'These shared measurements are older than expected.', 'warning');
  } else if (state === 'waiting-for-traffic') {
    textMessage('Waiting for observed traffic', value.message || 'Collection starts after the adapter receives its first real request.', 'info');
  } else {
    message.replaceChildren();
  }
}
function metric(label, value, note) {
  return `<div class="panel obs-metric"><span class="obs-metric-label">${esc(label)}</span><strong class="obs-metric-value">${esc(value)}</strong><span class="obs-metric-note">${esc(note)}</span></div>`;
}
function renderMetrics(windowData) {
  if (!windowData) {
    metrics.innerHTML = [
      metric('Requests',dash,'No connected snapshot'),
      metric('Success · 200–399',dash,'No connected snapshot'),
      metric('Client errors · 400–499',dash,'No connected snapshot'),
      metric('Server errors · 500–599',dash,'No connected snapshot'),
      metric('Avg response to headers',dash,'Weighted mean'),
    ].join('');
    return;
  }
  const total = Number(windowData.requests) || 0;
  metrics.innerHTML = [
    metric('Requests',number(windowData.requests),`${selectedWindow} observed window`),
    metric('Success · 200–399',number(windowData.successes),`${rate(windowData.successes,total)} of requests`),
    metric('Client errors · 400–499',number(windowData.clientErrors),`${rate(windowData.clientErrors,total)} of requests`),
    metric('Server errors · 500–599',number(windowData.serverErrors),`${rate(windowData.serverErrors,total)} of requests`),
    metric('Avg response to headers',ms(windowData.avgResponseMs),'Weighted by observed requests'),
  ].join('');
}
function renderEndpoints(windowData) {
  if (!windowData) {
    endpointList.innerHTML = `<div class="obs-empty"><strong>No usage totals yet</strong>Connect monitoring to see genuinely observed endpoint counts.<br><a class="obs-link" href="/monitoring-setup">Read the monitoring setup guide</a></div>`;
    return;
  }
  const term = endpointSearch.trim().toLowerCase();
  const entries = [...(Array.isArray(windowData.endpoints) ? windowData.endpoints : [])]
    .sort((a,b) => (Number(b.requests)||0) - (Number(a.requests)||0))
    .filter(item => {
      const info = catalogFor(item.path);
      return !term || `${item.path} ${info?.title || ''} ${info?.category || ''} ${info?.service || ''}`.toLowerCase().includes(term);
    });
  if (!entries.length) {
    endpointList.innerHTML = `<div class="obs-empty"><strong>${term ? 'No endpoints match this filter' : 'No observed endpoints in this window'}</strong>${term ? 'Try a route or service name from the API catalog.' : 'No endpoint samples are available for the selected window.'}</div>`;
    return;
  }
  endpointList.innerHTML = entries.map(item => {
    const info = catalogFor(item.path);
    const path = item.path === '__unmatched__' ? 'Unmatched route' : item.path;
    const link = info ? endpointLink('docs',info.path) : '';
    const title = info?.title || (item.path === '__unmatched__' ? 'Outside the route catalog' : 'Normalized endpoint');
    const pathMarkup = link
      ? `<a class="obs-endpoint-path obs-link" href="${esc(link)}" title="${esc(path)}">${esc(path)}</a>`
      : `<code class="obs-endpoint-path" title="${esc(path)}">${esc(path)}</code>`;
    return `<div class="obs-endpoint-row"><div>${pathMarkup}<span class="obs-endpoint-meta">${esc(title)}${info?.category ? ` · ${esc(info.category)}` : ''}</span></div><span class="obs-number">${number(item.requests)}</span><span class="obs-number">${rate(item.successes,item.requests)}</span><span class="obs-number obs-error-col">${ms(item.avgResponseMs)}</span></div>`;
  }).join('');
  endpointList.insertAdjacentHTML('afterbegin','<div class="obs-endpoint-row obs-muted-cell"><span>Normalized route</span><span class="obs-number">Requests</span><span class="obs-number">Success</span><span class="obs-number obs-error-col">Avg headers</span></div>');
}
function renderRecent(snapshot) {
  const observations = Array.isArray(snapshot?.usage?.recent) ? snapshot.usage.recent.slice(0,24) : [];
  if (!result?.snapshot) {
    recentList.innerHTML = `<div class="obs-empty"><strong>Sampled activity unavailable</strong>Recent observations appear after the shared collector is connected.</div>`;
    return;
  }
  if (!observations.length) {
    recentList.innerHTML = `<div class="obs-empty"><strong>No sampled observations</strong>This is not a complete request log. New samples may appear after real traffic.</div>`;
    return;
  }
  const records = observations.map(item => {
    const info = catalogFor(item.endpoint);
    const path = item.endpoint === '__unmatched__' ? 'Unmatched route' : item.endpoint;
    const code = Number(item.status);
    const kind = code >= 500 ? 'server' : code >= 400 ? 'client' : code >= 200 ? 'success' : '';
    const href = info ? endpointLink('docs',info.path) : '';
    const endpoint = href
      ? `<a class="obs-link" href="${esc(href)}"><code>${esc(path)}</code></a>`
      : `<code>${esc(path)}</code>`;
    return `<tr><td>${endpoint}</td><td><span class="obs-method">${esc(methodSafe(item.method))}</span></td><td><span class="obs-status" data-kind="${kind}">${Number.isFinite(code) ? esc(code) : dash}</span></td><td>${esc(ms(item.responseMs))}</td><td class="obs-muted-cell">${esc(safeDate(item.time))}</td><td class="obs-muted-cell">${hasNumber(item.sampleInterval) ? `1:${esc(number(item.sampleInterval))}` : dash}</td></tr>`;
  }).join('');
  recentList.innerHTML = `<div class="obs-table-wrap"><table class="obs-table"><thead><tr><th>Endpoint</th><th>Method</th><th>Status</th><th>Duration</th><th>Observed</th><th>Sample</th></tr></thead><tbody>${records}</tbody></table></div>`;
}
function render(value) {
  result = value;
  renderStateNotice(value);
  const snapshot = value?.snapshot;
  const windowData = snapshot?.usage?.windows?.[selectedWindow] || null;
  renderMetrics(windowData);
  renderEndpoints(windowData);
  renderRecent(snapshot);
  freshness.innerHTML = snapshot
    ? `<strong>Updated ${esc(safeDate(snapshot.usage?.updatedAt || snapshot.generatedAt))}</strong>${Number.isFinite(value.ageSeconds) ? `Snapshot age ${esc(number(value.ageSeconds))}s` : ''}`
    : `<strong>${value?.state === 'setup-required' ? 'Not configured' : 'No snapshot available'}</strong>`;
  if (snapshot) {
    const data = windowData;
    if (data) {
      chart.setAttribute('aria-label',`Observed request volume, ${selectedWindow}`);
      renderTrafficChart(chart,{from:data.from,to:data.to,points:data.timeline || []});
    } else {
      disposeTrafficChart(chart);
      chart.textContent='No shared volume window is available.';
    }
  } else {
    disposeTrafficChart(chart);
    chart.textContent=value?.state === 'setup-required' ? 'No live traffic data is connected.' : 'Shared traffic snapshot unavailable.';
  }
}
async function refresh() {
  if (disposed || running || document.hidden) return;
  running = true;
  refreshButton.disabled = true;
  refreshButton.textContent = 'Reading…';
  controller?.abort();
  controller = new AbortController();
  try {
    const value = await loadObservability({force:false,signal:controller.signal});
    if (!disposed) render(value);
  } catch {
    if (!disposed) render({state:'unavailable',snapshot:result?.snapshot || null,message:'Shared monitoring data could not be read.'});
  } finally {
    running = false;
    if (!disposed) {
      refreshButton.disabled = false;
      refreshButton.textContent = 'Refresh snapshot';
    }
  }
}
function armPoll() {
  clearTimeout(timer);
  if (!disposed && !document.hidden) timer = window.setTimeout(async () => {
    await refresh();
    armPoll();
  },REFRESH_MS);
}
root.addEventListener('click',event => {
  const button = event.target.closest('[data-window]');
  if (!button) return;
  selectedWindow = button.dataset.window;
  root.querySelectorAll('[data-window]').forEach(item => item.setAttribute('aria-pressed',String(item === button)));
  render(result);
});
root.querySelector('#usage-endpoint-search').addEventListener('input',event => {
  endpointSearch = event.target.value;
  renderEndpoints(result?.snapshot?.usage?.windows?.[selectedWindow] || null);
});
refreshButton.addEventListener('click',refresh);
document.addEventListener('visibilitychange',() => {
  if (document.hidden) clearTimeout(timer);
  else { refresh(); armPoll(); }
});
window.addEventListener('pagehide',() => {
  disposed = true;
  clearTimeout(timer);
  controller?.abort();
  disposeTrafficChart(chart);
},{once:true});
refresh();
armPoll();
