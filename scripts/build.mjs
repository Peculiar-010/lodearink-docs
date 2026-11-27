import {readFile, writeFile, mkdir, cp, rm, access} from 'node:fs/promises';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Resvg} from '@resvg/resvg-js';
import {createOgSvg} from './og-template.mjs';
import {endpointLink} from '../js/routes.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const OUT=join(ROOT,'dist');
const site=JSON.parse(await readFile(join(ROOT,'site.config.json'),'utf8'));
const catalog=JSON.parse(await readFile(join(ROOT,'data/catalog.json'),'utf8'));
const siteUrl=new URL(site.url);
if(siteUrl.protocol!=='https:'||siteUrl.username||siteUrl.password||siteUrl.pathname!=='/'||siteUrl.search||siteUrl.hash){
  throw new Error('site.config.json url must be a public HTTPS origin, without a path, credentials, query or fragment.');
}
const origin=siteUrl.origin;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pages=[
  ['index','/','Lodearink API — Build more. Integrate faster.',site.description],
  ['docs','/docs','API reference — Lodearink API','Explore API endpoints, request parameters, examples and availability.'],
  ['playground','/playground','API playground — Lodearink API','Build requests, inspect live responses and copy client code.'],
  ['status','/status','API status — Lodearink API','Endpoint availability from timestamped checks of the live API.'],
  ['usage','/usage','API usage — Lodearink API','Shared API request volumes, response measurements and sampled activity.'],
  ['guides','/guides','Developer guides — Lodearink API','Practical guides to requests, uploads, media and asynchronous tasks.'],
  ['changelog','/changelog','Changelog — Lodearink API','Updates to the Lodearink API documentation.'],
  ['404','/404','Page not found — Lodearink API','Return to the API reference or open the playground.'],
];
// A removed endpoint must not survive as an old generated page.
await rm(OUT,{recursive:true,force:true});
await mkdir(OUT,{recursive:true});
for(const directory of ['js','css','data'])await cp(join(ROOT,directory),join(OUT,directory),{recursive:true});
await cp(join(ROOT,'favicon.svg'),join(OUT,'favicon.svg'));
await mkdir(join(OUT,'assets/og'),{recursive:true});
const fontFiles=[join(ROOT,'assets/fonts/DejaVuSans.ttf'),join(ROOT,'assets/fonts/DejaVuSansMono.ttf')];
for(const path of fontFiles)await access(path);
const manifest=[];
async function image(key,model){
  const svg=createOgSvg(model);
  const revision=createHash('sha256').update(svg).digest('hex').slice(0,10);
  const filename=`${key}-${revision}.png`;
  const target=join(OUT,'assets/og',filename);
  try{await access(target);}catch{
    const rendered=new Resvg(svg,{font:{fontFiles,loadSystemFonts:false,defaultFontFamily:'DejaVu Sans'},fitTo:{mode:'width',value:1200}});
    await writeFile(target,rendered.render().asPng());
  }
  return '/assets/og/'+filename;
}
function metadata(html,{title,description,path,image,alt}){
  const url=origin+path;
  const tags=`<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${escape(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Lodearink API">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${escape(url)}">
<meta property="og:image" content="${escape(origin+image)}">
<meta property="og:image:secure_url" content="${escape(origin+image)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escape(alt||title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(description)}">
<meta name="twitter:image" content="${escape(origin+image)}">`;
  return html.replace(/<title>[\s\S]*?<\/title>/,'<title>'+escape(title)+'</title>')
    .replace(/<meta name="description"[^>]*>/g,'')
    .replace('</head>',tags+'\n</head>');
}
async function pageFile(path,html){
  const target=join(OUT,path==='/'?'index.html':path.replace(/^\//,'')+'.html');
  await mkdir(dirname(target),{recursive:true});await writeFile(target,html);
}
const templates={};
for(const [name,path,title,description] of pages){
  const html=await readFile(join(ROOT,name+'.html'),'utf8');
  templates[name]=html;
  const og=await image(name,{title:name==='index'?'Build more.\nIntegrate faster.':title.split(' — ')[0],description,path,category:'Lodearink API',count:catalog.endpoints.length});
  await pageFile(path,metadata(html,{title,description,path,image:og}));
  manifest.push({path,image:og,title});
}
for(const endpoint of catalog.endpoints){
  const key='endpoint-'+createHash('sha256').update(endpoint.path).digest('hex').slice(0,14);
  const checked=endpoint.status.checkedAt?new Date(endpoint.status.checkedAt).toISOString().slice(0,16).replace('T',' ')+' UTC':'Not checked';
  const og=await image(key,{title:endpoint.title,description:endpoint.description,path:endpoint.path,category:endpoint.category,status:endpoint.status.state,methods:endpoint.methods,checkedAt:checked});
  for(const page of ['docs','playground']){
    const path=endpointLink(page,endpoint.path);
    const status=endpoint.status.state.replaceAll('-',' ');
    const title=`${endpoint.path} — ${page==='docs'?'API reference':'Playground'} | Lodearink API`;
    const description=`${endpoint.service||endpoint.category}. ${endpoint.methods.join(' / ')||'Method unconfirmed'}. Status: ${status}, checked ${checked}. ${page==='docs'?'Request parameters and examples.':'Send a live request.'}`;
    let html=metadata(templates[page],{title,description,path,image:og,alt:`${endpoint.path} · ${status} · ${checked}`});
    if(page==='docs'){
      const intro=`<div data-static-reference><div class="eyebrow">${escape(endpoint.category)}</div><h2>${escape(endpoint.path)}</h2><p>${escape(endpoint.description)}</p><p>${escape(endpoint.methods.join(' / '))} · ${escape(status)} · Checked ${escape(checked)}</p><a href="${escape(endpointLink('playground',endpoint.path))}">Open playground</a></div>`;
      html=html.replace(/(<section id="endpoint-detail"[^>]*>)[\s\S]*?(<\/section>)/,'$1'+intro+'$2');
    }
    await pageFile(path,html);manifest.push({path,image:og,title,endpoint:endpoint.path,status:endpoint.status});
  }
}
await writeFile(join(OUT,'share-manifest.json'),JSON.stringify({origin,generatedAt:new Date().toISOString(),pages:manifest},null,2));
await writeFile(join(OUT,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(join(OUT,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+manifest.filter(p=>p.path!='/404').map(p=>`<url><loc>${escape(origin+p.path)}</loc></url>`).join('')+'</urlset>');
console.log(`Built ${manifest.length} pages and ${catalog.endpoints.length+pages.length} sharing images in dist/.`);
