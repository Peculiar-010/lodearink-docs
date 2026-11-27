// Read-only crawler checks. No requests are sent to API operations.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function inspectPng(bytes){
  assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a','Not a PNG');
  const parts=[];let offset=8,width,height,channels,ended=false;
  while(offset+12<=bytes.length){
    const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);
    assert.ok(offset+12+length<=bytes.length,'Truncated PNG chunk');
    const chunk=bytes.subarray(offset+8,offset+8+length);
    if(type==='IHDR'){
      assert.equal(length,13);width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);
      assert.equal(width,1200);assert.equal(height,630);
      assert.equal(chunk[8],8,'Expected 8-bit color');
      assert.ok([2,6].includes(chunk[9]),'Expected RGB or RGBA');
      channels=chunk[9]===6?4:3;
      assert.equal(chunk[10],0);assert.equal(chunk[11],0);assert.equal(chunk[12],0);
    }
    if(type==='IDAT')parts.push(chunk);
    if(type==='IEND'){ended=true;break;}
    offset+=12+length;
  }
  assert.ok(ended&&channels&&parts.length,'Incomplete PNG');
  const stride=width*channels+1;
  const pixels=inflateSync(Buffer.concat(parts),{maxOutputLength:stride*height});
  assert.equal(pixels.length,stride*height,'Incomplete pixel data');
  for(let row=0;row<height;row++)assert.ok(pixels[row*stride]<=4,'Invalid PNG row filter');
  return {width,height};
}

export function sharingTags(html){
  const meta=new Map();let canonical,favicon;
  for(const match of html.matchAll(/<(meta|link)\b[^>]*>/gi)){
    const attrs=Object.fromEntries([...match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),m[2]??m[3]]));
    if(match[1].toLowerCase()==='meta')meta.set(attrs.property||attrs.name,attrs.content);
    if(match[1].toLowerCase()==='link'&&attrs.rel==='canonical')canonical=attrs.href;
    if(match[1].toLowerCase()==='link'&&attrs.rel==='icon'&&attrs.type==='image/svg+xml')favicon=attrs.href;
  }
  return {meta,canonical,favicon};
}

