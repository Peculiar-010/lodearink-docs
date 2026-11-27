import { endpoints, categories, endpointLink } from './catalog.js';
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
    showMessage('Loading status','Updating endpoint information.','info');
  } else if (value.state === 'setup-required') {
    message.replaceChildren();
  } else if (value.state === 'unavailable') {
    showMessage('Status unavailable','Please try again later.','error');
  } else if (value.state === 'stale') {
    showMessage('Status may be out of date','Endpoint information was last updated a while ago.','warning');
  } else {
    message.replaceChildren();
  }
}
function renderCounts(rows) {
  const target = document.querySelector('#status-counts');
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
  const latency = item.coverage === 'active' ? item.durationMs : passive?.avgResponseMs1h;
  const rateText = passive && validNumber(passive.successRate1h) ? percent(passive.successRate1h) : emDash;
  const coverageLabel = item.coverage === 'active' ? 'Active' : 'Passive';
  const status = statuses.includes(item.state) ? item.state : 'unknown';
  const link = meta ? endpointLink('docs',meta.path) : '';
  const pathMarkup = link ? `<a class="obs-link" href="${esc(link)}">${esc(item.path)}</a>` : esc(item.path);
  const availability = item.coverage === 'active' ? percent(observed.percent) : 'Not applicable — passive coverage';
  const availabilityNote = item.coverage === 'active'
    ? `${num(observed.sampleCount)} conclusive samples`
    : 'Passive health is not active uptime';
  return `<details class="obs-status-item"><summary class="obs-status-summary"><span class="obs-status-path"><code>${pathMarkup}</code><small>${esc(meta?.title || meta?.service || meta?.category || 'Public API endpoint')}${meta?.category ? ` · ${esc(meta.category)}` : ''}</small></span>${renderBadge(status)}<span class="obs-col obs-coverage-col">${esc(coverageLabel)}<small>${item.coverage === 'active' ? 'Scheduled check' : 'Normal traffic'}</small></span><span class="obs-col obs-latency-col">${esc(duration(latency))}<small>${validNumber(item.httpStatus) ? `HTTP ${esc(item.httpStatus)}` : 'No HTTP status'}</small></span><span class="obs-col obs-next-col">${esc(safeTime(item.nextCheckAt))}<small>Next scheduled</small></span></summary><div class="obs-status-detail"><div class="obs-detail-grid"><div class="obs-detail-cell"><span>Last scheduled check</span><strong>${esc(safeTime(item.lastCheckAt))}</strong></div><div class="obs-detail-cell"><span>Next scheduled check</span><strong>${esc(safeTime(item.nextCheckAt))}</strong></div><div class="obs-detail-cell"><span>Last normal request</span><strong>${passive ? `HTTP ${esc(num(passive.lastStatus))} · ${esc(safeTime(passive.lastSeenAt))}` : 'No passive observation'}</strong></div><div class="obs-detail-cell"><span>Observed active availability</span><strong>${esc(availability)} · ${esc(availabilityNote)}</strong></div><div class="obs-detail-cell"><span>Availability sample window</span><strong>${esc(observed.from ? safeTime(observed.from) : emDash)} → ${esc(observed.to ? safeTime(observed.to) : emDash)}</strong></div><div class="obs-detail-cell"><span>Conclusive active checks</span><strong>${esc(num(observed.sampleCount))} samples · ${esc(num(observed.successful))} successful · ${esc(num(observed.unsuccessful))} unsuccessful</strong></div><div class="obs-detail-cell"><span>Excluded observations</span><strong>${esc(num(observed.excluded))} network / validation / auth failures</strong></div><div class="obs-detail-cell"><span>Latest reason</span><strong>${esc(stateReason(item))}</strong></div><div class="obs-detail-cell"><span>Passive traffic · last hour</span><strong>${passive ? `${esc(num(passive.requests1h))} sampled requests · ${esc(rateText)} success · ${esc(duration(passive.avgResponseMs1h))} avg · ${esc(safeTime(passive.lastSeenAt))}` : 'No passive sample reported'}</strong></div></div><div class="obs-history"><h3>Recent scheduled-check history · newest first · up to 12</h3>${historyMarkup(item.history)}</div></div></details>`;
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
  renderCounts(rows);
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
  const hasSnapshot = Array.isArray(snapshot?.monitoring?.endpoints);
  const controls = root.querySelector('.obs-controls');
  const sectionHead = root.querySelector('.obs-section-head');
  if (!hasSnapshot) {
    controls.hidden = true;
    sectionHead.hidden = true;
    document.querySelector('#status-counts').replaceChildren();
    document.querySelector('#status-historical').replaceChildren();
    resultCount.textContent = 'No live status yet';
    list.innerHTML = '<div class="obs-empty"><strong>Live status is not available yet</strong>Endpoint information will appear here when available.</div>';
  } else {
    controls.hidden = false;
    sectionHead.hidden = false;
    renderSnapshotRows(snapshot.monitoring.endpoints);
  }
  freshness.innerHTML = snapshot
    ? `<strong>Snapshot ${esc(safeTime(snapshot.monitoring?.updatedAt || snapshot.generatedAt))}</strong>${validNumber(value.ageSeconds) ? `Age ${esc(num(value.ageSeconds))}s` : ''}`
     : '<strong>Waiting for live status</strong>';
}
async function refresh(force = false) {
  if (disposed || running || document.hidden) return;
  running = true;
  refreshButton.disabled = true;
  refreshButton.textContent = 'Reading…';
  controller?.abort();
  controller = new AbortController();
  try {
    const value = await loadObservability({force,signal:controller.signal});
    if (!disposed) render(value);
  } catch {
    if (!disposed) render({state:'unavailable',snapshot:result?.snapshot || null,message:'Shared monitoring data could not be read.'});
  } finally {
    running = false;
    if (!disposed) {
      refreshButton.disabled = false;
       refreshButton.textContent = 'Refresh';
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
refreshButton.addEventListener('click',() => refresh(true));
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
