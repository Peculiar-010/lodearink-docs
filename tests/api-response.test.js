import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {isPreviewableMediaType, sniffMediaType} from '../js/media-type.js';

const nativeFetch = globalThis.fetch;
let nextResponse;
globalThis.fetch = async input => {
  if (String(input) === '/data/catalog.json') {
    return new Response(JSON.stringify({baseUrl:'https://api.lodearink.name.ng',endpoints:[]}), {
      headers: {'Content-Type':'application/json'},
    });
  }
  if (!nextResponse) throw new Error(`Unexpected test request: ${input}`);
  return nextResponse();
};
const {executeRequest} = await import('../js/api.js');
after(() => { globalThis.fetch = nativeFetch; });

const request = {
  url:'https://api.lodearink.name.ng/media/test',
  method:'GET',
  headers:[],
  payloadType:'raw',
  body:'',
  fields:[],
};

test('recognizes common raw image, audio, and video signatures',()=>{
  const signatures=[
    [[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],'image/png'],
    [[0xff,0xd8,0xff,0xe0],'image/jpeg'],
    [[...new TextEncoder().encode('GIF89a')],'image/gif'],
    [[...new TextEncoder().encode('RIFF0000WEBP')],'image/webp'],
    [[...new TextEncoder().encode('RIFF0000WAVE')],'audio/wav'],
    [[...new TextEncoder().encode('OggS')],'audio/ogg'],
    [[...new TextEncoder().encode('ID3')],'audio/mpeg'],
    [[0x00,0x00,0x00,0x18,...new TextEncoder().encode('ftypisom')],'video/mp4'],
    [[0x1a,0x45,0xdf,0xa3,...new TextEncoder().encode('webm')],'video/webm'],
  ];
  for(const [signature,type] of signatures)assert.equal(sniffMediaType(new Uint8Array(signature)),type);
  assert.equal(sniffMediaType(new Uint8Array([0,1,2,3,4,5,6,7])),'');
  assert.equal(isPreviewableMediaType('Image/PNG; charset=binary'),true);
  assert.equal(isPreviewableMediaType('application/json'),false);
});

test('generic binary image responses become previewable without losing bytes',async()=>{
  const bytes=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3]);
  nextResponse=()=>new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}});
  const result=await executeRequest(request);
  assert.equal(result.contentType,'image/png');
  assert.equal(result.declaredContentType,'application/octet-stream');
  assert.equal(result.detectedMediaType,'image/png');
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()),bytes);
  assert.equal(result.text,'');
  nextResponse=null;
});

test('generic binary JSON remains complete and formatted as JSON',async()=>{
  const body=JSON.stringify({message:'complete response',rows:Array.from({length:200},(_,index)=>({index,value:`row-${index}`}))});
  nextResponse=()=>new Response(body,{headers:{'Content-Type':'application/octet-stream'}});
  const result=await executeRequest(request);
  assert.equal(result.contentType,'application/json');
  assert.equal(result.text,body);
  assert.deepEqual(result.data,JSON.parse(body));
  nextResponse=null;
});

test('unknown binary stays binary for download instead of showing corrupted text',async()=>{
  const bytes=new Uint8Array([0,1,2,3,4,5,6,7]);
  nextResponse=()=>new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}});
  const result=await executeRequest(request);
  assert.equal(result.contentType,'application/octet-stream');
  assert.equal(result.text,'');
  assert.equal(result.data,null);
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()),bytes);
  nextResponse=null;
});
