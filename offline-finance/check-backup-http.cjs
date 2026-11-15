'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {createRuntime}=require('./server.cjs');
const {installNetworkGuard}=require('./network-guard.cjs');installNetworkGuard();
const result={startedAt:new Date().toISOString(),checks:[]};
const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);};
async function login(runtime,setup=false){const s=await (await fetch(runtime.origin+'/api/session')).json();const r=await fetch(runtime.origin+(setup?'/api/setup':'/api/login'),{method:'POST',headers:{Origin:runtime.origin,'X-CSRF-Token':s.csrf,'Content-Type':'application/json'},body:JSON.stringify({username:'backupowner',password:'backup-owner-password',name:'مالك النسخة',company:'اختبار النسخ'})});assert.equal(r.status,200,await r.text());const cookie=r.headers.get('set-cookie').split(';')[0],session=await(await fetch(runtime.origin+'/api/session',{headers:{Cookie:cookie}})).json();return{Cookie:cookie,Origin:runtime.origin,'X-CSRF-Token':session.csrf,'Content-Type':'application/json'};}
(async()=>{let original,target;try{
 const base=path.resolve('output/offline-finance-integration-20261114/http-backup-'+Date.now());original=await createRuntime({dataDir:path.join(base,'original')});const auth=await login(original,true);
 let r=await fetch(original.origin+'/api/backup',{method:'POST',headers:auth,body:'{}'});check('Owner downloads complete archive',r.status===200&&r.headers.get('content-type')==='application/octet-stream');const archive=Buffer.from(await r.arrayBuffer());check('Archive contains PostgreSQL database',archive.length>1000000);
 r=await fetch(original.origin+'/api/restore',{method:'POST',headers:auth,body:archive});check('Existing company restore denied',r.status===403||r.status===409);
 target=await createRuntime({dataDir:path.join(base,'restored')});const session=await(await fetch(target.origin+'/api/session')).json();r=await fetch(target.origin+'/api/restore',{method:'POST',headers:{Origin:target.origin,'X-CSRF-Token':session.csrf,'Content-Type':'application/octet-stream'},body:archive});check('First setup restores original database',r.status===200);
 const restoredAuth=await login(target);r=await fetch(target.origin+'/api/users',{headers:restoredAuth});const users=await r.json();check('Restored owner credentials and users preserved',r.status===200&&users.users[0].username==='backupowner');
 r=await fetch(target.origin+'/api/action',{method:'POST',headers:restoredAuth,body:JSON.stringify({module:'@/app/actions/brand-finance',name:'fetchBrandFinanceAction',args:[]})});check('Original finance actions work after restore',(await r.json()).ok===true);
 result.passed=true;
}catch(error){result.passed=false;result.error=error.stack;process.exitCode=1;}finally{await original?.close();await target?.close();result.finishedAt=new Date().toISOString();fs.writeFileSync('output/offline-finance-integration-20261114/backup-http-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}})();
