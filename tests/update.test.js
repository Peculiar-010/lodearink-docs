import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {taskFollowup} from '../js/task-followup.js';
import {routeSlug,endpointLink,matchEndpointLocation} from '../js/routes.js';
import {createOgSvg} from '../scripts/og-template.mjs';
const data=JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8'));
const inventory=data.endpoints;
test('all endpoint links use unique extensionless paths',()=>{
  for(const page of ['docs','playground']){
    const links=inventory.map(e=>endpointLink(page,e.path));
    assert.equal(new Set(links).size,inventory.length);
    for(const e of inventory){
      const pathname=endpointLink(page,e.path);
      assert.ok(!pathname.includes('.html'));
      assert.equal(matchEndpointLocation(inventory,page,{pathname,search:''})?.path,e.path);
    }
  }
  assert.equal(routeSlug('/reddit/r/:subreddit'),'reddit/r/subreddit');
  assert.equal(matchEndpointLocation(inventory,'docs',{pathname:'/docs',search:'?endpoint=%2Fhealth'}).path,'/health');
});
test('task cards fill returned IDs and preserve the exact status URL',()=>{
  const value=taskFollowup({task_id:'real-job-id',status:'queued',status_url:'/aivideo/wan/status'},'https://api.lodearink.name.ng/aivideo/wan',inventory);
  assert.equal(value.id,'real-job-id');assert.equal(new URL(value.url).searchParams.get('task_id'),'real-job-id');assert.equal(value.done,false);
  const provided='https://api.lodearink.name.ng/image/z-turbo/status?task_id=id%2B123&mode=short';
  assert.equal(taskFollowup({task_id:'id+123',status_url:provided},'https://api.lodearink.name.ng/image/z-turbo/submit',inventory).url,provided);
});
test('task status can be requested repeatedly, even when its runtime URL is not in the catalog',()=>{
  const pending=taskFollowup({task_id:'job-7',status:'processing'},'https://api.lodearink.name.ng/image/z-turbo/status?task_id=job-7',inventory);
  assert.ok(pending);assert.equal(pending.done,false);
  const done=taskFollowup({task_id:'job-7',status:'success',image_url:'https://example.com/result.png'},pending.url,inventory);
  assert.equal(done.done,true);
  const failed=taskFollowup({task_id:'job-7',status:'failed'},pending.url,inventory);
  assert.equal(failed.done,true);
});
test('task cards reject foreign origins, credentials, scripts and missing identifiers',()=>{
  for(const url of ['https://evil.example/status','javascript:alert(1)','https://name:password@api.lodearink.name.ng/status']){
    assert.equal(taskFollowup({task_id:'1',status_url:url},'https://api.lodearink.name.ng/aivideo/wan',inventory),null);
  }
  assert.equal(taskFollowup({status:'queued'},'https://api.lodearink.name.ng/aivideo/wan',inventory),null);
});
test('the sharing renderer escapes markup and uses only supplied availability',()=>{
  const svg=createOgSvg({title:'<script>alert("x")</script>',path:'/health',status:'offline',checkedAt:'2026-11-27 08:00 UTC'});
  assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('offline'));assert.ok(svg.includes('2026-11-27'));
  assert.ok(svg.includes('width="1200"'));assert.ok(svg.includes('height="630"'));
});
test('built endpoint HTML exposes individual social metadata without JavaScript',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../dist/share-manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.pages.length,inventory.length*2+7);
  for(const page of manifest.pages){
    const filename=page.path==='/'?'index':page.path.slice(1);
    const html=readFileSync(new URL('../dist/'+filename+'.html',import.meta.url),'utf8');
    assert.ok(html.includes('property="og:image"'));assert.ok(html.includes('name="twitter:card"'));
    assert.ok(html.includes(manifest.origin+page.path));
    const png=new URL('../dist'+page.image,import.meta.url);
    assert.ok(existsSync(png));
    const buffer=readFileSync(png);assert.equal(buffer.toString('hex',0,8),'89504e470d0a1a0a');
    assert.equal(buffer.readUInt32BE(16),1200);assert.equal(buffer.readUInt32BE(20),630);
    if(page.endpoint){assert.ok(html.includes(page.endpoint));assert.ok(html.includes('Status: '+page.status.state.replaceAll('-',' ')));}
  }
});
