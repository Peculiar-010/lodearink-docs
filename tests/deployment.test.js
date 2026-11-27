import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('locked npm tarballs are portable to external build hosts',()=>{
  const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
  for(const [name,pkg] of Object.entries(lock.packages)){
    if(!pkg.resolved)continue;
    const url=new URL(pkg.resolved);
    assert.equal(url.protocol,'https:',`${name}: package downloads must use HTTPS`);
    assert.equal(url.hostname,'registry.npmjs.org',`${name}: do not commit internal registry addresses`);
    assert.ok(pkg.integrity,`${name}: preserve package integrity verification`);
  }
});

test('Vercel installs locked build dependencies without browser-testing packages',()=>{
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.match(config.installCommand,/npm ci\b/);
  assert.match(config.installCommand,/--omit=dev\b/);
  assert.ok(pkg.dependencies['@resvg/resvg-js'],'Sharing-image renderer must be installed for the build');
  assert.ok(pkg.devDependencies.playwright,'Browser testing stays development-only');
  assert.equal(config.buildCommand,'npm run build');
  assert.equal(config.outputDirectory,'dist');
});
