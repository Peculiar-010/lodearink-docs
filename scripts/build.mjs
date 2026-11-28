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
  ['index','/','Lodearink API | Developer Documentation and Playground','Explore the Lodearink developer API: browse documented HTTP routes, inspect request examples, and use the interactive API playground.'],
  ['docs','/docs','Lodearink API Reference | Browse Documented Endpoints','Browse the Lodearink API endpoint catalog. Review methods, parameters, example request URLs, and catalog status snapshots.'],
  ['playground','/playground','API playground | Lodearink API','Build requests, inspect live responses and copy client code.'],
  ['status','/status','API status | Lodearink API','Endpoint availability from timestamped checks of the live API.'],
  ['usage','/usage','API usage | Lodearink API','Shared API request volumes, response measurements and sampled activity.'],
  ['guides','/guides','Developer guides | Lodearink API','Practical guides to requests, uploads, media and asynchronous tasks.'],
  ['changelog','/changelog','Changelog | Lodearink API','Updates to the Lodearink API documentation.'],
  ['404','/404','Page not found | Lodearink API','Return to the API reference or open the playground.'],
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
  const canonicalPath=path.startsWith('/playground/')?path.replace(/^\/playground\//,'/docs/'):path;
  const url=origin+canonicalPath;
  const robots=path==='/404'||canonicalPath!==path?'noindex,follow':'index,follow,max-image-preview:large';
  const brandId=origin+'/#brand';
  const brandSchema={
    '@context':'https://schema.org',
    '@type':'Brand',
    '@id':brandId,
    name:'Lodearink',
    alternateName:'Lodearink API',
    url:origin+'/'
  };
  const websiteSchema={
    '@context':'https://schema.org',
    '@type':'WebSite',
    '@id':origin+'/#website',
    name:site.name,
    alternateName:'Lodearink developer API documentation',
    url:origin+'/',
    description:site.description,
    inLanguage:'en',
    about:{'@id':brandId}
  };
  const pageSchema={
    '@context':'https://schema.org',
    '@type':'WebPage',
    name:title,
    description,
    url,
    inLanguage:'en',
    isPartOf:{'@id':origin+'/#website'},
    about:{'@id':brandId}
  };
  const schemas=[brandSchema,websiteSchema,pageSchema];
  if(path==='/docs'){
    const listSchema={
      '@context':'https://schema.org',
      '@type':'ItemList',
      '@id':origin+'/docs#endpoint-catalog',
      name:'Lodearink API endpoint reference',
      numberOfItems:catalog.endpoints.length,
      itemListElement:catalog.endpoints.map((endpoint,index)=>({
        '@type':'ListItem',
        position:index+1,
        name:`${endpoint.service||endpoint.category}: ${endpoint.title||endpoint.path} (${endpoint.path})`,
        url:origin+endpointLink('docs',endpoint.path)
      }))
    };
    pageSchema.mainEntity={'@id':origin+'/docs#endpoint-catalog'};
    schemas.push(listSchema);
  }
  const jsonLd=value=>JSON.stringify(value).replaceAll('<','\\u003c');
  const tags=`<meta name="description" content="${escape(description)}">
<meta name="robots" content="${robots}">
<link rel="icon" type="image/svg+xml" href="${escape(origin+'/favicon.svg')}">
<link rel="canonical" href="${escape(url)}">
${schemas.map(schema=>`<script type="application/ld+json">${jsonLd(schema)}</script>`).join('\n')}
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
const categories=[...new Set(catalog.endpoints.map(endpoint=>endpoint.category))].sort();
function staticHomeCategories(){
  return categories.map(category=>{
    const count=catalog.endpoints.filter(endpoint=>endpoint.category===category).length;
    return `<a class="panel category-card" href="/docs?category=${escape(encodeURIComponent(category))}"><span class="category-icon" aria-hidden="true">API</span><h3>${escape(category)}</h3><p>${count} documented endpoint${count===1?'':'s'}</p></a>`;
  }).join('');
}
function staticFeaturedEndpoints(){
  const paths=['/health','/search','/npm/package','/visionai/qwen/analyze','/ytdl/info','/football/leagues'];
  return paths.map(path=>catalog.endpoints.find(endpoint=>endpoint.path===path)).filter(Boolean).map(endpoint=>{
    const state=endpoint.status.state.replaceAll('-',' ');
    return `<a class="panel featured-item" href="${escape(endpointLink('docs',endpoint.path))}"><div><strong>${escape(endpoint.category)}</strong><code>${escape(endpoint.path)}</code></div><div class="featured-side"><span class="badge badge-${escape(endpoint.status.state)}">${escape(state)}</span></div></a>`;
  }).join('');
}
function staticEndpointList(){
  let previous='';
  return catalog.endpoints.map(endpoint=>{
    const heading=previous!==endpoint.category?`<div class="endpoint-group-label">${escape(endpoint.category)}</div>`:'';
    previous=endpoint.category;
    return `${heading}<a class="endpoint-row" href="${escape(endpointLink('docs',endpoint.path))}" data-path="${escape(endpoint.path)}"><span class="method">${escape(endpoint.methods.join('/')||'Method unconfirmed')}</span><code>${escape(endpoint.path)}</code><span class="mini-status ${escape(endpoint.status.state)}" aria-label="${escape(endpoint.status.state)}"></span></a>`;
  }).join('');
}
function staticEndpointDetail(endpoint,checked){
  const service=endpoint.service||endpoint.category;
  const methods=endpoint.methods.length?endpoint.methods:[endpoint.sample.method||'GET'];
  const examples=methods.map(method=>{
    const sample=endpoint.methodSamples?.[method]||(method===endpoint.sample.method?endpoint.sample:null);
    return sample?.url?`<li><span class="method">${escape(method)}</span> <code>${escape(sample.url)}</code></li>`:`<li><span class="method">${escape(method)}</span> <span>Request example not recorded.</span></li>`;
  }).join('');
  const rows=endpoint.parameters.length?endpoint.parameters.map(parameter=>{
    const required=parameter.required===true?'Required':parameter.required===false?'Optional':'Not specified';
    return `<tr><td><code>${escape(parameter.name)}</code></td><td>${escape(parameter.in)}</td><td>${required}</td><td>${escape(parameter.example||'No example recorded')}</td></tr>`;
  }).join(''):'<tr><td colspan="4">No request parameters are documented.</td></tr>';
  const latest=[...endpoint.evidence].reverse().find(evidence=>evidence.response)||endpoint.evidence.at(-1);
  const recordedStatus=escape(endpoint.status.state.replaceAll('-',' '));
  const evidence=latest?`<p>Recorded status: ${recordedStatus}. Evidence: HTTP ${escape(latest.httpStatus||'status not recorded')}${latest.contentType?` · ${escape(latest.contentType)}`:''}; checked ${escape(checked)}. This is a recorded check, not a guarantee of current availability.</p>`:`<p>Recorded status: ${recordedStatus}. No response evidence is recorded for this endpoint.</p>`;
  return `<div data-static-reference><div class="eyebrow">Lodearink API · ${escape(endpoint.category)} · ${escape(service)}</div><h2>${escape(endpoint.title||service)} endpoint</h2><p>${escape(endpoint.description)}</p><p><strong>API base URL:</strong> <code>${escape(catalog.baseUrl)}</code></p><p><strong>Endpoint path:</strong> <code>${escape(endpoint.path)}</code></p><h3>Request methods and example URLs</h3><ul>${examples}</ul><h3>Parameters</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Location</th><th>Requirement</th><th>Example</th></tr></thead><tbody>${rows}</tbody></table></div><h3>Catalog status</h3>${evidence}<p><a href="${escape(endpointLink('playground',endpoint.path))}">Open this Lodearink API endpoint in the playground</a></p></div>`;
}
async function pageFile(path,html){
  const target=join(OUT,path==='/'?'index.html':path.replace(/^\//,'')+'.html');
  await mkdir(dirname(target),{recursive:true});await writeFile(target,html);
}
const templates={};
for(const [name,path,title,description] of pages){
  let html=await readFile(join(ROOT,name+'.html'),'utf8');
  if(name==='index'){
    html=html.replace('<!--STATIC_CATEGORY_CARDS-->',staticHomeCategories())
      .replace('<!--STATIC_FEATURED_ENDPOINTS-->',staticFeaturedEndpoints())
      .replace('<!--STATIC_API_BASE_URL-->',escape(catalog.baseUrl));
  }
  if(name==='docs'){
    const initialEndpoint=catalog.endpoints.find(endpoint=>endpoint.path==='/health')||catalog.endpoints[0];
    const initialChecked=initialEndpoint.status.checkedAt?new Date(initialEndpoint.status.checkedAt).toISOString().slice(0,16).replace('T',' ')+' UTC':'Not checked';
    html=html.replace('<!--STATIC_ENDPOINT_LIST-->',staticEndpointList())
      .replace('<!--STATIC_ENDPOINT_DETAIL-->',staticEndpointDetail(initialEndpoint,initialChecked))
      .replace('<!--STATIC_API_BASE_URL-->',escape(catalog.baseUrl))
      .replace('<!--STATIC_ENDPOINT_COUNT-->',String(catalog.endpoints.length))
      .replace('<!--STATIC_CATEGORY_COUNT-->',String(categories.length));
  }
  templates[name]=html;
  const og=await image(name,{title:name==='index'?'Build more.\nIntegrate faster.':title.split(' | ')[0],description,path,category:'Lodearink API',count:catalog.endpoints.length});
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
    const service=endpoint.service||endpoint.category;
    const title=`${endpoint.path} | ${service} | Lodearink API`;
    const description=`Lodearink API ${endpoint.methods.join(' / ')||'HTTP'} ${endpoint.path}: ${service} endpoint. View parameters, request examples, and the catalog status snapshot.`;
    let html=metadata(templates[page],{title,description,path,image:og,alt:`${endpoint.path} · ${status} · ${checked}`});
    if(page==='docs'){
      const detail=staticEndpointDetail(endpoint,checked);
      html=html.replace(/(<section id="endpoint-detail"[^>]*>)[\s\S]*?(<\/section>)/,'$1'+detail+'$2');
    }
    await pageFile(path,html);manifest.push({path,image:og,title,endpoint:endpoint.path,status:endpoint.status});
  }
}
await writeFile(join(OUT,'share-manifest.json'),JSON.stringify({origin,generatedAt:new Date().toISOString(),pages:manifest},null,2));
const crawlerRules=[
  ['*'],
  ['Googlebot'],
  ['Google-Extended'],
  ['Bingbot'],
  ['Applebot'],
  ['OAI-SearchBot'],
  ['GPTBot'],
  ['ChatGPT-User'],
  ['PerplexityBot'],
  ['ClaudeBot'],
  ['Claude-SearchBot']
].map(([agent])=>`User-agent: ${agent}\nAllow: /`).join('\n\n');
await writeFile(join(OUT,'robots.txt'),`${crawlerRules}\n\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(join(OUT,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+manifest.filter(p=>p.path!='/404'&&!p.path.startsWith('/playground/')).map(p=>`<url><loc>${escape(origin+p.path)}</loc></url>`).join('')+'</urlset>');
const markdownText=value=>String(value??'').replace(/\s+/g,' ').trim().replace(/([\\[\]])/g,'\\$1');
const llms=[
  '# Lodearink API documentation',
  '',
  `> ${site.description}`,
  '',
  '## Product identity',
  '- Product: Lodearink API, a developer-facing HTTP API.',
  `- Documentation and interactive playground: ${origin}/`,
  `- API base URL: ${catalog.baseUrl}`,
  `- The reference documents ${catalog.endpoints.length} endpoints in ${categories.length} categories.`,
  '- Lodearink is the API name; this site is its API reference, not a logistics API or a general-purpose facts database.',
  '',
  '## Start here',
  `- [Overview](${origin}/)`,
  `- [API reference](${origin}/docs)`,
  `- [Interactive playground](${origin}/playground)`,
  `- [Developer guides](${origin}/guides)`,
  `- [API status](${origin}/status)`,
  `- [Changelog](${origin}/changelog)`,
  '',
  '## API categories',
  ...categories.map(category=>`- ${markdownText(category)}: ${catalog.endpoints.filter(endpoint=>endpoint.category===category).length} documented endpoints`),
  '',
  `## Complete endpoint index`,
  ...catalog.endpoints.map(endpoint=>`- [${markdownText(endpoint.service||endpoint.category)}: ${markdownText(endpoint.title||endpoint.path)}](${origin+endpointLink('docs',endpoint.path)}): ${markdownText(endpoint.description)}`),
  '',
  '## Machine-readable discovery',
  `- [XML sitemap](${origin}/sitemap.xml)`,
  `- [Crawler rules](${origin}/robots.txt)`,
  ''
].join('\n');
await writeFile(join(OUT,'llms.txt'),llms);
console.log(`Built ${manifest.length} pages and ${catalog.endpoints.length+pages.length} sharing images in dist/.`);
