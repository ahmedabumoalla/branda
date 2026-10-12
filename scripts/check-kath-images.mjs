import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const images={};new Function('exports',compile('lib/menu/kath-images.ts'))(images);
const url=images.KATH_IMAGE_ORIGIN+images.KATH_IMAGE_PATH+'product/photo.png?token=public-signature';
const responsive=images.kathResponsiveImage(url,'50vw');assert(responsive);assert.equal(responsive.sizes,'50vw');
assert(images.kathResponsiveImage(images.KATH_IMAGE_ORIGIN+images.SHAHI_IMAGE_PATH+'product/photo.png?token=public-signature','50vw'));
assert.equal(new URL(responsive.src,'https://barndaksa.com').searchParams.get('url'),url);
assert.equal(responsive.srcSet.split(', ').length,6);
for(const bad of ['data:image/png,abc','https://evil.example/photo.png',url.replace('menu-products','customer-avatars'),url.replace('fbd92cd0-c4b6-41b5-81dd-1d45a01d01e8','other-tenant'),url.split('?')[0]])assert.equal(images.kathResponsiveImage(bad,'50vw'),null);
let requests=0,fail=false;const cache=new Map(),assets={};
new Function('require','exports',compile('lib/data/kath-menu-assets.ts'))(name=>{
 if(name==='server-only')return {};
 if(name==='next/cache')return {unstable_cache:fn=>async(...args)=>{const key=JSON.stringify(args);if(!cache.has(key))cache.set(key,await fn(...args));return cache.get(key)}};
 if(name==='@/lib/supabase/admin')return {createAdminClient:()=>({storage:{from(bucket){return {async createSignedUrls(paths,ttl){
   assert.equal(bucket,'menu-products');assert.equal(ttl,3600);requests++;
   return fail?{error:Error('sign failure')}:{data:paths.map(path=>({path,signedUrl:path+'?token='+requests}))};
 }}}}})};
 throw Error(name);
},assets);
const first=await assets.getKathMenuAssets(['b','a'],30_000);
assert.deepEqual(await assets.getKathMenuAssets(['a','b'],60_000),first);assert.equal(requests,1,'catalog refresh keeps signatures and CDN cache stable');
await assets.getKathMenuAssets(['a','b'],3_000_000);assert.equal(requests,2,'rotate before signature expiry');
await assets.getKathMenuAssets(['a','new-photo'],3_000_000);assert.equal(requests,3,'dashboard image replacement gets fresh signatures immediately');
fail=true;await assert.rejects(()=>assets.getKathMenuAssets(['new'],3_000_000),/sign failure/);
const lum=hex=>{const rgb=hex.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
for(const [text,bg]of [['3b241b','e5b572'],['3b241b','fbf6ed'],['fbf6ed','3b241b'],['fbf6ed','733b27']]){const l=[lum(text),lum(bg)].sort((a,b)=>b-a);assert((l[0]+.05)/(l[1]+.05)>=4.5,'normal/hover/disabled and hero text contrast');}
console.log('PASS Kath images: responsive widths, strict tenant/bucket/origin, token-safe URL encoding, cache reuse/rotation/replacement/errors and button/text contrast');
