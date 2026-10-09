import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
const dependency = createRequire(import.meta.url);
function load(file, stubs={}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file,"utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,esModuleInterop:true } }).outputText;
  new Function("require","exports",compiled)(name=>Object.hasOwn(stubs,name)?stubs[name]:name==="server-only"?{}:name.startsWith("@/")?load(`${name.slice(2)}.ts`,stubs):dependency(name),exports);
  return exports;
}
const { clearUniformLogoBackground } = load("lib/cafe/logo-transparency.ts");
function fixture(background=[255,255,255],mark=[100,0,20]) {
  const pixels=new Uint8ClampedArray(20*20*4);
  for(let y=0;y<20;y++) for(let x=0;x<20;x++) pixels.set([...(x>=6&&x<14&&y>=6&&y<14?mark:background),255],(y*20+x)*4);
  return pixels;
}
let checks=0;
for(const background of [[255,255,255],[0,0,0],[245,235,215]]) {
  const pixels=fixture(background);
  assert.equal(clearUniformLogoBackground(pixels,20,20),true);
  assert.equal(pixels[3],0);
  assert.deepEqual([...pixels.slice((10*20+10)*4,(10*20+10)*4+4)],[100,0,20,255]);checks++;
}
for(const pixels of [fixture([255,255,255],[255,255,255]),(()=>{const p=fixture();p[3]=0;return p;})(),(()=>{const p=fixture();p[0]=0;return p;})()]) {
  const before=pixels.slice();assert.equal(clearUniformLogoBackground(pixels,20,20),false);assert.deepEqual(pixels,before);checks++;
}
const originals=Object.fromEntries(["window","document","createImageBitmap"].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
try {
  let data=fixture();const encodings=[];
  Object.defineProperty(globalThis,"window",{configurable:true,value:{}});
  Object.defineProperty(globalThis,"createImageBitmap",{configurable:true,value:async()=>({width:20,height:20,close(){}})});
  Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:()=>({width:0,height:0,
    getContext:()=>({drawImage(){},getImageData:()=>({data}),putImageData(image){data=image.data;}}),
    toBlob(callback,mime){encodings.push(mime);callback(mime==="image/webp"?null:new Blob([data],{type:mime}));},
  })}});
  const { optimizeImageForStorage }=load("lib/cafe/image-asset-pipeline.ts");
  const image=await optimizeImageForStorage(new File(["source"],"mark.jpg",{type:"image/jpeg"}),"cafe-logo");
  assert.equal(image.mimeType,"image/png");assert.match(image.fileName,/\.png$/);assert.equal(data[3],0);
  assert.ok(!encodings.includes("image/jpeg"),"Logo fallback must preserve alpha");checks++;
} finally {
  for(const [key,descriptor] of Object.entries(originals)) if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
}
const sharp=dependency("sharp");
const stats=await sharp("public/brand/barndaksa-logo-brown.png").stats();
assert.equal(stats.channels[3].min,0,"Existing fallback asset is truly transparent");checks++;
const cache=load("lib/performance/server-memory-cache.ts");
const { publishedMenuLogo }=load("lib/cafe/published-logo.ts",{"@/lib/performance/server-memory-cache":cache});
const cafe="00000000-0000-4000-8000-000000000001",source=`${cafe}/logo/old.png`;
const stored=new Map();let downloads=0,uploads=0;
const oldLogo=await sharp(Buffer.from(fixture()),{raw:{width:20,height:20,channels:4}}).png().toBuffer();
const bucket={
  info:async path=>({data:path===source?{version:"one",etag:"source",size:oldLogo.length}:stored.has(path)?{version:"derived"}:null}),
  download:async()=>{downloads++;return{data:new Blob([oldLogo])};},
  upload:async(path,bytes)=>{uploads++;stored.set(path,bytes);return{error:null};},
  createSignedUrl:async path=>({data:{signedUrl:`https://storage.test/${path}`}}),
};
const admin={storage:{from:name=>{assert.equal(name,"cafe-logos");return bucket;}}};
const url=await publishedMenuLogo(admin,cafe,source);
assert.match(url,/processed-logos/);
assert.equal((await sharp([...stored.values()][0]).stats()).channels[3].min,0);
assert.equal(await publishedMenuLogo(admin,cafe,source),url);
assert.equal(downloads,1);assert.equal(uploads,1);checks++;
cache.clearServerMemoryCache();
assert.equal(await publishedMenuLogo(admin,cafe,source),url);
assert.equal(downloads,1);assert.equal(uploads,1);checks++;
assert.equal(await publishedMenuLogo(admin,cafe,"other/logo.png"),null);checks++;
console.log(`PASS logo transparency and actual upload optimization: ${checks} cases`);
