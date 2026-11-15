'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const data=path.resolve(process.argv[2]||'output/offline-finance-integration-20261114/local-test'),origin=JSON.parse(fs.readFileSync(path.join(data,'running.json'))).url;let cookie='',csrf='';
const result={startedAt:new Date().toISOString(),checks:[]};
async function request(route,input,auth={cookie,csrf}){const response=await fetch(origin+route,{method:input===undefined?'GET':'POST',headers:{Origin:origin,...(auth.cookie?{Cookie:auth.cookie}:{}),...(input===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':auth.csrf})},body:input===undefined?undefined:JSON.stringify(input)});const body=await response.json();return{status:response.status,body,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);};
(async()=>{try{
 let r=await request('/api/session');csrf=r.body.csrf;check('Uninitialized anonymous session',r.status===200&&!r.body.authenticated);
 r=await request(r.body.initialized?'/api/login':'/api/setup',r.body.initialized?{username:'owner',password:'owner-test-password'}:{company:'اختبار المالية المحلية',name:'مالك الاختبار',username:'owner',password:'owner-test-password'});check('Owner setup or login',r.status===200);cookie=r.cookie;
 r=await request('/api/session');csrf=r.body.csrf;check('Original snapshot available',r.body.authenticated&&r.body.snapshot?.role==='owner'&&r.body.snapshot.accounts.length>0);const owner={cookie,csrf};
 const username='cashier'+Date.now();r=await request('/api/users',{username,name:'كاشير الاختبار',role:'cashier',active:true,password:'cashier-test-password'});check('Owner creates named user',r.status===200&&r.body.user.id);const user=r.body.user;
 r=await request('/api/users');check('Users response never exposes password hashes',r.status===200&&!JSON.stringify(r.body).includes('password_hash'));
 r=await request('/api/session',undefined,{cookie:'',csrf:''});const anon={cookie:'',csrf:r.body.csrf};r=await request('/api/login',{username,password:'cashier-test-password'},anon);check('Named cashier login',r.status===200);const cashierCookie=r.cookie;r=await request('/api/session',undefined,{cookie:cashierCookie,csrf:''});const cashier={cookie:cashierCookie,csrf:r.body.csrf};
 check('Cashier role comes from server',r.body.snapshot.role==='cashier');r=await request('/api/users',undefined,cashier);check('Cashier cannot enumerate users',r.status===403);
 r=await request('/api/users',{username:'illegal',name:'مستخدم',role:'manager',password:'other-test-password'},cashier);check('Cashier cannot create privileged users',r.status===403);
 r=await request('/api/password',{currentPassword:'wrong-password',newPassword:'new-cashier-password'},cashier);check('Self password change requires current secret',r.status===400);
 r=await request('/api/users',{...user,password:'reset-cashier-password'},owner);check('Owner resets user password',r.status===200);
 r=await request('/api/session',undefined,cashier);check('Reset immediately revokes existing sessions',!r.body.authenticated);
 r=await request('/api/login',{username,password:'cashier-test-password'},anon);check('Previous password rejected',r.status===401);
 r=await request('/api/login',{username,password:'reset-cashier-password'},anon);check('Replacement password accepted',r.status===200);
 r=await request('/api/users',{...user,active:false},owner);check('Owner disables user',r.status===200);
 r=await request('/api/login',{username,password:'reset-cashier-password'},anon);check('Disabled user denied',r.status===401);
 r=await request('/api/users',{username:'forged',name:'مستخدم',role:'cashier',password:'other-test-password'},{cookie:owner.cookie,csrf:'forged'});check('CSRF required',r.status===403);
 r=await request('/api/action',{module:'@/app/actions/brand-finance',name:'fetchBrandFinanceAction',args:[]},owner);check('Original action and DAL run against local database',r.status===200&&r.body.ok===true);
 result.passed=true;
}catch(error){result.passed=false;result.error=error.message;process.exitCode=1;}finally{result.finishedAt=new Date().toISOString();fs.mkdirSync('output/offline-finance-integration-20261114',{recursive:true});fs.writeFileSync('output/offline-finance-integration-20261114/auth-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}})();
