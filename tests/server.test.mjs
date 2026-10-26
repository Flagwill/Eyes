import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createStaticServer} from '../server.mjs';

test('local preview serves Rive binaries and survives missing asset requests',async t=>{
  const server=createStaticServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const missing=await fetch(origin+'/assets/eyes/missing.riv');
  assert.equal(missing.status,404);
  for(const [path,type]of [
    ['/assets/eyes/eyes.riv','application/octet-stream'],
    ['/node_modules/@rive-app/canvas-advanced/rive.wasm','application/wasm'],
    ['/node_modules/@rive-app/canvas-advanced/canvas_advanced.mjs','text/javascript'],
  ]){
    const response=await fetch(origin+path);
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('content-type'),type);
    const expected=await readFile(new URL('..'+path,import.meta.url));
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array(expected),
      'binary assets must be served intact regardless of their compressed size');
  }
  assert.equal(server.address().address,'127.0.0.1');
});
