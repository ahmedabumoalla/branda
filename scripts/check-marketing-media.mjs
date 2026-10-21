import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const require=createRequire(import.meta.url),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let checks=0;
const inputs=new Set();
function loadModule(file,overrides={},cache=new Map()){
  file=path.resolve(file);if(cache.has(file))return cache.get(file);inputs.add(file);
  const exports={};cache.set(file,exports);
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','exports',js)(name=>name==='server-only'?{}:name in overrides?overrides[name]:name.startsWith('@/')?loadModule(name.slice(2)+'.ts',overrides,cache):require(name),exports);
  return exports;
}
const rules=loadModule('lib/marketing/media-rules.ts');
const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
class MediaError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function harness({eligible=true,connected=true,foreign=false,ready=false,mime='image/png',bytes=png,size=png.length,infoSize=size,infoMime=mime,sealFailure=false,priorBytes=bytes,updateFailure=false}={}){
  const calls=[],row={id:id(2),cafe_id:id(1),storage_path:`${id(1)}/${ready?'ready':'uploads'}/${id(2)}.png`,file_name:'photo.png',mime_type:mime,byte_size:size,status:ready?'ready':'uploading',expires_at:new Date(Date.now()+3600000).toISOString(),content_sha256:'a'.repeat(64)};
  const storage={createSignedUploadUrl:async(p,o)=>{calls.push({kind:'signUpload',p,o});return {data:{token:'upload-token'}};},info:async()=>({data:{size:infoSize,contentType:infoMime}}),download:async p=>{calls.push({kind:'download',p});return {data:new Blob([p.includes('/ready/')?priorBytes:bytes])};},upload:async(p,data,options)=>{calls.push({kind:'seal',p,data,options});return sealFailure?{error:{}}:{data:{path:p}};},createSignedUrl:async(p,ttl)=>{calls.push({kind:'sign',p,ttl});return {data:{signedUrl:'https://project.supabase.co/signed'}};}};
  const db={storage:{from:bucket=>{assert.equal(bucket,'marketing-media');return storage;}},rpc:async(name,args)=>{calls.push({kind:'rpc',name,args});return {data:row};},from(table){const state={table,filters:[]};const q={select(){return q;},eq(k,v){state.filters.push([k,v]);return q;},maybeSingle(){return q;},update(value){state.update=value;return q;},then(resolve,reject){calls.push(state);return Promise.resolve(table==='brand_marketing_connections'?{data:{status:connected?'connected':'pairing',requested_phone:'966500000001',verified_phone:'966500000001'}}:state.update?(updateFailure?{error:{}}:{data:[{id:row.id}]}):{data:foreign?null:row}).then(resolve,reject);}};return q;}};
  const overrides={'@/lib/data/marketing':{MarketingError:MediaError,requireMarketingContext:async()=>({db,cafeId:id(1),userId:id(3),eligible})},'@/lib/supabase/admin':{createAdminClient:()=>db}};
  return {...loadModule('lib/marketing/media.ts',overrides),calls,row,db,overrides};
}
async function test(name,fn){await fn();checks++;console.log('PASS '+name);}
await test('file limits and byte signatures reject renamed executables and unsupported containers',async()=>{
  assert.equal(rules.MARKETING_MEDIA_BODY_LIMIT,992);
  for(const [mime,rule]of Object.entries(rules.MARKETING_MEDIA_TYPES)){assert(rules.validateMarketingMediaFile({mimeType:mime,size:rule.maxSize}));assert(!rules.validateMarketingMediaFile({mimeType:mime,size:rule.maxSize+1}));}
  for(const mime of ['text/html','image/svg+xml','video/quicktime','application/octet-stream'])assert(!rules.validateMarketingMediaFile({mimeType:mime,size:1}));
  assert(rules.marketingMediaSignature(png,'image/png'));assert(!rules.marketingMediaSignature(Buffer.from('<script>evil</script>'),'image/png'));
  assert(rules.marketingMediaSignature(Buffer.from('0000ftypisom000000000000'),'video/mp4'));assert(!rules.marketingMediaSignature(Buffer.from('0000ftypavif000000000000'),'video/mp4'));
});
await test('prepare authorizes tenant, connection and upload metadata before issuing limited token',async()=>{
  const value={action:'prepare',fileName:'photo.png',mimeType:'image/png',size:png.length};
  for(const options of [{eligible:false},{connected:false}]){const h=harness(options);await assert.rejects(()=>h.runMarketingMediaAction(value));assert(!h.calls.some(c=>c.kind==='signUpload'));}
  const h=harness();const result=await h.runMarketingMediaAction(value);
  assert.equal(result.mediaId,id(2));assert.equal(result.upload.token,'upload-token');assert.equal(h.calls.find(c=>c.kind==='rpc').args.p_cafe,id(1));assert.deepEqual(h.calls.find(c=>c.kind==='signUpload').o,{upsert:false});
  for(const changes of [{fileName:'../evil.png'},{size:10485761},{mimeType:'image/svg+xml'},{url:'https://evil.test'}])await assert.rejects(()=>h.runMarketingMediaAction({...value,...changes}));
});
await test('finalize checks tenant, declared metadata, actual size and magic bytes',async()=>{
  for(const options of [{foreign:true},{infoSize:20},{infoMime:'image/jpeg'},{bytes:Buffer.from('not an image'),size:12},{bytes:png,size:25,infoSize:25}]){const h=harness(options);await assert.rejects(()=>h.runMarketingMediaAction({action:'finalize',mediaId:id(2)}));assert(!h.calls.some(c=>c.kind==='seal'));}
  const h=harness();const result=await h.runMarketingMediaAction({action:'finalize',mediaId:id(2)});
  assert.equal(result.media.kind,'image');assert.equal(result.media.size,png.length);assert(!('storage_path'in result.media));
  const sealed=h.calls.find(c=>c.kind==='seal');assert.equal(sealed.p,`${id(1)}/ready/${id(2)}.png`);assert.deepEqual(Buffer.from(sealed.data),png);assert.equal(sealed.options.upsert,false);
  const saved=h.calls.find(c=>c.update);assert.equal(saved.update.content_sha256,createHash('sha256').update(png).digest('hex'));assert.equal(saved.update.storage_path,sealed.p);assert(saved.filters.some(([k,v])=>k==='cafe_id'&&v===id(1)));
});
await test('finalize retry only accepts matching sealed bytes and never overwrites sealed object',async()=>{
  const retry=harness({sealFailure:true});await retry.runMarketingMediaAction({action:'finalize',mediaId:id(2)});
  const conflict=harness({sealFailure:true,priorBytes:Buffer.from('foreign')});await assert.rejects(()=>conflict.runMarketingMediaAction({action:'finalize',mediaId:id(2)}));assert(!conflict.calls.some(c=>c.update));
  const done=harness({ready:true});await done.runMarketingMediaAction({action:'finalize',mediaId:id(2)});assert(!done.calls.some(c=>c.kind==='download'||c.kind==='seal'));
  const interrupted=harness({updateFailure:true});await assert.rejects(()=>interrupted.runMarketingMediaAction({action:'finalize',mediaId:id(2)}));assert(interrupted.calls.some(c=>c.kind==='seal'));
  const recovered=harness({sealFailure:true,priorBytes:png});await recovered.runMarketingMediaAction({action:'finalize',mediaId:id(2)});assert(recovered.calls.some(c=>c.update?.status==='ready'));
  const expired=harness();expired.row.expires_at=new Date(Date.now()-1000).toISOString();await assert.rejects(()=>expired.runMarketingMediaAction({action:'finalize',mediaId:id(2)}));assert(!expired.calls.some(c=>c.kind==='download'));
});
await test('dispatch signs only finalized tenant object for48hours and never uses staged path',async()=>{
  const h=harness({ready:true});await h.signMarketingMedia(id(1),id(2));assert.equal(h.calls.find(c=>c.kind==='sign').ttl,172800);
  const staged=harness();await assert.rejects(()=>staged.signMarketingMedia(id(1),id(2)));assert(!staged.calls.some(c=>c.kind==='sign'));
  const foreign=harness({ready:true,foreign:true});await assert.rejects(()=>foreign.signMarketingMedia(id(1),id(2)));
});
await test('media JSON endpoint rejects cross-origin, malformed and oversized payloads before work',async()=>{
  let mutations=0;const api=loadModule('app/api/marketing/media/route.ts',{'@/lib/data/marketing':{MarketingError:MediaError},'@/lib/marketing/media':{runMarketingMediaAction:async()=>{mutations++;return {media:{id:id(2)}};}}});
  const req=(body,origin='https://barndaksa.com')=>new Request('https://barndaksa.com/api/marketing/media',{method:'POST',headers:{origin},body});
  assert.equal((await api.POST(req('{}','https://evil.test'))).status,403);assert.equal((await api.POST(req('x'.repeat(2001)))).status,400);assert.equal((await api.POST(req('bad'))).status,400);assert.equal(mutations,0);
  const result=await api.POST(req('{}'));assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'private, no-store');assert.equal(mutations,1);
});
inputs.add(path.resolve(import.meta.filename));
fs.writeFileSync('.git/marketing-media-checks.json',JSON.stringify({executedAt:new Date().toISOString(),node:process.version,checks,inputs:Object.fromEntries([...inputs].map(file=>[path.relative(process.cwd(),file),createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),liveWrites:0},null,2));
console.log(`PASS marketing media: ${checks} groups, no live uploads or sends`);
