import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,stubs={}){const out={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','exports',code)(name=>name==='server-only'?{}:stubs[name]??(name.startsWith('@/')?{}:require(name)),out);return out;}
const colors=load('lib/loyalty/approved-design.ts');
const appearance=load('lib/data/loyalty-identity.ts',{'@/lib/loyalty/approved-design':colors});
const stamp=load('lib/loyalty/stamp-style.ts');
const artwork=load('lib/loyalty/brand-stamp-artwork.ts',{'./stamp-style':stamp});
const cards=load('lib/data/loyalty-cards.ts',{'@/lib/loyalty/brand-stamp-artwork':artwork});
let checks=0;const check=(v,m)=>{assert(v,m);checks++;};
const base=()=>({cafe:{id:'brand',slug:'brand-406bf519a458',name:'Jamila',name_en:'Jamila',business_category:'cafes_coffee'},settings:{logo_url:'/original.svg',logo_storage_path:null},appearance:{palette:null,logo_url:null,logo_storage_path:null},program:{enabled:true,purchases_required:6,menu_products:{name:'Drink'},reward_name:'Drink',card_design:{stampStyle:'brand',keep:'layout'},apple_wallet_enabled:true,google_wallet_enabled:true}});
let data=base(),calls=0,error=null,variant=null,storage=[];
const snapshot=load('lib/data/loyalty-brand-snapshot.ts',{
 '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{assert.equal(name,'get_loyalty_brand_read_snapshot');assert.equal(args.p_slug,'brand');calls++;return{data,error};},from:()=>assert.fail('Snapshot must not launch table requests')})},
 '@/lib/data/loyalty-identity':appearance,'@/lib/data/loyalty-cards':cards,
 '@/lib/menu/logo-variants':{standaloneLogoVariant:()=>variant},
 '@/lib/storage/resolve-storage-url':{storageBucketForLogo:()=> 'cafe-logos',resolvePublishedStoragePathToUrl:async(bucket,path)=>{assert.equal(bucket,'cafe-logos');storage.push(path);return path==='allowed'?'https://signed.example/logo.svg':undefined;}},
});
const read=()=>snapshot.loadPublicLoyaltyBrandSnapshot('brand');
const experience=load('lib/data/loyalty-experience.ts',{
 '@/lib/data/loyalty-brand-snapshot':snapshot,
 '@/lib/data/feature-entitlements':{getPublicCafeFeatureCodesBySlug:()=>assert.fail('Joined fresh gate replaces subscription waterfall')},
 '@/lib/data/cafes':{getCafeBySlug:()=>assert.fail('Public snapshot must not repeat RLS cafe lookup')},
});
let result=await experience.getLoyaltyBrand('brand');
check(calls===1&&storage.length===0,'anonymous inline-logo brand needs exactly one database request');
check(result.program.purchasesRequired===6&&result.program.rewardProductName==='Drink','program promise retained');
check(result.identity.cardBackground==='#53621c'&&result.identity.cardForeground==='#ffe8c5'&&result.identity.cardAccent==='#d5ed60','Jamila absent palette retains olive identity');
check(result.identity.logoUrl==='/original.svg'&&result.program.cardDesign.keep==='layout','original SVG and design fields retained');
for(const palette of [{},{text:'#ffffff'},{primary:null},{primary:'#222222',secondary:'#77aa22',text:'#ffffff'}]){
 data=base();data.appearance.palette=palette;result=await read();
 assert.deepEqual({background:result.program.cardBackground,foreground:result.program.cardForeground,accent:result.program.cardAccent},colors.approvedLoyaltyColors(data.cafe.slug,palette));checks++;
}
data=base();data.program.enabled=false;check((await read()).program.enabled===false,'disabled state never hidden by previous result');
data=null;check(await read()===null,'revoked current snapshot never serves cached brand');
data={requiresSessionVisibility:true};check(await read()==='session','private preview requires existing session path');
data=base();data.settings.logo_storage_path='allowed';storage=[];check((await read()).identity.logoUrl==='https://signed.example/logo.svg'&&storage.length===1,'stored logo retains separate published asset authorization');
data=base();data.settings.logo_storage_path='denied';storage=[];check((await read()).identity.logoUrl==='/original.svg','denied asset falls back to already public original logo');
data=base();data.settings={logo_url:null,logo_storage_path:'denied'};data.appearance.logo_storage_path='denied';storage=[];check((await read()).identity.logoUrl===null&&storage.length===1,'repeated denied source checked once and never exposed');
variant='/reviewed-transparent.webp';data=base();data.settings.logo_storage_path='reviewed';storage=[];check((await read()).identity.logoUrl===variant&&storage.length===0,'reviewed local logo bypasses unnecessary remote signing');variant=null;
data=base();data.cafe.business_category='hair_salons';data.settings=null;data.appearance.logo_url='/salon.svg';check((await read()).identity.logoUrl==='/salon.svg','salon identity fallback retained');
data=base();data.program=null;check((await read()).program.enabled===false,'missing program defaults disabled');
data=base();error={message:'PRIVATE_DATABASE_ERROR'};await assert.rejects(read,e=>!e.message.includes('PRIVATE'));checks++;
console.log(`PASS ${checks} one-roundtrip public composition, fresh gates, approved palettes, SVG/storage and private-preview behavior checks`);
