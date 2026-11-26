import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {generateCode, LANGUAGES, requestHeaders} from '../js/code-generator.js';
import {validateRequest, saveRequest, readStore, updateStore, importRequests, exportRequests, addRecent} from '../js/storage.js';
const data=JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8'));
const base={url:'https://api.lodearink.name.ng/search?q=Ada+Lovelace&limit=2',method:'GET',headers:[],payloadType:'raw',body:'',fields:[]};
const json={...base,url:'https://api.lodearink.name.ng/visionai/qwen/analyze',method:'POST',payloadType:'json',headers:[{name:'X-Example',value:"a'b"}],body:JSON.stringify({prompt:'Hello "world"',image:'https://example.com/a.jpg'})};
const multipart={...json,payloadType:'multipart',fields:[{name:'image',isFile:true,value:'sample.png'},{name:'caption',value:"A 'quoted' caption & more",isFile:false},{name:'caption',value:'another value',isFile:false}]};
const memory=new Map();
globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
globalThis.window={dispatchEvent:()=>{}};
test('every route in the uploaded inventory is present exactly once',()=>{
  const brief=readFileSync(new URL('../attached_assets/lodearink-docs-prompt_1795708058301.md',import.meta.url),'utf8');
  const routes=[...brief.split('General and Search')[1].split('Include every route above.')[0].matchAll(/- "(\/[^"]+)"/g)].map(m=>m[1]);
  const actual=new Set(data.endpoints.map(e=>e.path));
  for(const route of routes)assert.ok(actual.has(route),`Missing ${route}`);
  assert.equal(actual.size,data.endpoints.length);
  assert.ok(data.endpoints.length>routes.length,'Additional discovered routes are included');
});
test('every inventory entry has traceable live evidence and honest offline classification',()=>{
  for(const e of data.endpoints){
    assert.ok(e.evidence.length,`${e.path}: missing evidence`);
    assert.ok(Date.parse(e.status.checkedAt),`${e.path}: missing timestamp`);
    for(const ev of e.evidence){assert.ok(ev.url.startsWith(data.baseUrl));assert.ok(['GET','POST'].includes(ev.method));}
    if(e.status.state==='offline'){
      assert.ok(['GET','POST'].every(method=>e.evidence.some(x=>x.method===method&&x.httpStatus===404&&x.response.includes('Unknown endpoint'))),e.path);
    }
    if(e.safeCheck)assert.ok(!/aivideo|\/generate|\/submit|\/upload|\/new$|\/batch|\/download|\/stream/.test(e.path),`Unsafe scheduler entry: ${e.path}`);
  }
});
test('code generators preserve URLs and never attach a GET body',()=>{
  for(const language of LANGUAGES){
    const text=generateCode({...base,body:'SHOULD_NOT_APPEAR'},language);
    assert.ok(text.includes('api.lodearink.name.ng/search?q=Ada+Lovelace&limit=2'));
    assert.ok(!text.includes('SHOULD_NOT_APPEAR'),language);
  }
});
test('content-type normalization matches JSON and multipart request execution',()=>{
  assert.equal(requestHeaders(json)['Content-Type'],'application/json');
  assert.ok(!Object.keys(requestHeaders({...multipart,headers:[{name:'content-type',value:'application/json'}]})).some(k=>k.toLowerCase()==='content-type'));
  assert.equal(requestHeaders({...base,headers:[{name:'X-Test',value:'first'},{name:'x-test',value:'second'}]})['X-Test'],'first, second');
});
test('all eight language generators pass their native syntax checker for GET, JSON and multipart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'lodearink-code-'));
  const check=(command,args)=>{try{return execFileSync(command,args,{encoding:'utf8',stdio:'pipe'});}catch(error){assert.fail(`${command}: ${error.stderr?.toString()||error.message}`);}};
  try{
    for(const [index,request] of [base,json,multipart].entries()){
      for(const language of LANGUAGES){
        const text=generateCode(request,language);
        const ext={'cURL':'sh','Bash':'sh','JavaScript Fetch':'mjs','Node.js Axios':'mjs','Python Requests':'py','PHP cURL':'php','Go':'go','Ruby Net::HTTP':'rb'}[language];
        const file=join(dir,`${index}-${language.split(' ')[0]}.${ext}`);writeFileSync(file,text);
        if(ext==='sh')check('bash',['-n',file]);
        if(ext==='mjs')check('node',['--check',file]);
        if(ext==='py')check('python',['-c','import ast,sys;ast.parse(open(sys.argv[1]).read())',file]);
        if(ext==='php')check('php',['-l',file]);
        if(ext==='rb')check('ruby',['-c',file]);
        if(ext==='go')check(join(execFileSync('go',['env','GOROOT'],{encoding:'utf8'}).trim(),'bin','gofmt'),['-e',file]);
      }
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('saved requests support update, rename, duplicate, deletion, import and export',()=>{
  memory.clear();
  const one=saveRequest('Original',base);
  assert.equal(readStore().saved.length,1);
  saveRequest('Renamed',{...base,url:base.url+'&changed=true'},one.id);
  assert.equal(readStore().saved[0].name,'Renamed');
  const duplicate=saveRequest('Duplicate',readStore().saved[0]);
  assert.notEqual(duplicate.id,one.id);assert.equal(readStore().saved.length,2);
  const exported=exportRequests();
  updateStore(d=>{d.saved=d.saved.filter(r=>r.id!==one.id);});
  assert.equal(readStore().saved.length,1);
  assert.equal(importRequests(exported),2);
  assert.equal(readStore().saved.length,3);
  for(let i=0;i<30;i++)addRecent(base);
  assert.equal(readStore().recent.length,25);
});
test('imports reject foreign origins, embedded credentials and malformed entries atomically',()=>{
  const original=readStore().saved.length;
  assert.throws(()=>validateRequest({...base,url:'https://attacker.example/'}));
  assert.throws(()=>validateRequest({...base,url:'https://name:secret@api.lodearink.name.ng/health'}));
  assert.throws(()=>importRequests(JSON.stringify({version:1,requests:[base,{...base,method:'INVALID'}]})));
  assert.equal(readStore().saved.length,original);
  assert.throws(()=>importRequests('not json'));
});
