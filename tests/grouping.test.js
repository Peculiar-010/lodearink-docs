import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const catalog=JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8'));
const contracts=JSON.parse(readFileSync(new URL('../data/contracts.json',import.meta.url),'utf8'));
const root=new URL('../',import.meta.url);
const groups=JSON.parse(execFileSync('python',['-c',`
import json,sys
sys.path.insert(0,"scripts")
from update_catalog import group
paths=json.load(sys.stdin)
print(json.dumps({path:group(path) for path in paths}))
`],{cwd:root,input:JSON.stringify([...catalog.endpoints.map(e=>e.path),'/unrecognized/download','/playstore-extra/download']),encoding:'utf8'}));

test('source contracts and catalog use the same explicit service taxonomy',()=>{
  assert.equal(contracts.endpoints.length,206);
  assert.equal(catalog.endpoints.length,206);
  assert.deepEqual(new Set(contracts.endpoints.map(e=>e.path)),new Set(catalog.endpoints.map(e=>e.path)));
  for(const document of [contracts,catalog]){
    for(const entry of document.endpoints){
      assert.equal(entry.category,groups[entry.path],entry.path);
      assert.notEqual(entry.category,'Other Tools',`${entry.path}: inventory route must be classified`);
    }
  }
});
test('only social-media providers belong to Social Downloaders',()=>{
  const allowed=new Set(['tiktok','fb','twitter','ig','pinterest','reddit','ytdl']);
  const social=catalog.endpoints.filter(e=>e.category==='Social Downloaders');
  assert.ok(social.length);
  for(const entry of social)assert.ok(allowed.has(entry.path.split('/')[1]),entry.path);
  const expected={'/playstore/app':'App Stores','/uptodown/download':'App Stores','/mediafire/download':'File Downloads','/hn/top':'Developer News','/spdl/info':'Audio & Music','/spotsearch/song':'Audio & Music','/aio':'Media Downloaders','/aiov2':'Media Downloaders'};
  for(const [path,category] of Object.entries(expected))assert.equal(groups[path],category,path);
  for(const path of ['/unrecognized/download','/playstore-extra/download'])assert.equal(groups[path],'Other Tools');
  assert.equal(catalog.endpoints.filter(e=>e.category==='Text AI').length,4);
  assert.ok(catalog.endpoints.filter(e=>e.category==='Text AI').every(e=>e.path.startsWith('/llama/')));
});
test('offline regrouping preserves evidence and rejects mismatched inventories before writing',()=>{
  execFileSync('python',['-c',`
import copy,json,pathlib,sys,tempfile
from unittest.mock import patch
sys.path.insert(0,"scripts")
import update_catalog as module
with tempfile.TemporaryDirectory() as directory:
 root=pathlib.Path(directory)
 (root/"data").mkdir()
 fixture={"version":2,"discoveredAt":"2026-11-27T08:00:00Z","endpoints":[
  {"path":"/playstore/app","category":"Social Downloaders","service":"Play Store","status":{"state":"online","checkedAt":"unchanged"},"evidence":[{"response":"actual response"}],"requests":{"GET":{"query":{"id":"org.example"}}}},
  {"path":"/spdl/info","category":"Social Downloaders","service":"Spotify","status":{"state":"degraded"},"evidence":[{"httpStatus":503}]}
 ]}
 for name in ["contracts","catalog"]:(root/"data"/(name+".json")).write_text(json.dumps(fixture))
 with patch.object(module,"ROOT",root),patch.object(sys,"argv",["update_catalog.py","--regroup-only"]),patch.object(module,"probe",side_effect=AssertionError("must not probe")),patch.object(module.subprocess,"run",side_effect=AssertionError("must not download")):
  module.main()
 for name in ["contracts","catalog"]:
  updated=json.loads((root/"data"/(name+".json")).read_text())
  assert updated["discoveredAt"]==fixture["discoveredAt"]
  for entry in updated["endpoints"]:
   original=copy.deepcopy(next(x for x in fixture["endpoints"] if x["path"]==entry["path"]))
   original["category"]=module.group(original["path"])
   assert entry==original
 path=root/"data/contracts.json"
 mismatch=copy.deepcopy(fixture);mismatch["endpoints"].pop()
 path.write_text(json.dumps(mismatch))
 before={name:(root/"data"/(name+".json")).read_text() for name in ["contracts","catalog"]}
 try:module.regroup_inventory(root)
 except ValueError:pass
 else:raise AssertionError("mismatched inventory accepted")
 assert all((root/"data"/(name+".json")).read_text()==value for name,value in before.items())
`],{cwd:root,encoding:'utf8'});
});
