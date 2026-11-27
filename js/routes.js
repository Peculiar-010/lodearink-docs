export const routeSlug = path => path.split('/').filter(Boolean).map(part => encodeURIComponent(part.replace(/^:/, ''))).join('/');
export const endpointLink = (page, path) => `/${page}/${routeSlug(path)}`;
export function matchEndpointLocation(endpoints, page, location) {
  const params = new URLSearchParams(location.search || '');
  const old = params.get('endpoint');
  if (old) return endpoints.find(e => e.path === old);
  const pathname = location.pathname.replace(/\/$/, '');
  return endpoints.find(e => endpointLink(page, e.path) === pathname);
}
