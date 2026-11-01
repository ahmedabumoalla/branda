const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const modules=new Map();
function load(file){file=path.resolve(file);if(modules.has(file))return modules.get(file);const exports={};modules.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(name=>{if(name.startsWith('@/')||name.startsWith('.'))return load((name.startsWith('@/')?name.slice(2):path.join(path.dirname(file),name))+'.ts');return require(name)},exports);return exports;}
const {togetherResponsiveImage,STORE_DETAIL_IMAGE_SIZES,TOGETHER_IMAGE_PATH}=load('lib/menu/together-images.ts');
const origin='https://kpguwjfkkylrdlvzeezz.supabase.co';
const src=i=>`${origin}${TOGETHER_IMAGE_PATH}product/photo-${i}.webp?token=signed-capability`;
const image=togetherResponsiveImage(src(1),'60px');
assert.equal(image.sizes,'60px');assert(image.srcSet.includes('w=128&q=75 128w'));assert(!image.srcSet.includes(' 1400w'));assert.equal(new URL(image.src,'https://barndaksa.com').searchParams.get('url'),src(1));
for(const invalid of [src(1).replace(origin,'https://untrusted.example'),src(1).replace(TOGETHER_IMAGE_PATH,'/storage/v1/object/sign/private-documents/'),src(1).replace('4e5a661a-7029-40ec-a3bc-dc75959a05bb','another-tenant'),src(1).split('?')[0],'/local.webp','data:image/png;base64,abc'])assert.equal(togetherResponsiveImage(invalid,'60px'),null);
const oldWindow=global.window,oldImage=global.Image,now=Date.now;let created=0,clock=1000;
class FakeImage{constructor(){created++;}decode(){return Promise.resolve();}}
const {warmStorePhoto,rememberStorePhoto}=load('lib/ui/store-image-cache.ts');
try{
  delete global.window;global.Image=FakeImage;Date.now=()=>clock;
  warmStorePhoto(src(1),STORE_DETAIL_IMAGE_SIZES);assert.equal(created,0,'No server/global user cache');
  global.window={};warmStorePhoto(src(1),STORE_DETAIL_IMAGE_SIZES);warmStorePhoto(src(1),STORE_DETAIL_IMAGE_SIZES);assert.equal(created,1,'Reopening reuses a pending/decoded gallery image');
  warmStorePhoto('https://untrusted.example/private.webp',STORE_DETAIL_IMAGE_SIZES);assert.equal(created,1);
  const loaded=new FakeImage();rememberStorePhoto(src(2),STORE_DETAIL_IMAGE_SIZES,loaded);warmStorePhoto(src(2),STORE_DETAIL_IMAGE_SIZES);assert.equal(created,2,'Visible loaded image is reused without prefetch');
  for(let i=3;i<=6;i++)warmStorePhoto(src(i),STORE_DETAIL_IMAGE_SIZES);
  const before=created;warmStorePhoto(src(1),STORE_DETAIL_IMAGE_SIZES);assert.equal(created,before+1,'Old references evicted at four images');
  clock+=5*60_000+1;warmStorePhoto(src(1),STORE_DETAIL_IMAGE_SIZES);assert.equal(created,before+2,'Expired capabilities are not retained indefinitely');
}finally{global.window=oldWindow;global.Image=oldImage;Date.now=now;}
console.log('PASS Together responsive photo allowlist, thumbnail widths, browser-only reuse, four-image bound and expiry');
