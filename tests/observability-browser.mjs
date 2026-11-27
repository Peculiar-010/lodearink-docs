import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const base=process.env.REPLIT_DEV_DOMAIN?`https://${process.env.REPLIT_DEV_DOMAIN}`:'http://127.0.0.1:5000';
const browser=await chromium.launch({executablePath:execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[],hosts=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>hosts.push(new URL(request.url()).hostname));
const now=new Date().toISOString();
const rows=[
  {path:'/health',requests:10,successes:9,clientErrors:1,serverErrors:0,avgResponseMs:21,lastSeenAt:now,lastStatus:200},
  {path:'/search',requests:5,successes:5,clientErrors:0,serverErrors:0,avgResponseMs:35,lastSeenAt:now,lastStatus:200}
];
const windowData={from:new Date(Date.now()-3600_000).toISOString(),to:now,requests:15,successes:14,clientErrors:1,serverErrors:0,avgResponseMs:25.67,endpoints:rows,timeline:[]};
const snapshot={
  schemaVersion:1,generatedAt:now,collectionStartedAt:now,
  usage:{state:'ready',updatedAt:now,sampled:true,maxSampleInterval:2,error:null,windows:{'1h':windowData,'24h':windowData,'7d':windowData},recent:[{time:now,endpoint:'/health',method:'GET',status:200,responseMs:18,sampleInterval:2}]},
  monitoring:{state:'ready',updatedAt:now,intervalSeconds:7200,endpoints:[
    {path:'/health',coverage:'active',state:'online',lastCheckAt:now,nextCheckAt:new Date(Date.now()+7200_000).toISOString(),durationMs:22,httpStatus:200,reason:'checked',history:[{at:now,state:'online',status:200,responseMs:22,reason:'checked'}],observedAvailability:{percent:100,successful:1,unsuccessful:0,excluded:0,sampleCount:1,from:now,to:now},passive:{lastSeenAt:now,lastStatus:200,requests1h:10,successRate1h:90,avgResponseMs1h:21}},
    {path:'/aivideo/wan',coverage:'passive',state:'unknown',lastCheckAt:null,nextCheckAt:null,durationMs:null,httpStatus:null,reason:'passive-only',history:[],observedAvailability:{percent:null,successful:0,unsuccessful:0,excluded:0,sampleCount:0,from:null,to:null},passive:null}
  ]}
};
await page.addInitScript(({snapshot})=>{
  const original=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.pathname==='/data/observability-config.json')return Response.json({snapshotUrl:'https://monitor.example/v1/snapshot'});
    if(url.href==='https://monitor.example/v1/snapshot')return Response.json(snapshot);
    return original(input,init);
  };
},{snapshot});
try{
  await page.goto(base+'/usage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#usage-metrics')?.textContent.includes('15'));
  assert.match(await page.locator('#usage-metrics').innerText(),/15/);
  assert.match(await page.locator('#usage-endpoints').innerText(),/\/health/);
  assert.match(await page.locator('#usage-recent').innerText(),/1:2/);
  assert.match(await page.locator('#usage-chart').innerText(),/No observed request-volume samples/);
  for(const width of [390,768,1280]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Usage overflow at ${width}px`);
  }
  await page.goto(base+'/status',{waitUntil:'networkidle'});
  await page.waitForSelector('.obs-status-item');
  assert.match(await page.locator('#status-counts').innerText(),/1 active checks/);
  assert.match(await page.locator('#status-counts').innerText(),/1 passive only/);
  assert.match(await page.locator('.obs-status-list').innerText(),/HTTP 200/);
  for(const width of [390,768,1280]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Status overflow at ${width}px`);
  }
  await page.goto(base+'/monitoring-setup',{waitUntil:'networkidle'});
  assert.match(await page.locator('main').innerText(),/Keep the API repository private/);
  assert.ok(hosts.every(host=>host==='127.0.0.1'||host==='localhost'||host===new URL(base).hostname),`Unexpected outbound request: ${hosts.join(', ')}`);
  assert.deepEqual(errors,[]);
  console.log('PASS monitoring pages render setup and shared snapshots responsively without external API requests');
}finally{await browser.close();}
