import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyRows,hash} from './prepare-dabab-hospital-white.mjs';
let checks=0;
const make=()=>{const rows=[1,2,3].map(n=>({key:`item-${n}`,before:{id:String(n),name:`Product ${n}`,price:14,commerce_details:{menuPriceRange:{min:14,max:18}},image_storage_path:`old/${n}`,updated_at:'before'},asset:{path:`new/${n}`}})),state=new Map(rows.map(r=>[r.before.id,structuredClone(r.before)]));let clock=0;return {rows,state,adapter:{get:async id=>structuredClone(state.get(id)),cas:async(current,path)=>{assert.deepEqual(state.get(current.id),current);const result={...current,image_storage_path:path,updated_at:`after-${++clock}`};state.set(current.id,result);return structuredClone(result);}}};};
{
 const f=make(),log=[];await applyRows(f.rows,f.adapter,log);assert.equal(log.length,3);assert(f.rows.every(r=>f.state.get(r.before.id).image_storage_path===r.asset.path));checks+=2;
}
{
 const f=make();f.state.get('1').price=20;await assert.rejects(()=>applyRows(f.rows,f.adapter,[]),/Concurrent edit/);assert.equal(f.state.get('2').image_storage_path,'old/2');checks+=2;
}
{
 const f=make(),cas=f.adapter.cas;f.adapter.cas=async(current,path)=>current.id==='2'&&path.startsWith('new/')?null:cas(current,path);let error;try{await applyRows(f.rows,f.adapter,[]);}catch(e){error=e;}assert(error);assert.deepEqual(error.compensated,[{id:'1',success:true}]);assert.equal(f.state.get('1').image_storage_path,'old/1');assert.equal(f.state.get('3').image_storage_path,'old/3');checks+=4;
}
{
 const f=make(),cas=f.adapter.cas;f.adapter.cas=async(current,path)=>{if(current.id==='2'){f.state.get('1').price=99;throw Error('request failure');}return cas(current,path);};let error;try{await applyRows(f.rows,f.adapter,[]);}catch(e){error=e;}assert(error);assert.equal(error.compensated[0].success,false);assert.equal(f.state.get('1').price,99);assert.equal(f.state.get('1').image_storage_path,'new/1');checks+=4;
}
{
 const f=make(),cas=f.adapter.cas;f.adapter.cas=async(current,path)=>{const result=await cas(current,path);if(path.startsWith('new/')){result.price=25;f.state.set(current.id,result);}return result;};await assert.rejects(()=>applyRows(f.rows,f.adapter,[]),/Unexpected non-image/);assert.equal(f.state.get('2').image_storage_path,'old/2');checks+=2;
}
fs.writeFileSync('output/dabab-hospital-white/db-checks.json',JSON.stringify({at:new Date().toISOString(),checks,passed:true,runtime:process.version,inputs:Object.fromEntries(['prepare-dabab-hospital-white.mjs','check-dabab-hospital-white.mjs'].map(f=>[f,hash(fs.readFileSync(`scripts/${f}`))]))},null,2)+'\n');console.log(`${checks} CAS preservation and compensation checks passed`);
