import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, mkdirSync} from 'node:fs';
const base=process.env.REPLIT_DEV_DOMAIN?`https://${process.env.REPLIT_DEV_DOMAIN}`:'http://127.0.0.1:5000';
const executablePath=execFileSync('which',['chromium'],{encoding:'utf8'}).trim();
const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const es=JSON.parse(readFileSync('data/catalog.json','utf8')).endpoints;
const check=async(name,fn)=>{await fn();console.log('PASS',name);};
try {
  await check('all main pages load without runtime errors',async()=>{
    for(const path of ['/','/docs','/playground','/status','/usage','/monitoring-setup','/guides','/changelog','/404']){
      const res=await page.goto(base+path,{waitUntil:'networkidle'});assert.equal(res.status(),200);
      await page.waitForSelector('.header');assert.ok(await page.locator('main').innerText());
    }
  });
  await check('all endpoint detail pages and categories render real catalog data',async()=>{
    await page.goto(base+'/docs',{waitUntil:'networkidle'});
    const observed=await page.evaluate(paths=>{
      let n=0;
      for(const path of paths){
        history.replaceState({},'','/docs'+path.replaceAll(':',''));
        window.dispatchEvent(new PopStateEvent('popstate'));
        if(!document.querySelector('#endpoint-detail .detail-path').textContent.includes(path))throw Error(path);
        if(!document.querySelector('#endpoint-detail .request-url').textContent.startsWith('https://api.lodearink.name.ng/'))throw Error(path);
        n++;
      }
      return n;
    },es.map(e=>e.path));assert.equal(observed,es.length);
    const categories=await page.locator('#docs-category option').allTextContents();
    for(const category of categories.slice(1)){await page.selectOption('#docs-category',{label:category});assert.ok(await page.locator('#endpoint-list [data-path]').count());}
    await page.selectOption('#docs-category','');
    await page.fill('#docs-search','visionai/qwen');assert.equal(await page.locator('#endpoint-list [data-path]').count(),7);
  });
  await check('global search opens by keyboard and follows a result',async()=>{
    await page.keyboard.press('Control+k');await page.fill('.search-overlay input','/health');
    await page.locator('.search-result').first().click();await page.waitForURL(/\/docs\/health/);
    await page.waitForFunction(()=>document.querySelector('#endpoint-detail')?.textContent.includes('Overview'));
    assert.ok((await page.locator('#endpoint-detail').textContent()).includes('Overview'));
  });
  await check('GET query edits, repeated names, removal and all language tabs stay synchronized',async()=>{
    await page.goto(base+'/playground/search',{waitUntil:'networkidle'});
    await page.locator('#query-editor [data-key="value"]').first().fill('Ada Lovelace & Alan');
    assert.ok((await page.inputValue('#request-url')).includes('Ada+Lovelace+%26+Alan'));
    await page.click('#add-parameter');await page.locator('#query-editor [data-key="name"]').last().fill('limit');await page.locator('#query-editor [data-key="value"]').last().fill('2');
    for(const button of await page.locator('#code-tabs button').all()){await button.click();assert.ok((await page.locator('#generated-code').innerText()).includes('limit=2'));}
    await page.locator('[data-remove-pair]').last().click();assert.ok(!(await page.inputValue('#request-url')).includes('limit'));
    await page.click('[data-editor="headers"]');await page.click('#add-header');await page.locator('#headers-editor [data-key="name"]').fill('X-Test');await page.locator('#headers-editor [data-key="value"]').fill('real-value');assert.ok((await page.locator('#generated-code').innerText()).includes('real-value'));
    await page.click('#reset-request');
  });
  await check('real GET request is executed from the browser',async()=>{
    await page.goto(base+'/playground/health',{waitUntil:'networkidle'});
    await page.click('#send-request');await page.waitForFunction(()=>document.querySelector('#response-meta').textContent.includes('HTTP') || document.querySelector('#request-error').textContent,{timeout:65000});
    assert.ok((await page.locator('#response-meta').innerText()).includes('HTTP 200'),await page.locator('#request-error').innerText());
    assert.ok((await page.locator('#response-viewer').innerText()).includes('operational'));
    await page.click('[data-response-tab="headers"]');assert.ok((await page.locator('#response-content').innerText()).includes('content-type'));
  });
  await check('real POST request and response rendering work',async()=>{
    await page.goto(base+'/playground/visionai/qwen/caption',{waitUntil:'networkidle'});
    await page.selectOption('#request-method','POST');
    assert.equal(await page.inputValue('#request-method'),'POST');
    const responsePromise=page.waitForResponse(r=>r.url().startsWith('https://api.lodearink.name.ng/visionai/qwen/caption')&&r.request().method()==='POST',{timeout:65000});
    await page.click('#send-request');
    const actualResponse=await responsePromise;
    await page.waitForFunction(()=>document.querySelector('#response-meta').textContent.includes('HTTP') || document.querySelector('#request-error').textContent,{timeout:65000});
    assert.ok((await page.locator('#response-meta').innerText()).includes(`HTTP ${actualResponse.status()}`),await page.locator('#request-error').innerText());
    assert.ok(/caption|error/.test(await page.locator('#response-content').innerText()));
    assert.ok(JSON.parse(actualResponse.request().postData()).image.startsWith('https://'));
    console.log(`INFO live vision POST returned HTTP ${actualResponse.status()}; the UI displayed its real body.`);
    await page.click('[data-response-tab="raw"]');assert.ok(await page.locator('#response-content pre').textContent());
  });
  await check('a real video task can be checked without copying its ID',async()=>{
    await page.goto(base+'/playground/aivideo/wan',{waitUntil:'networkidle'});
    await page.click('#send-request');
    await page.waitForSelector('#check-task',{timeout:65000});
    const id=await page.locator('.task-card>code').textContent();
    assert.ok(id.length>10);
    const statusResponse=page.waitForResponse(r=>r.url().includes('/aivideo/wan/status?')&&r.url().includes(encodeURIComponent(id)),{timeout:65000});
    await page.click('#check-task');
    const response=await statusResponse;
    await page.waitForSelector('#response-content pre',{timeout:65000});
    assert.ok((await page.inputValue('#request-url')).includes(encodeURIComponent(id)));
    assert.equal(new URL(await page.inputValue('#request-url')).pathname,'/aivideo/wan/status');
    assert.ok((await page.locator('#response-meta').textContent()).includes('HTTP '+response.status()));
    mkdirSync('generated-artifacts',{recursive:true});
    await page.screenshot({path:'generated-artifacts/task-flow.jpg',fullPage:true});
  });
  await check('saved request CRUD, import/export and persistence work',async()=>{
    page.once('dialog',d=>d.accept('Browser saved request'));await page.click('#save-request');
    assert.ok((await page.locator('#saved-requests').innerText()).includes('Browser saved request'));
    const id=await page.locator('[data-rename]').first().getAttribute('data-rename');
    page.once('dialog',d=>d.accept('Renamed by browser'));await page.locator(`[data-rename="${id}"]`).click();
    await page.locator(`[data-duplicate="${id}"]`).click();assert.equal(await page.locator('[data-load][data-recent="false"]').count(),2);
    const downloadPromise=page.waitForEvent('download');await page.click('#export-requests');const download=await downloadPromise;await download.saveAs('/tmp/lodearink-export.json');
    await page.setInputFiles('#import-file','/tmp/lodearink-export.json');
    await page.waitForFunction(()=>document.querySelectorAll('[data-load][data-recent="false"]').length===4);
    page.once('dialog',d=>d.accept());await page.locator('[data-delete]').first().click();assert.equal(await page.locator('[data-load][data-recent="false"]').count(),3);
    await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('[data-load][data-recent="false"]').count(),3);
    await page.locator('[data-load][data-recent="false"]').first().click();assert.ok((await page.locator('#save-request').innerText()).includes('Update'));
    await page.click('#copy-code');assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).includes('api.lodearink.name.ng'));
  });
  await check('multipart upload editor updates generated file code',async()=>{
    await page.goto(base+'/playground/upload/image',{waitUntil:'networkidle'});
    await page.selectOption('#request-method','POST');await page.click('[data-editor="body"]');await page.selectOption('#body-type','multipart');
    assert.equal(await page.locator('[data-field-key="name"]').inputValue(),'file');
    await page.locator('[data-field-file]').setInputFiles({name:'tiny.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1kAAAAASUVORK5CYII=','base64')});
    assert.ok((await page.locator('#generated-code').innerText()).includes('tiny.png'));
    assert.ok((await page.locator('#generated-code').innerText()).includes('--form'));
    await page.click('[data-remove-field]');assert.equal(await page.locator('.multipart-row').count(),0);
  });
  await check('guides, shared monitoring setup states, and mobile navigation work',async()=>{
    await page.goto(base+'/guides',{waitUntil:'networkidle'});
    const hashes=await page.locator('#guides-root .guide-card').evaluateAll(links=>links.map(a=>a.hash));assert.equal(hashes.length,18);
    for(const hash of hashes){await page.evaluate(h=>{location.hash=h;},hash);await page.waitForSelector('.guide-body');assert.ok((await page.locator('.guide-body').innerText()).length>100);}
    await page.goto(base+'/status',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>document.querySelector('#status-result-count')?.textContent.includes('historical catalog records'));
    assert.ok((await page.locator('#status-historical').innerText()).includes('not a monitoring snapshot'));
    await page.selectOption('#status-coverage','discovery');await page.selectOption('#status-filter','unknown');
    assert.ok(await page.locator('.obs-status-item').count());
    await page.goto(base+'/usage',{waitUntil:'networkidle'});
    assert.ok((await page.locator('#usage-message').innerText()).includes('Monitoring not connected'));
    assert.ok((await page.locator('#usage-metrics').innerText()).includes('—'));
    assert.doesNotMatch(await page.locator('#usage-metrics').innerText(),/\b0\b/);
    await page.goto(base+'/monitoring-setup',{waitUntil:'networkidle'});
    assert.ok((await page.locator('main').innerText()).includes('Keep the API repository private'));
    await page.setViewportSize({width:390,height:844});
    for(const path of ['/','/docs','/docs/visionai/qwen/analyze','/playground','/playground/visionai/qwen/analyze','/usage','/status','/monitoring-setup','/guides','/changelog']){
      await page.goto(base+path,{waitUntil:'networkidle'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Horizontal overflow at ${path}`);
    }
    await page.click('[data-mobile-toggle]');assert.equal(await page.locator('[data-mobile-toggle]').getAttribute('aria-expanded'),'true');await page.locator('[data-mobile-menu] a[href="/docs"]').click();await page.waitForURL(/\/docs$/);
  });
} catch(error) {
  console.error(error);process.exitCode=1;
} finally {
  console.log('Runtime errors:',JSON.stringify(errors));
  if(errors.length)process.exitCode=1;
  await browser.close();
}
