const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,mocks={}) {
 const exports={};const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',source)(name=>{
  if(name in mocks)return mocks[name];
  if(name.startsWith('@/')){const p=name.slice(2);return load(fs.existsSync(p+'.ts')?p+'.ts':p+'.tsx',mocks);}
  return require(name);
 },exports);return exports;
}
async function main(){
 let cafe=null,enabled=true,calls=[];
 const {GET}=load('app/api/owner/menu-media/route.ts',{
  '@/lib/data/cafes':{getOwnerCafeContext:async()=>cafe},
  '@/lib/data/owner-service-access':{assertOwnerServiceEnabled:async feature=>{assert.equal(feature,'menu');if(!enabled)throw Error('disabled');}},
  '@/lib/supabase/admin':{createAdminClient:()=>({storage:{from:bucket=>({createSignedUrl:async(path,ttl)=>{
   calls.push({bucket,path,ttl});return {data:{signedUrl:'https://storage.example/image?token='+calls.length},error:null};
  }})}})},
 });
 const request=path=>new Request('https://example.test/api/owner/menu-media?path='+encodeURIComponent(path));
 assert.equal((await GET(request('tenant/photo.webp'))).status,401);assert.equal(calls.length,0);
 cafe={id:'tenant'};
 for(const path of ['other/photo.webp','tenant/../private','tenant/%2e%2e/private','tenant/\\private'])assert.equal((await GET(request(path))).status,403);
 assert.equal(calls.length,0);
 enabled=false;assert.equal((await GET(request('tenant/photo.webp'))).status,403);assert.equal(calls.length,0);enabled=true;
 const first=await GET(request('tenant/photo.webp')),second=await GET(request('tenant/photo.webp'));
 assert.equal(first.status,307);assert.equal(first.headers.get('cache-control'),'private, no-store');assert.equal(first.headers.get('vary'),'Cookie');
 assert.notEqual(first.headers.get('location'),second.headers.get('location'),'Each actual lazy-load/retry resolves a fresh signature');
 assert.deepEqual(calls[0],{bucket:'menu-products',path:'tenant/photo.webp',ttl:600});
 let publicCalls=0;global.fetch=async()=>{publicCalls++;return{ok:false};};
 const effects=[];
 const {useLocalAssetUrl}=load('lib/cafe/use-local-asset-url.ts',{
  react:{useState:fn=>[typeof fn==='function'?fn():fn,()=>{}],useEffect:fn=>effects.push(fn)},
  '@/lib/cafe/local-asset-store':{getLocalAssetObjectUrl:async()=>undefined,revokeObjectUrl(){}},
 });
 const expired='https://storage.example/expired?token=old';
 assert.equal(useLocalAssetUrl('tenant/photo.webp',expired,undefined,'menu-products',true),'/api/owner/menu-media?path=tenant%2Fphoto.webp');
 assert.equal(useLocalAssetUrl('tenant/video.mp4',expired,undefined,'menu-products',true),'/api/owner/menu-media?path=tenant%2Fvideo.mp4');
 assert.equal(useLocalAssetUrl('tenant/photo.webp',expired,'blob:new','menu-products',true),'blob:new');
 effects.forEach(fn=>fn());assert.equal(publicCalls,0,'Owner images never fall back to anonymous publication signing');
 assert.equal(useLocalAssetUrl(undefined,'https://example.test/external.webp',undefined,'menu-products',true),'https://example.test/external.webp');
 const hookMocks={
  react:{useState:()=>[undefined,()=>{}]},
  '@/lib/cafe/use-local-asset-url':{useLocalAssetUrl:(...args)=>{assert.equal(args[4],true);return '/api/owner/menu-media?path=tenant%2Fphoto.webp';}},
 };
 const {LocalAssetImage}=load('components/ui/local-asset-image.tsx',hookMocks);
 const image=LocalAssetImage({assetId:'tenant/photo.webp',fallbackSrc:expired,alt:'Product',publicBucket:'menu-products',ownerMenu:true});
 assert.equal(image.type,'img');assert.equal(image.props.loading,'lazy');assert.equal(image.props.src,'/api/owner/menu-media?path=tenant%2Fphoto.webp');
 for(const file of ['components/dashboard/menu/product-card.tsx','components/dashboard/menu/product-modal.tsx'])assert(fs.readFileSync(file,'utf8').includes('ownerMenu'));
 console.log('PASS owner menu media: authenticated tenant isolation, service gate, fixed bucket, fresh private redirects, expired fallback bypass, video/image/previews and lazy image integration');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
