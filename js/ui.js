import { endpoints, endpointLink } from "/js/catalog.js";

const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/svg+xml';
favicon.href = '/favicon.svg';
document.head.append(favicon);
const workspaceStyles = document.createElement('link');
workspaceStyles.rel = 'stylesheet';
workspaceStyles.href = '/css/workspace.css';
document.head.append(workspaceStyles);
const refinementStyles = document.createElement('link');
refinementStyles.rel = 'stylesheet';
refinementStyles.href = '/css/refinement.css';
document.head.append(refinementStyles);

const icons = {
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  "arrow-right":'<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  code:'<path d="m8 17-5-5 5-5"/><path d="m16 7 5 5-5 5"/><path d="m14 4-4 16"/>',
  globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/>',
  terminal:'<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
  menu:'<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  activity:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  close:'<path d="m18 6-12 12"/><path d="m6 6 12 12"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  plus:'<path d="M12 5v14"/><path d="M5 12h14"/>',
  trash:'<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>',
  bookmark:'<path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4z"/>',
  external:'<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  youtube:'<path d="M22 12s0-3.2-.4-4.7a2.8 2.8 0 0 0-2-2C17.9 4.8 12 4.8 12 4.8s-5.9 0-7.6.5a2.8 2.8 0 0 0-2 2C2 8.8 2 12 2 12s0 3.2.4 4.7a2.8 2.8 0 0 0 2 2c1.7.5 7.6.5 7.6.5s5.9 0 7.6-.5a2.8 2.8 0 0 0 2-2c.4-1.5.4-4.7.4-4.7Z"/><path d="m10 15 5-3-5-3z"/>',
  spotify:'<circle cx="12" cy="12" r="10"/><path d="M6.8 9.4c3.6-1 7.3-.7 10.5 1.1M7.5 12.5c2.9-.8 5.8-.5 8.3.9M8.2 15.4c2.2-.6 4.4-.3 6.2.7"/>',
  github:'<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 6v-3.9a3.4 3.4 0 0 0-.9-2.7c3-.3 6.1-1.5 6.1-6.7a5.2 5.2 0 0 0-1.4-3.6 4.8 4.8 0 0 0-.1-3.6s-1.2-.4-3.9 1.4a13.4 13.4 0 0 0-7.1 0C5 1.1 3.8 1.5 3.8 1.5a4.8 4.8 0 0 0-.1 3.6A5.2 5.2 0 0 0 2.3 8.7c0 5.2 3.1 6.4 6.1 6.7a3.4 3.4 0 0 0-.9 2.7V22"/>'
  ,tiktok:'<path d="M14 3v12a4 4 0 1 1-4-4M14 3c1 4 3 5 6 5"/>'
  ,instagram:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>'
  ,reddit:'<ellipse cx="12" cy="15" rx="9" ry="6"/><path d="m13 9 2-6 5 1"/><circle cx="20" cy="4" r="2"/><circle cx="8" cy="14" r="1"/><circle cx="16" cy="14" r="1"/><path d="M8 18q4 2 8 0M3 11q-4-3-2 2M21 11q4-3 2 2"/>'
};

export function icon(name) {
  const paths = icons[name] || icons.code;
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
}
export function toast(message) {
  let stack = document.querySelector(".toast-stack");
  if (!stack) { stack = document.createElement("div"); stack.className = "toast-stack"; stack.setAttribute("role", "status"); document.body.append(stack); }
  const note = document.createElement("div"); note.className = "toast"; note.textContent = String(message); stack.append(note);
  window.setTimeout(() => note.remove(), 3300);
}
export function renderBadge(state) {
  const normalized = String(state || "unknown").toLowerCase().replace(/\s+/g, "-");
  const labels = { online:"Online", offline:"Offline", degraded:"Degraded", checking:"Checking", "requires-parameters":"Requires parameters", unknown:"Unknown" };
  const known = Object.hasOwn(labels, normalized) ? normalized : "unknown";
  return `<span class="badge badge-${known}">${escapeHtml(labels[known])}</span>`;
}
export function formatTime(iso) {
  if (!iso) return "Not checked";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not checked";
  return new Intl.DateTimeFormat(undefined, { dateStyle:"medium", timeStyle:"short" }).format(date);
}

