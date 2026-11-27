import { endpoints, categories, catalog, endpointLink } from './catalog.js';
import { loadObservability, REFRESH_MS } from './observability.js';
import { escapeHtml as esc, renderBadge, formatTime } from './ui.js';

const root = document.querySelector('#status-root');
const list = document.querySelector('#status-list');
const searchInput = document.querySelector('#status-search');
const categorySelect = document.querySelector('#status-category');
const stateSelect = document.querySelector('#status-filter');
const coverageSelect = document.querySelector('#status-coverage');
const message = document.querySelector('#status-message');
const freshness = document.querySelector('#status-freshness');
const resultCount = document.querySelector('#status-result-count');
const refreshButton = document.querySelector('#status-refresh');
let search = '';
let category = '';
let active = '';
let coverage = '';
let result = null;
let controller = null;
let timer = 0;
let running = false;
let disposed = false;
const statuses = ['online','degraded','requires-parameters','unknown'];
const emDash = '—';

categorySelect.insertAdjacentHTML('beforeend',categories.map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join(''));
function safeTime(value) { return value ? formatTime(value) : emDash; }
function validNumber(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)); }
function num(value) { return validNumber(value) ? new Intl.NumberFormat().format(Number(value)) : emDash; }
function duration(value) { return validNumber(value) ? `${new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(Number(value))} ms` : emDash; }
function percent(value) { return validNumber(value) ? `${Number(value).toFixed(1)}%` : emDash; }
function catalogFor(path) { return endpoints.find(item => item.path === path); }
function showMessage(state, body, tone = 'info', action = '') {
  message.innerHTML = `<div class="obs-banner" data-tone="${esc(tone)}"><div><div class="obs-banner-label">${esc(state)}</div><p>${esc(body)}</p></div>${action}</div>`;
}
function renderMessage(value) {
  if (!value) {
    showMessage('Connecting to shared monitoring','Reading scheduled endpoint health. No browser checks or probes are sent.','info');
  } else if (value.state === 'setup-required') {
    showMessage('Shared monitoring not connected','The catalog below is a historical discovery record only. It is not live monitoring and does not imply current uptime.','warning',
      '<a class="obs-banner-action" href="/monitoring-setup">Monitoring setup guide →</a>');
  } else if (value.state === 'unavailable') {
    showMessage('Snapshot unavailable',value.message || 'Shared monitoring could not be refreshed. Historical catalog data is not presented as current health.','error',
      '<a class="obs-banner-action" href="/monitoring-setup">Monitoring setup guide →</a>');
  } else if (value.state === 'stale') {
    showMessage('Snapshot is stale',value.message || 'The latest shared measurements are older than expected.','warning');
  } else {
    message.replaceChildren();
  }
}
function renderCounts(rows, historical) {
  const target = document.querySelector('#status-counts');
  if (historical) {
    target.innerHTML = `<span class="obs-count-chip"><strong>${num(rows.length)}</strong> catalog discovery records · historical</span>`;
    return;
  }
  if (!rows) {
    target.innerHTML = '';
    return;
  }
  const count = Object.fromEntries(statuses.map(state => [state,rows.filter(item => item.state === state).length]));
  const activeCount = rows.filter(item => item.coverage === 'active').length;
  const passiveCount = rows.filter(item => item.coverage === 'passive').length;
  target.innerHTML = `<span class="obs-count-chip"><strong>${num(rows.length)}</strong> monitored endpoints</span><span class="obs-count-chip"><strong>${num(activeCount)}</strong> active checks</span><span class="obs-count-chip"><strong>${num(passiveCount)}</strong> passive only</span>${statuses.map(state => `<span class="obs-count-chip">${renderBadge(state)} <strong>${num(count[state])}</strong></span>`).join('')}`;
}
function stateReason(item) {
  if (item.reason) return item.reason;
  if (item.state === 'requires-parameters') return 'Route requires parameters for an active check.';
  if (item.state === 'unknown') return 'No conclusive active result is available.';
  if (item.coverage === 'passive' && !item.passive) return 'No sampled normal traffic has been observed.';
  return 'No additional reason supplied.';
}
function historyMarkup(history) {
  if (!Array.isArray(history) || !history.length) return '<p class="obs-history-empty">No recorded active-check history.</p>';
  return history.slice(0,12).map(row => `<div class="obs-history-row"><span>${esc(safeTime(row.at))}</span><span>${renderBadge(row.state)}</span><span>${validNumber(row.status) ? esc(row.status) : emDash}</span><span>${esc(duration(row.responseMs))}</span><span class="history-reason">${esc(row.reason || 'No reason code')}</span></div>`).join('');
}
function renderObservedItem(item) {
  const meta = catalogFor(item.path);
  const observed = item.observedAvailability || {};
  const passive = item.passive || null;
  const rateText = passive && validNumber(passive.successRate1h) ? percent(passive.successRate1h) : emDash;
  const coverageLabel = item.coverage === 'active' ? 'Active' : 'Passive';
  const status = statuses.includes(item.state) ? item.state : 'unknown';
  const link = meta ? endpointLink('docs',meta.path) : '';
  const pathMarkup = link ? `<a class="obs-link" href="${esc(link)}">${esc(item.path)}</a>` : esc(item.path);
  const availability = item.coverage === 'active' ? percent(observed.percent) : 'Not applicable — passive coverage';
  const availabilityNote = item.coverage === 'active'
    ? `${num(observed.sampleCount)} conclusive samples`
    : 'Passive health is not active uptime';
  return `<details class="obs-status-item"><summary class="obs-status-summary"><span class="obs-status-path"><code>${pathMarkup}</code><small>${esc(meta?.title || meta?.service || meta?.category || 'Public API endpoint')}${meta?.category ? ` · ${esc(meta.category)}` : ''}</small></span>${renderBadge(status)}<span class="obs-col obs-coverage-col">${esc(coverageLabel)}<small>${item.coverage === 'active' ? 'Scheduled check' : 'Normal traffic'}</small></span><span class="obs-col obs-latency-col">${esc(duration(item.durationMs))}<small>${validNumber(item.httpStatus) ? `HTTP ${esc(item.httpStatus)}` : 'No HTTP status'}</small></span><span class="obs-col obs-next-col">${esc(safeTime(item.nextCheckAt))}<small>Next scheduled</small></span></summary><div class="obs-status-detail"><div class="obs-detail-grid"><div class="obs-detail-cell"><span>Last scheduled check</span><strong>${esc(safeTime(item.lastCheckAt))}</strong></div><div class="obs-detail-cell"><span>Next scheduled check</span><strong>${esc(safeTime(item.nextCheckAt))}</strong></div><div class="obs-detail-cell"><span>Observed active availability</span><strong>${esc(availability)} · ${esc(availabilityNote)}</strong></div><div class="obs-detail-cell"><span>Availability sample window</span><strong>${esc(observed.from ? safeTime(observed.from) : emDash)} → ${esc(observed.to ? safeTime(observed.to) : emDash)}</strong></div><div class="obs-detail-cell"><span>Conclusive active checks</span><strong>${esc(num(observed.sampleCount))} samples · ${esc(num(observed.successful))} successful · ${esc(num(observed.unsuccessful))} unsuccessful</strong></div><div class="obs-detail-cell"><span>Excluded observations</span><strong>${esc(num(observed.excluded))} network / validation / auth failures</strong></div><div class="obs-detail-cell"><span>Latest reason</span><strong>${esc(stateReason(item))}</strong></div><div class="obs-detail-cell"><span>Passive traffic · last hour</span><strong>${passive ? `${esc(num(passive.requests1h))} sampled requests · ${esc(rateText)} success · ${esc(safeTime(passive.lastSeenAt))}` : 'No passive sample reported'}</strong></div></div><div class="obs-history"><h3>Recent scheduled-check history · newest first · up to 12</h3>${historyMarkup(item.history)}</div></div></details>`;
}
function renderHistorical() {
  const matching = endpoints.filter(item => {
    const term = search.trim().toLowerCase();
    return (!category || item.category === category)
      && (!active || active === 'unknown')
      && (!coverage || coverage === 'discovery')
      && (!term || `${item.path} ${item.title || ''} ${item.category || ''} ${item.service || ''}`.toLowerCase().includes(term));
  });
  renderCounts(matching,true);
  document.querySelector('#status-historical').innerHTML = `<div class="obs-historical">Historical discovery inventory only — discovered ${esc(safeTime(catalog.discoveredAt))}. These records are not a monitoring snapshot, live state, current uptime or a downtime assessment.</div>`;
  resultCount.textContent = `${num(matching.length)} historical catalog records`;
  if (!matching.length) {
    list.innerHTML = '<div class="obs-empty"><strong>No discovery records match</strong>Try a different route, category or filter.</div>';
    return;
  }
  list.innerHTML = matching.map(item => {
    const link = endpointLink('docs',item.path);
    return `<details class="obs-status-item"><summary class="obs-status-summary"><span class="obs-status-path"><code>${esc(item.path)}</code><small>${esc(item.title || item.service || item.category)} · ${esc(item.category)}</small></span>${renderBadge('unknown')}<span class="obs-col obs-coverage-col">Discovery<small>Not monitored</small></span><span class="obs-col obs-latency-col">${esc(safeTime(catalog.discoveredAt))}<small>Catalog discovery</small></span><span class="obs-col obs-next-col">—<small>No scheduled check</small></span></summary><div class="obs-status-detail"><div class="obs-detail-grid"><div class="obs-detail-cell"><span>Record type</span><strong>Historical catalog discovery</strong></div><div class="obs-detail-cell"><span>Discovered</span><strong>${esc(safeTime(catalog.discoveredAt))}</strong></div><div class="obs-detail-cell"><span>Current status</span><strong>Not measured</strong></div><div class="obs-detail-cell"><span>Documentation</span><strong><a class="obs-link" href="${esc(link)}">View endpoint reference</a></strong></div></div><p class="obs-history-empty">There is no live check history, latency, availability sample or scheduled check for this historical record.</p></div></details>`;
  }).join('');
}
function renderSnapshotRows(rows) {
  const term = search.trim().toLowerCase();
  const visible = rows.filter(item => {
    const meta = catalogFor(item.path);
    return (!category || meta?.category === category)
      && (!active || item.state === active)
      && (!coverage || item.coverage === coverage)
      && (!term || `${item.path} ${meta?.title || ''} ${meta?.category || ''} ${meta?.service || ''}`.toLowerCase().includes(term));
  });
  renderCounts(rows,false);
  document.querySelector('#status-historical').replaceChildren();
  resultCount.textContent = `${num(visible.length)} of ${num(rows.length)} monitored endpoints`;
  list.innerHTML = visible.length
    ? visible.map(renderObservedItem).join('')
    : '<div class="obs-empty"><strong>No monitored endpoints match</strong>Adjust category, state, coverage or route filters.</div>';
}
function render(value) {
  result = value;
  renderMessage(value);
  const snapshot = value?.snapshot;
  const setupMissing = value?.state === 'setup-required' || snapshot?.monitoring?.state === 'setup-required';
  if (setupMissing) {
    if (!coverageSelect.querySelector('option[value="discovery"]')) coverageSelect.insertAdjacentHTML('beforeend','<option value="discovery">Historical discovery</option>');
    renderHistorical();
  } else if (Array.isArray(snapshot?.monitoring?.endpoints)) {
    coverageSelect.querySelector('option[value="discovery"]')?.remove();
    if (coverage === 'discovery') {
      coverage = '';
      coverageSelect.value = '';
    }
    const rows = snapshot.monitoring.endpoints;
    renderSnapshotRows(rows);
  } else {
    coverageSelect.querySelector('option[value="discovery"]')?.remove();
    if (coverage === 'discovery') {
      coverage = '';
      coverageSelect.value = '';
    }
    renderCounts(null,false);
    document.querySelector('#status-historical').replaceChildren();
    resultCount.textContent = 'No current monitoring records';
    list.innerHTML = `<div class="obs-empty"><strong>Shared monitoring data is unavailable</strong>Catalog entries are not presented as current endpoint health. Retry the snapshot or consult the <a class="obs-link" href="/monitoring-setup">monitoring setup guide</a>.</div>`;
  }
  freshness.innerHTML = snapshot
    ? `<strong>Snapshot ${esc(safeTime(snapshot.monitoring?.updatedAt || snapshot.generatedAt))}</strong>${validNumber(value.ageSeconds) ? `Age ${esc(num(value.ageSeconds))}s` : ''}`
    : `<strong>${setupMissing ? 'Historical inventory only' : 'No monitoring snapshot'}</strong>`;
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
root.addEventListener('input',event => {
  if (event.target === searchInput) search = searchInput.value;
  render(result);
});
root.addEventListener('change',event => {
  if (event.target === categorySelect) category = categorySelect.value;
  if (event.target === stateSelect) active = stateSelect.value;
  if (event.target === coverageSelect) coverage = coverageSelect.value;
  render(result);
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
},{once:true});
refresh();
armPoll();