export async function checkSharing({expectedOrigin,fetchOrigin=expectedOrigin,fetcher=fetch}){
  const paths=['/','/docs','/playground','/status','/usage','/guides','/changelog','/docs/visionai/qwen/analyze','/playground/visionai/qwen/analyze'];
  const headers={'User-Agent':'facebookexternalhit/1.1'};
  const seen=new Set();
  for(const path of paths){
    const response=await fetcher(new URL(path,fetchOrigin),{headers,signal:AbortSignal.timeout(20000)});
    assert.equal(response.status,200,`${path}: HTTP ${response.status}`);
    const html=await response.text();
    const {meta,canonical,favicon}=sharingTags(html);
    assert.equal(canonical,expectedOrigin+path,`${path}: incorrect canonical URL`);
    assert.equal(favicon,expectedOrigin+'/favicon.svg',`${path}: incorrect favicon URL`);
    assert.equal(meta.get('robots'),'index,follow,max-image-preview:large',`${path}: page is not indexable`);
    const schemas=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map(match=>JSON.parse(match[1]));
    assert.ok(schemas.some(schema=>schema['@type']==='WebSite'&&schema.url===expectedOrigin+'/'),`${path}: missing WebSite schema`);
    assert.ok(schemas.some(schema=>schema['@type']==='WebPage'&&schema.url===expectedOrigin+path),`${path}: missing WebPage schema`);
    assert.equal(meta.get('og:url'),canonical,`${path}: incorrect Open Graph URL`);
    assert.ok(meta.get('og:title'));assert.ok(meta.get('og:description'));
    const image=new URL(meta.get('og:image'));
    assert.equal(image.origin,expectedOrigin,`${path}: sharing image uses the wrong host`);
    assert.ok(image.pathname.startsWith('/assets/og/'));
    assert.equal(meta.get('og:image:secure_url'),image.href);
    assert.equal(meta.get('twitter:image'),image.href);
    assert.equal(meta.get('twitter:card'),'summary_large_image');
    assert.equal(meta.get('og:image:width'),'1200');assert.equal(meta.get('og:image:height'),'630');
    if(!seen.has(image.href)){
      const file=await fetcher(new URL(image.pathname,fetchOrigin),{headers,signal:AbortSignal.timeout(20000)});
      assert.equal(file.status,200,`${image.pathname}: image HTTP ${file.status}`);
      assert.match(file.headers.get('content-type')||'',/^image\/png\b/);
      inspectPng(Buffer.from(await file.arrayBuffer()));seen.add(image.href);
    }
    console.log(`PASS ${path}: metadata and sharing PNG`);
  }
  const icon=await fetcher(new URL('/favicon.svg',fetchOrigin),{headers,signal:AbortSignal.timeout(20000)});
  assert.equal(icon.status,200,`/favicon.svg: HTTP ${icon.status}`);
  assert.match(icon.headers.get('content-type')||'',/^image\/svg\+xml\b/i);
  assert.match(await icon.text(),/<svg\b/i,'Favicon response is not SVG');
  console.log('PASS /favicon.svg: linked and served');
  const robotsResponse=await fetcher(new URL('/robots.txt',fetchOrigin),{headers,signal:AbortSignal.timeout(20000)});
  assert.equal(robotsResponse.status,200,`/robots.txt: HTTP ${robotsResponse.status}`);
  assert.match(robotsResponse.headers.get('content-type')||'',/^text\/plain\b/i);
  const robots=await robotsResponse.text();
  assert.match(robots,/^User-agent: \*\nAllow: \/$/m);
  for(const bot of ['Googlebot','Google-Extended','Bingbot','OAI-SearchBot','GPTBot','PerplexityBot','ClaudeBot','Claude-SearchBot']){
    assert.ok(robots.includes(`User-agent: ${bot}\nAllow: /`),`/robots.txt: ${bot} is not allowed`);
  }
  assert.ok(robots.includes(`Sitemap: ${expectedOrigin}/sitemap.xml`));
  const sitemapResponse=await fetcher(new URL('/sitemap.xml',fetchOrigin),{headers,signal:AbortSignal.timeout(20000)});
  assert.equal(sitemapResponse.status,200,`/sitemap.xml: HTTP ${sitemapResponse.status}`);
  assert.match(sitemapResponse.headers.get('content-type')||'',/xml/i);
  const sitemap=await sitemapResponse.text();
  assert.match(sitemap,/^<\?xml version="1\.0"/);
  const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]);
  assert.ok(urls.length>=400,'sitemap is missing generated endpoint pages');
  for(const url of urls)assert.equal(new URL(url).origin,expectedOrigin,`sitemap contains a noncanonical host: ${url}`);
  assert.ok(!urls.includes(expectedOrigin+'/404'));
  const llmsResponse=await fetcher(new URL('/llms.txt',fetchOrigin),{headers,signal:AbortSignal.timeout(20000)});
  assert.equal(llmsResponse.status,200,`/llms.txt: HTTP ${llmsResponse.status}`);
  const llms=await llmsResponse.text();
  assert.ok(llms.includes('# Lodearink API'));
  assert.ok(llms.includes(`(${expectedOrigin}/sitemap.xml)`));
  console.log(`PASS /robots.txt, /sitemap.xml (${urls.length} pages), and /llms.txt`);
  return {pages:paths.length,images:seen.size,indexedUrls:urls.length};
}

async function main(){
  const site=JSON.parse(await readFile(new URL('../site.config.json',import.meta.url),'utf8'));
  const expectedOrigin=new URL(site.url).origin;
  const args=process.argv.slice(2);
  assert.ok(args.length===0||args.length===2&&args[0]==='--preview','Usage: node scripts/check-sharing.mjs [--preview URL]');
  const fetchOrigin=args.length?new URL(args[1]).origin:expectedOrigin;
  console.log(args.length?`Checking PREVIEW delivery at ${fetchOrigin}; metadata must use ${expectedOrigin}. This does not verify the published update.`:`Checking PUBLISHED pages and images at ${expectedOrigin}.`);
  const result=await checkSharing({expectedOrigin,fetchOrigin});
  console.log(`Verified ${result.pages} pages and ${result.images} sharing images.`);
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().catch(error=>{console.error('Sharing check failed:',error.message);process.exitCode=1;});
}
