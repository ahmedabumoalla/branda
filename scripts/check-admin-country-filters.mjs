import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const dependency = createRequire(import.meta.url);
function load(file,stubs={}) {
  const exports={};
  const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('require','exports',output)(name=>name==='server-only'?{}:Object.hasOwn(stubs,name)?stubs[name]:name.startsWith('@/')?load(`${name.slice(2)}.ts`,stubs):dependency(name),exports);
  return exports;
}
const fixture=Array.from({length:1001},(_,index)=>({id:`00000000-0000-4000-8000-${String(1001-index).padStart(12,'0')}`,name:`Brand ${index}`,phone_country:index===1000?'EG':'SA',status:'active',created_at:'2026-11-24T00:00:00+00:00'}));
const reads=[];
const client={from(table){
  const filters={table,limit:500};
  const builder={select(){return this;},is(){return this;},lte(){return this;},order(){return this;},limit(value){filters.limit=value;return this;},
    eq(column,value){filters[column]=value;return this;},in(column,ids){filters.ids=ids;return this;},or(value){filters.cursor=value.match(/id\.lt\.([0-9a-f-]+)/)[1];return this;},
    maybeSingle:async()=>({data:{role:'platform_admin',status:'active'},error:null}),
    then(resolve){reads.push({...filters});const data=table==='subscriptions'?[]:fixture.filter(row=>(!filters.id||row.id===filters.id)&&(!filters.phone_country||row.phone_country===filters.phone_country)&&(!filters.cursor||row.id<filters.cursor)&&(!filters.ids||filters.ids.includes(row.id))).slice(0,filters.limit);return Promise.resolve({data,error:null}).then(resolve);}};
  return builder;
}};
const {getAdminDirectoryRows}=load('lib/data/admin-directory-rows.ts');
const rows=await getAdminDirectoryRows(client);
assert.equal(rows.length,1001);assert.equal(new Set(rows.map(row=>row.id)).size,1001);
assert.equal(rows.filter(row=>row.phone_country==='EG').length,1);
assert.equal(reads.filter(read=>read.table==='cafes').length,4);
assert.deepEqual((await getAdminDirectoryRows(client,fixture.at(-1).id)).map(row=>row.id),[fixture.at(-1).id]);
const {getAdminBrandCountries}=load('lib/data/admin-brand-countries.ts');
const countries=await getAdminBrandCountries(client,fixture.map(row=>row.id));
assert.equal(countries.size,1001);assert.equal(countries.get(fixture.at(-1).id),'EG');
assert(reads.filter(read=>read.ids).every(read=>read.ids.length<=100));
await assert.rejects(()=>getAdminBrandCountries(client,['00000000-0000-4000-8000-999999999999']),/Incomplete/);
const {getAdminBrandExportSnapshot}=load('lib/data/admin-brand-export.ts',{'@/lib/data/cafes':{requirePlatformAdmin:async()=>({id:'admin'})},'@/lib/supabase/server':{createClient:async()=>client}});
const egypt=await getAdminBrandExportSnapshot('EG');
assert.deepEqual(egypt.brands.map(row=>row.id),[fixture.at(-1).id]);
const all=await getAdminBrandExportSnapshot();assert.equal(all.brands.length,1001);
await assert.rejects(()=>getAdminBrandExportSnapshot('ZZ'));
assert(reads.some(read=>read.table==='cafes'&&read.phone_country==='EG'));
console.log('PASS admin country boundaries: 1001 brands, country beyond first API page, stable cursor, bounded lookups, country-scoped Excel and invalid-country rejection');
