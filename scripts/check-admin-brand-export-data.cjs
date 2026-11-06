async function main(){
const [{default:assert},{default:fs},{default:ts},{default:crypto}]=await Promise.all([import('node:assert/strict'),import('node:fs'),import('typescript'),import('node:crypto')]);
const file='lib/data/admin-brand-export.ts',code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const brand=(n,patch={})=>({id:id(n),name:`Brand ${n}`,status:'active',created_at:'2026-10-01T23:30:00.123456+00:00',deleted_at:null,...patch});
const subscription=(n,cafe,patch={})=>({id:id(10000+n),cafe_id:cafe,created_at:'2026-10-02T00:00:00.123456+00:00',status:'active',activation_source:'brand_card_checkout',plan_id:'menu',plan_name_snapshot:'Menu plan',started_at:'2026-10-02T00:00:00+00:00',expires_at:'2026-12-01T00:00:00+00:00',amount_sar:'99.50',platform_plans:{active:true},...patch});
function harness(options={}){
 const calls=[],tables=[],brands=options.brands??[brand(1)],subscriptions=options.subscriptions??[];
 let queried=0;
 const client={from(table){tables.push(table);const state={table,filters:[],orders:[]};calls.push(state);const query={
  select(columns){state.columns=columns;return query;},eq(key,value){state.filters.push(['eq',key,value]);return query;},is(key,value){state.filters.push(['is',key,value]);return query;},lte(key,value){state.filters.push(['lte',key,value]);return query;},in(key,value){state.filters.push(['in',key,value]);return query;},order(key,value){state.orders.push([key,value]);return query;},limit(value){state.limit=value;return query;},or(value){state.cursor=value;return query;},
  async maybeSingle(){assert.equal(table,'profiles');return {data:options.profile??{role:'platform_admin',status:'active'},error:options.profileError??null};},
  then(resolve,reject){return Promise.resolve().then(()=>{
   queried++;if(options.failAt===queried)return {data:null,error:{message:'private database failure'}};
   let rows=[...(table==='cafes'?brands:subscriptions)];
   for(const [op,key,v] of state.filters){if(op==='is'||op==='eq')rows=rows.filter(r=>r[key]===v);if(op==='in')rows=rows.filter(r=>v.includes(r[key]));if(op==='lte')rows=rows.filter(r=>Date.parse(r[key])<=Date.parse(v));}
   rows.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
   if(state.cursor&&!options.ignoreCursor){const match=state.cursor.match(/^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.(.+)\)$/);assert(match);assert.equal(match[1],match[2]);rows=rows.filter(r=>r.created_at<match[1]||r.created_at===match[1]&&r.id<match[3]);}
   if(options.injectWrongScope&&table==='subscriptions')rows=[subscription(777,id(777))];
   return {data:rows.slice(0,Math.min(state.limit,options.serverCap??Infinity)).map(row=>options.malformedCreatedAt?{...row,created_at:'invalid'}:row),error:null};
  }).then(resolve,reject);}
 };return query;}};
 const exports={};new Function('require','exports',code)(name=>{
  if(name==='server-only')return {};
  if(name==='@/lib/data/cafes')return {requirePlatformAdmin:async()=>{calls.push('authorize');if(options.authError)throw Error(options.authError);return {id:id(9999)};}};
  if(name==='@/lib/supabase/server')return {createClient:async()=>{calls.push('client');return client;}};
  throw Error(`Unexpected dependency: ${name}`);
 },exports);
 return {...exports,calls,tables};
}
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS',name);};
const oldFetch=global.fetch;global.fetch=async()=>{throw Error('Real network forbidden in export tests');};
await (async()=>{
 await test('Unauthorized/non-admin cannot construct a client or query brands',async()=>{for(const authError of ['Unauthorized','Forbidden']){const h=harness({authError});await assert.rejects(h.getAdminBrandExportSnapshot,RegExp(authError));assert.deepEqual(h.calls,['authorize']);}});
 await test('Suspended, missing, failed and changed administrator profiles fail before catalog access',async()=>{for(const options of [{profile:{role:'platform_admin',status:'suspended'}},{profile:{role:'cafe_owner',status:'active'}},{profile:{}},{profileError:{message:'private'}}]){const h=harness(options);await assert.rejects(h.getAdminBrandExportSnapshot,/active platform admin/);assert.deepEqual(h.tables,['profiles']);}});
 await test('Fresh snapshot exports exact original join timestamps and raw account/subscription state without PII',async()=>{
  const h=harness({brands:[brand(1,{status:'archived',owner_phone:'private'})],subscriptions:[subscription(1,id(1),{status:'trialing',activation_source:'admin_prepared_trial',expires_at:null,amount_sar:0,private_token:'secret'})]});
  const s=await h.getAdminBrandExportSnapshot();assert(Number.isFinite(Date.parse(s.exportedAt)));assert.equal(s.brands[0].createdAt,'2026-10-01T23:30:00.123456+00:00');assert.equal(s.brands[0].accountStatus,'archived');assert.equal(s.brands[0].subscriptions[0].status,'trialing');assert.equal(s.brands[0].subscriptions[0].activation_source,'admin_prepared_trial');assert.equal(s.brands[0].subscriptions[0].expires_at,null);assert(!JSON.stringify(s).includes('private'));assert(!JSON.stringify(s).includes('secret'));assert(h.calls.indexOf('authorize')<h.calls.indexOf('client'));
  for(const c of h.calls.filter(c=>c.table==='cafes'||c.table==='subscriptions')){assert(!c.columns.includes('*'));assert.equal(c.limit,500);assert.deepEqual(c.orders,[['created_at',{ascending:false}],['id',{ascending:false}]]);assert(c.filters.some(f=>f[0]==='lte'&&f[2]===s.exportedAt));}
 });
 await test('All brands beyond REST row limits and UI pages are read with stable tie pagination',async()=>{
  const brands=Array.from({length:1203},(_,i)=>brand(i+1));const h=harness({brands,serverCap:173});const s=await h.getAdminBrandExportSnapshot();assert.equal(s.brands.length,1203);assert.equal(new Set(s.brands.map(b=>b.id)).size,1203);assert.equal(s.brands[0].id,id(1203));assert.equal(s.brands.at(-1).id,id(1));assert(h.calls.some(c=>c.cursor?.includes('.123456+00:00')));
  for(const c of h.calls.filter(c=>c.table==='subscriptions'))assert(c.filters.find(f=>f[0]==='in')[2].length<=100);
 });
 await test('More than1000 historical subscriptions are complete and grouped only into their owning brands',async()=>{
  const rows=Array.from({length:1507},(_,i)=>subscription(i+1,i%2?id(1):id(2),{status:i%3?'active':'cancelled'}));const h=harness({brands:[brand(1),brand(2)],subscriptions:rows,serverCap:211});const s=await h.getAdminBrandExportSnapshot();assert.equal(s.brands.reduce((n,b)=>n+b.subscriptions.length,0),1507);for(const b of s.brands){assert.deepEqual(b.subscriptions.map(s=>s.id),rows.filter(r=>r.cafe_id===b.id).sort((a,b)=>b.id.localeCompare(a.id)).map(r=>r.id));assert(b.subscriptions.every(s=>s.amount_sar===99.5));}
 });
 await test('Soft-deleted and newly-created brands/subscriptions are not added during the export',async()=>{
  const h=harness({brands:[brand(1),brand(2,{deleted_at:'2026-10-03T00:00:00Z'}),brand(3,{created_at:'2099-01-01T00:00:00Z'})],subscriptions:[subscription(1,id(1)),subscription(2,id(1),{created_at:'2099-01-01T00:00:00Z'}),subscription(3,id(2))]});const s=await h.getAdminBrandExportSnapshot();assert.equal(s.brands.length,1);assert.equal(s.brands[0].subscriptions.length,1);
 });
 await test('Empty directory is a real empty result with no unrelated subscription reads',async()=>{const h=harness({brands:[]});const s=await h.getAdminBrandExportSnapshot();assert.deepEqual(s.brands,[]);assert(!h.tables.includes('subscriptions'));});
 await test('A failure on any later page aborts instead of returning a partial export',async()=>{for(const failAt of [2,4]){const h=harness({brands:[brand(1),brand(2)],subscriptions:[subscription(1,id(1))],serverCap:1,failAt});await assert.rejects(h.getAdminBrandExportSnapshot,error=>/Unable to read/.test(error.message)&&!error.message.includes('private'));}});
 await test('Ignored cursor, invalid pagination values and cross-brand result rows fail closed',async()=>{
  for(const options of [{ignoreCursor:true},{malformedCreatedAt:true},{brands:[brand(1,{id:'bad,filter'})]},{injectWrongScope:true}]){const h=harness(options);await assert.rejects(h.getAdminBrandExportSnapshot,/pagination|scope/);}
 });
 await test('Missing/inactive plan relationships are preserved as inactive, never inferred enabled',async()=>{const h=harness({subscriptions:[subscription(1,id(1),{platform_plans:null}),subscription(2,id(1),{platform_plans:{active:false}}),subscription(3,id(1),{platform_plans:{active:'true'}})]});const s=await h.getAdminBrandExportSnapshot();assert.deepEqual(s.brands[0].subscriptions.map(r=>r.platform_plans),[{active:false},{active:false},null]);});
 const files=[file,'scripts/check-admin-brand-export-data.cjs','lib/data/cafes.ts','lib/supabase/server.ts','package.json','package-lock.json','tsconfig.json'];fs.mkdirSync('output/brand-directory-export',{recursive:true});fs.writeFileSync('output/brand-directory-export/data-checks.json',JSON.stringify({at:new Date().toISOString(),runtime:process.version,result:'PASS',checks,network:'mocked; no live actions',inputs:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]))},null,2)+'\n');console.log(`PASS admin brand export data: ${checks} grouped checks`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=oldFetch;});
}
main().catch(error=>{console.error(error);process.exitCode=1;});
