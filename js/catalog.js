export const BASE_URL = 'https://api.lodearink.name.ng';
import {endpointLink, matchEndpointLocation} from './routes.js';
const response = await fetch('/data/catalog.json');
if (!response.ok) throw new Error(`Cannot load the endpoint catalog (${response.status}).`);
export const catalog = await response.json();
export const endpoints = catalog.endpoints.map(e => ({
  ...e,
  // Defense in depth: do not let a GET-based generation API enter the status scheduler.
  safeCheck: e.safeCheck && /^\/(?:health$|search$|bulktext\/search$|images\/search$|npm\/|pypi\/|github\/|hn\/|football\/|placeholder\/|ytsearch\/|spotsearch\/|bing\/web\/|anime\/(?:catalog|characters|series|search)|movie\/(?:titles|search|tv$))/.test(e.path),
}));
export const categories = [...new Set(endpoints.map(e => e.category))].sort();
export const findEndpoint = path => endpoints.find(e => e.path === path);
export {endpointLink};
export const findEndpointFromLocation = page => matchEndpointLocation(endpoints, page, location);
// Preserve old bookmarks while presenting the same extensionless links as the reference.
if(typeof location!=='undefined'&&new URLSearchParams(location.search).has('endpoint')){
  const page=location.pathname.split('/')[1]?.replace(/\.html$/,'');
  const endpoint=matchEndpointLocation(endpoints,page,location);
  if(endpoint&&['docs','playground'].includes(page)){
    const query=new URLSearchParams(location.search);query.delete('endpoint');
    history.replaceState({},'',endpointLink(page,endpoint.path)+(query.size?'?'+query:'')+location.hash);
  }
}
export function exampleRequest(endpoint, requestedMethod) {
  const method = requestedMethod || (endpoint.methods.includes(endpoint.sample.method) ? endpoint.sample.method : endpoint.methods[0]) || endpoint.sample.method || 'GET';
  const evidence = [...endpoint.evidence].reverse().find(e => e.method === method && e.httpStatus >= 200 && e.httpStatus < 400)
    || [...endpoint.evidence].reverse().find(e => e.method === method);
  const sample = endpoint.methodSamples?.[method] || (method === endpoint.sample.method ? endpoint.sample : evidence ? {
    method, url: evidence.url, body: evidence.requestBody,
    headers: evidence.requestBody == null ? {} : {'Content-Type':'application/json'},
  } : endpoint.sample);
  return {
    endpoint: endpoint.path,
    url: sample.url,
    method,
    headers: Object.entries(sample.headers || {}).map(([name, value]) => ({name, value})),
    payloadType: sample.payloadType || (sample.body == null ? 'raw' : 'json'),
    body: sample.body == null ? '' : JSON.stringify(sample.body, null, 2),
    fields: sample.fields || [],
  };
}