const navItems = [
  ["Overview","/"], ["API reference","/docs"], ["Playground","/playground"],
  ["Guides","/guides"], ["Status","/status"]
];
function currentPage() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/index.html") return "/";
  if (path === "/docs" || path === "/docs.html" || path.startsWith("/docs/")) return "/docs";
  if (path === "/playground" || path === "/playground.html" || path.startsWith("/playground/")) return "/playground";
  if (path === "/status" || path === "/status.html") return "/status";
  if (path === "/guides" || path === "/guides.html") return "/guides";
  if (path === "/changelog" || path === "/changelog.html") return "/changelog";
  return path;
}
function hydrateShell() {
  const header = document.querySelector("[data-header]");
  const footer = document.querySelector("[data-footer]");
  const page = currentPage();
  const active = href => (href === page ? 'aria-current="page"' : "");
  if (header) header.innerHTML = `<header class="header"><div class="container nav"><a class="brand" href="/" aria-label="Lodearink API home"><span class="brand-mark">${icon("globe")}</span><span>Lodearink <span style="color:#91baff">API</span></span></a><nav class="nav-links" aria-label="Main navigation">${navItems.map(([label, href]) => `<a href="${href}" ${active(href)}>${label}</a>`).join("")}<a href="/changelog" ${active("/changelog")}>Changelog</a></nav><div class="nav-actions"><button class="button button-ghost search-trigger" type="button" data-open-search>${icon("search")}<span>Search routes</span><kbd>⌘ K</kbd></button><a class="button button-primary button-small" href="/playground">Try a request <span aria-hidden="true">↗</span></a><button class="icon-button mobile-trigger" type="button" data-mobile-toggle aria-label="Open navigation" aria-expanded="false">${icon("menu")}</button></div></div><nav class="mobile-menu" data-mobile-menu aria-label="Mobile navigation">${navItems.map(([label, href]) => `<a href="${href}" ${active(href)}>${label}</a>`).join("")}<a href="/changelog" ${active("/changelog")}>Changelog</a></nav></header>`;
  if (footer) footer.innerHTML = `<footer class="footer"><div class="container footer-inner"><div><a class="brand" href="/"><span class="brand-mark">${icon("globe")}</span><span>Lodearink <span style="color:#91baff">API</span></span></a><div style="margin-top:9px">A public workspace for API requests.</div></div><div class="footer-links"><a href="/docs">Reference</a><a href="/playground">Playground</a><a href="/status">Status</a><a href="/changelog">Changelog</a></div><span>API base <code style="font:11px var(--mono);color:#acbdd1">api.lodearink.name.ng</code></span></div></footer>`;
  document.querySelectorAll("[data-icon]").forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  if (!document.querySelector(".search-overlay")) {
    const overlay = document.createElement("div");
    overlay.className = "search-overlay"; overlay.id = "global-search"; overlay.innerHTML = `<section class="search-dialog" role="dialog" aria-modal="true" aria-label="Search API"><div class="search-input-wrap">${icon("search")}<input type="search" placeholder="Search routes and capabilities…" aria-label="Search routes and capabilities"><button class="icon-button" type="button" data-close-search aria-label="Close search">${icon("close")}</button></div><div class="search-results" role="listbox"><div class="empty">Search the API inventory</div></div></section>`;
    document.body.append(overlay);
  }
  wireShell();
  renderHomeInventory();
}
function openSearch() {
  const overlay = document.querySelector(".search-overlay");
  overlay?.classList.add("open");
  const input = overlay?.querySelector("input");
  window.setTimeout(() => input?.focus(), 20);
}
function wireShell() {
  const overlay = document.querySelector(".search-overlay");
  const input = overlay?.querySelector("input");
  let previousFocus;
  document.querySelectorAll('[data-open-search]').forEach(button=>button.addEventListener('click',()=>{previousFocus=button;}));
  const close = () => {overlay?.classList.remove('open');previousFocus?.focus();};
  document.querySelectorAll("[data-open-search]").forEach(button => button.addEventListener("click", openSearch));
  overlay?.querySelectorAll("[data-close-search]").forEach(button => button.addEventListener("click", close));
  overlay?.addEventListener("click", event => { if (event.target === overlay) close(); });
  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); previousFocus=document.activeElement;openSearch(); }
    if (event.key === "Escape") close();
    if(overlay?.classList.contains('open')){
      const links=[...overlay.querySelectorAll('.search-result')];
      if(['ArrowDown','ArrowUp'].includes(event.key)&&links.length){
        event.preventDefault();const index=links.indexOf(document.activeElement);
        links[(index+(event.key==='ArrowDown'?1:-1)+links.length)%links.length].focus();
      }
      if(event.key==='Enter'&&document.activeElement===input&&links.length){event.preventDefault();links[0].click();}
      if(event.key==='Tab'){
        const focusable=[...overlay.querySelectorAll('input,button,a[href]')];
        const first=focusable[0],last=focusable.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }
  });
  input?.addEventListener("input", () => renderSearchResults(input.value));
  const toggle = document.querySelector("[data-mobile-toggle]");
  toggle?.addEventListener("click", () => {
    const menu = document.querySelector("[data-mobile-menu]");
    const isOpen = menu?.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(Boolean(isOpen)));
  });
}
function renderSearchResults(query) {
  const target = document.querySelector(".search-results");
  if (!target) return;
  const term = query.trim().toLowerCase();
  if (!term) { target.innerHTML = `<div class="empty">Search the API inventory</div>`; return; }
  const matches = (Array.isArray(endpoints) ? endpoints : []).filter(item =>
    `${item.path} ${item.title} ${item.category} ${item.description}`.toLowerCase().includes(term)
  ).sort((a,b)=>{
    const score=item=>item.path.toLowerCase()===term?0:item.path.toLowerCase().startsWith(term)?1:2;
    return score(a)-score(b);
  }).slice(0, 24);
  target.innerHTML = matches.length ? matches.map(item => `<a class="search-result" role="option" href="${escapeHtml(endpointLink("docs", item.path))}"><span><strong>${escapeHtml(item.title || item.path)}</strong><br><small>${escapeHtml(item.path)} · ${escapeHtml(item.category)}</small></span>${icon("arrow-right")}</a>`).join("") : `<div class="empty">No matching endpoints. Try a service name or route.</div>`;
}
function renderHomeInventory() {
  // Homepage content is owned by home.js so it cannot be overwritten by shell hydration.
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hydrateShell, { once:true });
else hydrateShell();
