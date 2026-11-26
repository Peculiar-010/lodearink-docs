const KEY = 'lodearink-workspace-v1';
const empty = () => ({version: 1, saved: [], recent: [], statuses: {}});
export function readStore() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return empty();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('Saved workspace is not valid JSON. Export or clear this site’s storage to recover.'); }
  if (data.version !== 1 || !Array.isArray(data.saved) || !Array.isArray(data.recent) || !data.statuses) throw new Error('Unsupported workspace format.');
  return data;
}
export function updateStore(fn) {
  const data = readStore();
  fn(data);
  localStorage.setItem(KEY, JSON.stringify(data));
  window.dispatchEvent(new Event('workspace-updated'));
  return data;
}
export function validateRequest(r) {
  if (!r || typeof r.url !== 'string' || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(r.method)) throw new Error('Invalid request URL or method.');
  const url = new URL(r.url);
  if (url.origin !== 'https://api.lodearink.name.ng' || url.username || url.password) throw new Error('Requests must target https://api.lodearink.name.ng.');
  if (!Array.isArray(r.headers) || r.headers.some(h => typeof h.name !== 'string' || typeof h.value !== 'string')) throw new Error('Invalid request headers.');
  if (!['raw', 'json', 'multipart'].includes(r.payloadType) || typeof r.body !== 'string') throw new Error('Invalid request body.');
  if (!Array.isArray(r.fields) || r.fields.some(f => typeof f.name !== 'string' || typeof f.value !== 'string')) throw new Error('Invalid multipart fields.');
  return r;
}
export function saveRequest(name, request, id) {
  validateRequest(request);
  const item = {...structuredClone(request), name: name.trim() || 'Untitled request', id: id || crypto.randomUUID(), updatedAt: new Date().toISOString()};
  updateStore(d => {
    const index = d.saved.findIndex(r => r.id === item.id);
    if (index < 0) d.saved.unshift(item); else d.saved[index] = item;
  });
  return item;
}
export function addRecent(request) {
  validateRequest(request);
  updateStore(d => {
    d.recent.unshift({...structuredClone(request), id: crypto.randomUUID(), name: `${request.method} ${new URL(request.url).pathname}`, updatedAt: new Date().toISOString()});
    d.recent = d.recent.slice(0, 25);
  });
}
export function importRequests(text) {
  if (text.length > 2_000_000) throw new Error('Import must be smaller than 2 MB.');
  const data = JSON.parse(text);
  if (data.version !== 1 || !Array.isArray(data.requests) || data.requests.length > 500) throw new Error('Expected a version 1 Lodearink export with at most 500 requests.');
  // Validate the whole file before writing anything.
  const items = data.requests.map(r => ({...validateRequest(r), id: crypto.randomUUID(), name: typeof r.name === 'string' ? r.name.slice(0, 200) : 'Imported request', updatedAt: new Date().toISOString()}));
  updateStore(d => d.saved.unshift(...items));
  return items.length;
}
export function exportRequests() {
  return JSON.stringify({version: 1, requests: readStore().saved}, null, 2);
}
