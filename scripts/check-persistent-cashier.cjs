const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {NextRequest,NextResponse}=require('next/server');
let row={expires_at:'9999-12-31T00:00:00Z',revoked_at:null},error=null,reads=0;
const query={select(){return this;},eq(){return this;},is(){return this;},gt(){return this;},abortSignal(){return this;},async maybeSingle(){reads++;return{data:row,error};}};
const code=ts.transpileModule(fs.readFileSync('lib/cashier/persistent-session.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const api={};new Function('require','exports',code)(name=>name==='@/lib/supabase/admin'?{createAdminClient:()=>({from:()=>query})}:require(name),api);
const request=(path='/cashier',method='GET',token='a'.repeat(48))=>new NextRequest('https://example.test'+path,{method,headers:{cookie:'barndaksa_cashier_session='+token}});
(async()=>{
 let result=await api.refreshCashierCookie(request(),NextResponse.next());
 assert.equal(result.cookies.get('barndaksa_cashier_session').maxAge,400*24*60*60);
 assert.equal(result.cookies.get('barndaksa_cashier_session').httpOnly,true);
 for(const data of [null,{expires_at:'2020-01-01',revoked_at:null},{expires_at:'9999-12-31',revoked_at:'2026-11-13'},{expires_at:'2099-01-01',revoked_at:null}]){
  row=data;result=await api.refreshCashierCookie(request(),NextResponse.next());assert.equal(result.cookies.getAll().length,0);
 }
 row={expires_at:'9999-12-31',revoked_at:null};error={message:'unavailable'};
 result=await api.refreshCashierCookie(request(),NextResponse.next());assert.equal(result.cookies.getAll().length,0);
 const before=reads;
 for(const req of [request('/cashier','POST'),request('/cashier/session/clear'),request('/pager','GET','bad')]){
  result=await api.refreshCashierCookie(req,NextResponse.next());assert.equal(result.cookies.getAll().length,0);
 }
 assert.equal(reads,before);
 const routeCode=ts.transpileModule(fs.readFileSync('app/api/cashier/session/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const route={};let status='valid',persistent=true;
 new Function('require','exports',routeCode)(name=>name==='@/lib/cashier/persistent-session'?api:name==='@/lib/cashier/session-recovery'?{cashierSessionStatus:async(_req,callback)=>{if(persistent)callback();return status;}}:require(name),route);
 result=await route.GET(request('/api/cashier/session'));
 assert.equal(result.cookies.get('barndaksa_cashier_session').maxAge,400*24*60*60);
 for(const value of ['expired','changed','unavailable']) { status=value;result=await route.GET(request('/api/cashier/session'));assert.equal(result.cookies.getAll().length,0); }
 status='valid';persistent=false;result=await route.GET(request('/api/cashier/session'));assert.equal(result.cookies.getAll().length,0);
 console.log('PASS persistent cashier refresh, year-long retention, revoked/expired/owner denial, logout and outage preservation');
})().catch(e=>{console.error(e);process.exitCode=1});
