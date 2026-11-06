import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import ts from "typescript";

const require=createRequire(import.meta.url),root=process.cwd();
const brand="00000000-0000-4000-8000-000000000010",actor="00000000-0000-4000-8000-000000000001";
function harness(options={}) {
 const calls=[],invalidations=[],cache=new Map();
 let name="ضباب",stored={cafe_id:brand,owner_name:"Owner",owner_email:"owner@example.test",owner_phone:"0500000001",description:"Original",logo_storage_path:"brand/logo.webp",theme_id:"editorial"};
 const context={id:brand,slug:"brand-dabab",name:"ضباب",businessCategory:"cafes_coffee",role:options.role==="platform_admin"?"platform_admin":"owner"};
 const session={auth:{async getUser(){calls.push("auth");return {data:{user:options.signedOut?null:{id:actor}},error:options.authError??null};}},from(table){
  calls.push(`table:${table}`);const query={select(){return query;},eq(key,value){calls.push([table,key,value]);return query;},async maybeSingle(){if(table==="profiles")return {data:{role:options.role??"cafe_owner",status:options.inactive?"suspended":"active"},error:options.profileError??null};if(table==="cafe_settings")return {data:stored,error:null};throw Error(`Unexpected table ${table}`);}};return query;
 },async rpc(rpc,args){calls.push({rpc,args});assert.equal(rpc,"save_owner_cafe_settings");assert.equal(args.p_cafe_id,brand);
  if(options.rpcError)return {data:null,error:options.rpcError};
  if(options.missingData)return {data:null,error:null};
  name=options.canonicalName??args.p_settings.cafe_name;stored={...stored,...Object.fromEntries(Object.entries(args.p_settings).filter(([key,val])=>key!=="cafe_name"&&val!==undefined))};
  return {data:{cafe:{id:options.wrongBrand?"other-brand":brand,slug:"brand-dabab",name,business_category:"cafes_coffee"},settings:stored},error:null};
 }};
 const maintenance=options.maintenance??{adminUserId:actor,cafeId:brand,expiresAt:Date.now()+60000};
 const mocks={"server-only":{},"@/lib/supabase/server":{createClient:async()=>session},"@/lib/data/cafes":{
  requireOwnerCafeContext:async()=>{calls.push("context");if(options.contextError)throw Error("Forbidden");return {...context,name:options.freshContext?name:context.name};},getCafeBySlug:async()=>({id:brand,slug:context.slug,name,business_category:"cafes_coffee"})},
  "@/lib/platform/maintenance":{readMaintenanceSessionCookie:async()=>options.noMaintenance?null:maintenance},
  "@/lib/data/mappers":{mapDbSettingsToCafeSettings:(slug,row)=>({cafeSlug:slug,cafeName:slug,ownerName:row.owner_name??"",ownerEmail:row.owner_email??"",ownerPhone:row.owner_phone??"",description:row.description??undefined,logoAssetId:row.logo_storage_path??undefined,domainStatus:"غير مربوط"})},
  "@/lib/storage/resolve-storage-url":{resolvePublishedStoragePathToUrl:async(bucket,key)=>`https://assets.example.test/${bucket}/${key}`,storageBucketForLogo:()=>"cafe-logos"},
  "@/lib/data/owner-service-access":{assertOwnerServiceEnabled:async(feature)=>{calls.push(`entitlement:${feature}`);if(options.noEntitlement)throw Error("Service unavailable");}},
  "next/cache":{revalidatePath:(...args)=>invalidations.push(args)},
 };
 function load(file){if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(path.join(root,file),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function("require","module","exports",code)(key=>key in mocks?mocks[key]:key.startsWith("@/")?load(key.slice(2)+".ts"):require(key),{exports},exports);return exports;}
 return {...load("lib/data/settings.ts"),...load("app/actions/settings.ts"),calls,invalidations,name:()=>name};
}
const input={cafeSlug:"brand-dabab",cafeName:"بار ضباب",ownerName:"Owner",ownerEmail:"owner@example.test",ownerPhone:"0500000001",description:"Original",logoAssetId:"brand/logo.webp",domainStatus:"غير مربوط"};
const results=[];
async function test(name,run){await run();results.push(name);console.log("PASS",name);}
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error("Real network forbidden in settings tests");};
try {
 await test("Action forwards cafeName and returns database-confirmed values instead of client draft",async()=>{
  const h=harness({canonicalName:"بار ضباب المحفوظ"});const saved=await h.saveSettingsAction({...input,cafeName:"  بار ضباب  ",cafeSlug:"attacker-brand"});const rpc=h.calls.find(c=>c.rpc);
  assert.equal(rpc.args.p_settings.cafe_name,"بار ضباب");assert.equal(saved.cafeName,"بار ضباب المحفوظ");assert.equal(saved.cafeSlug,"brand-dabab");assert.equal(saved.logoDataUrl,"https://assets.example.test/cafe-logos/brand/logo.webp");assert(!("cafe_id" in rpc.args.p_settings));assert(!("slug" in rpc.args.p_settings));
  assert.deepEqual(h.invalidations,[["/dashboard","layout"],["/menu/brand-dabab"],["/salon/brand-dabab"],["/loyalty/brand-dabab"],["/"]]);
 });
 await test("Same-request stale cafe cache cannot overwrite the transaction's saved name",async()=>{
  const h=harness();const saved=await h.saveSettingsAction(input);assert.equal(saved.cafeName,"بار ضباب");assert.equal(h.name(),"بار ضباب");assert.equal((await h.getOwnerCafeSettings()).cafeName,"ضباب","Fixture deliberately keeps React request context stale");
 });
 await test("A new independent owner read sees the persisted name",async()=>{
  const h=harness({freshContext:true});await h.saveSettingsAction(input);assert.equal((await h.getOwnerCafeSettings()).cafeName,"بار ضباب");
 });
 await test("Invalid brand names cannot reach the mutation RPC",async()=>{
  for(const cafeName of [undefined,"","   ","x".repeat(161),"bad\nname",12]){const h=harness();await assert.rejects(()=>h.saveSettingsAction({...input,cafeName}));assert(!h.calls.some(c=>c.rpc));assert.equal(h.invalidations.length,0);}
 });
 await test("Session and active-profile checks protect both owner reads and saves",async()=>{
  for(const options of [{signedOut:true},{authError:Error("expired")},{inactive:true},{profileError:Error("query failed")},{contextError:true}])for(const operation of ["save","read"]){const h=harness(options);await assert.rejects(()=>operation==="save"?h.saveSettingsAction(input):h.getOwnerCafeSettings());assert(!h.calls.some(c=>c.rpc));assert(!h.calls.includes("table:cafe_settings"));}
 });
 await test("Admin settings require unexpired signed maintenance for the same actor and selected brand",async()=>{
  for(const options of [{noMaintenance:true},{maintenance:{adminUserId:"other",cafeId:brand,expiresAt:Date.now()+60000}},{maintenance:{adminUserId:actor,cafeId:"other-brand",expiresAt:Date.now()+60000}},{maintenance:{adminUserId:actor,cafeId:brand,expiresAt:Date.now()-1}}]){const h=harness({role:"platform_admin",...options});await assert.rejects(()=>h.saveSettingsAction(input));assert(!h.calls.some(c=>c.rpc));}
  const h=harness({role:"platform_admin"});assert.equal((await h.saveSettingsAction(input)).cafeName,"بار ضباب");assert.equal(h.calls.filter(c=>c.rpc).length,1);
 });
 await test("Existing settings entitlement is still required before mutations",async()=>{
  const h=harness({noEntitlement:true});await assert.rejects(()=>h.saveSettingsAction(input));assert(!h.calls.some(c=>c.rpc));assert.equal(h.invalidations.length,0);
 });
 await test("Database denial, missing row and mismatched tenant never report success or invalidate caches",async()=>{
  for(const options of [{rpcError:{code:"42501",message:"private details"}},{rpcError:{code:"P0002",message:"private details"}},{missingData:true},{wrongBrand:true}]){const h=harness(options);await assert.rejects(()=>h.saveSettingsAction(input),error=>!error.message.includes("private details"));assert.equal(h.invalidations.length,0);}
 });
 await test("Owner fields retain established mapping and no service-role client is needed",async()=>{
  const h=harness();await h.saveSettingsAction({...input,ownerName:"Updated owner",ownerEmail:"",taxNumber:"123",instagram:"brand",customDomain:"example.test"});const payload=h.calls.find(c=>c.rpc).args.p_settings;
  assert.equal(payload.owner_name,"Updated owner");assert.equal(payload.owner_email,null);assert.equal(payload.tax_number,"123");assert.equal(payload.instagram,"brand");assert.equal(payload.custom_domain,"example.test");assert.equal(payload.logo_storage_path,"brand/logo.webp");assert.equal(payload.theme_id,undefined);
  assert(!fs.readFileSync("lib/data/settings.ts","utf8").includes("createAdminClient"));
 });
 const files=["lib/data/settings.ts","app/actions/settings.ts","scripts/check-owner-settings-backend.mjs","lib/data/mappers.ts","lib/platform/maintenance.ts","lib/mock/cafe-settings.ts","package.json","package-lock.json","tsconfig.json"];
 const inputs=Object.fromEntries(files.map(file=>[file,createHash("sha256").update(fs.readFileSync(file)).digest("hex")]));fs.mkdirSync("output/owner-settings",{recursive:true});fs.writeFileSync("output/owner-settings/backend-checks.json",JSON.stringify({executedAt:new Date().toISOString(),runtime:process.version,checks:results.length,results,inputs,scope:"Mocked authenticated database and cache; no live/network operations"},null,2)+"\n");
 console.log(`Owner settings backend: ${results.length} grouped checks passed`);
} finally {globalThis.fetch=originalFetch;}
