import {BASE_URL} from './catalog.js';
import {updateStore, readStore} from './storage.js';
export function classifyResult(status, data) {
  if (status === 0 || status === 403) return 'unknown';
  if ([400, 405, 422].includes(status)) return 'requires-parameters';
  if (status === 404) return 'unknown';
  if (status >= 500 || status === 429 || status === 401) return 'degraded';
  if (status >= 200 && status < 300) return data && typeof data === 'object' && (data.ok === false || data.success === false || data.error) ? 'degraded' : 'online';
  return 'degraded';
}
export function endpointStatus(endpoint) {
  try { return readStore().statuses[endpoint.path] || endpoint.status; }
  catch { return endpoint.status; }
}
export function storeStatus(path, state, note, httpStatus) {
  const result = {state, note, httpStatus, checkedAt: new Date().toISOString()};
  updateStore(d => {d.statuses[path] = result;});
  return result;
}
export function normalizedHeaders(request) {
  const headers = new Headers();
  for (const h of request.headers) if (h.name.trim()) headers.append(h.name.trim(), h.value);
  if (request.payloadType === 'multipart') headers.delete('Content-Type');
  else if (!['GET', 'HEAD'].includes(request.method) && request.payloadType === 'json' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return headers;
}
export async function executeRequest(request, {signal, files = {}, onProgress} = {}) {
  const url = new URL(request.url);
  if (url.origin !== BASE_URL || url.username || url.password) throw new Error(`Only requests to ${BASE_URL} are allowed.`);
  const headers = normalizedHeaders(request);
  const options = {method: request.method, headers, signal, credentials: 'omit'};
  if (!['GET', 'HEAD'].includes(request.method)) {
    if (request.payloadType === 'multipart') {
      const form = new FormData();
      request.fields.forEach((f, i) => {
        if (!f.name) return;
        if (f.isFile) {
          if (!files[i]) throw new Error(`Choose a file for "${f.name}". Saved requests do not retain file contents.`);
          form.append(f.name, files[i]);
        } else form.append(f.name, f.value);
      });
      options.body = form;
    } else {
      if (request.payloadType === 'json' && request.body.trim()) JSON.parse(request.body);
      options.body = request.body;
    }
  }
  const start = performance.now();
  const response = await fetch(url, options);
  const chunks = [];
  let size = 0;
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let preview = '';
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 20 * 1024 * 1024) {await reader.cancel(); throw new Error('Response exceeds the 20 MB preview limit. Use the generated code to download larger files.');}
        chunks.push(value);
        if (onProgress && /event-stream|text\//i.test(response.headers.get('content-type') || '')) {
          preview = (preview + decoder.decode(value, {stream: true})).slice(-100000);
          onProgress(preview, size);
        }
      }
    } finally { reader.releaseLock(); }
  }
  const blob = new Blob(chunks, {type: response.headers.get('content-type') || 'application/octet-stream'});
  const text = /json|text|xml|javascript/i.test(blob.type) ? await blob.text() : '';
  let data = null;
  try { data = JSON.parse(text); } catch { /* A non-JSON response is valid. */ }
  return {status: response.status, statusText: response.statusText, headers: [...response.headers.entries()], blob, text, data, size, elapsed: Math.round(performance.now() - start), contentType: blob.type, url: response.url};
}
const inFlight = new Map();
export async function checkEndpoint(endpoint, {force = false} = {}) {
  const current = endpointStatus(endpoint);
  // Only cheap previously successful GET probes are eligible for automation.
  if (!endpoint.safeCheck) return current;
  if (!force && current.checkedAt && Date.now() - Date.parse(current.checkedAt) < 10 * 60_000) return current;
  if (inFlight.has(endpoint.path)) return inFlight.get(endpoint.path);
  const job = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const {exampleRequest} = await import('./catalog.js');
      const result = await executeRequest(exampleRequest(endpoint), {signal: controller.signal});
      return storeStatus(endpoint.path, classifyResult(result.status, result.data), `Live browser probe: HTTP ${result.status}.`, result.status);
    } catch (error) {
      return storeStatus(endpoint.path, 'unknown', `Browser check failed: ${error.message}. This may be a CORS or network issue, not an offline API.`, 0);
    } finally { clearTimeout(timer); inFlight.delete(endpoint.path); }
  })();
  inFlight.set(endpoint.path, job);
  return job;
}
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const field = document.createElement('textarea');
    field.value = text; field.style.position = 'fixed'; field.style.opacity = '0';
    document.body.append(field); field.select();
    const ok = document.execCommand('copy'); field.remove();
    if (!ok) throw new Error('Clipboard access was denied by the browser.');
  }
}
