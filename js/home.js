import {endpoints, categories, endpointLink} from './catalog.js';
import {escapeHtml as esc, icon, renderBadge} from './ui.js';
const featured = ['/health', '/search', '/npm/package', '/visionai/qwen/analyze', '/ytdl/info', '/football/leagues'].map(p => endpoints.find(e => e.path === p)).filter(Boolean);
const target = document.querySelector('#home-featured');
function renderFeatured() {
  if (target) target.innerHTML = featured.map(e => `<a class="panel featured-item" href="${endpointLink('docs', e.path)}"><div><strong>${esc(e.category)}</strong><code>${esc(e.path)}</code></div><div class="featured-side">${renderBadge(e.status.state)}${icon('arrow-right')}</div></a>`).join('');
}
renderFeatured();
const categoryGrid = document.querySelector('#home-categories');
if (categoryGrid) categoryGrid.innerHTML = categories.map(c => {
  const items = endpoints.filter(e => e.category === c);
  const brand = /youtube/i.test(c) ? 'youtube' : /spotify/i.test(c) ? 'spotify' : /github/i.test(c) ? 'github' : /tiktok/i.test(c) ? 'tiktok' : /instagram/i.test(c) ? 'instagram' : /reddit/i.test(c) ? 'reddit' : 'code';
  return `<a class="panel category-card" href="/docs?category=${encodeURIComponent(c)}"><span class="category-icon">${icon(brand)}</span><h3>${esc(c)}</h3><p>${items.length} endpoint${items.length === 1 ? '' : 's'} ${icon('arrow-right')}</p></a>`;
}).join('');
document.querySelectorAll('[data-endpoint-count]').forEach(el => el.textContent = endpoints.length);
document.querySelectorAll('[data-category-count]').forEach(el => el.textContent = categories.length);
