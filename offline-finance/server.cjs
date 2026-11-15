'use strict';
// Loopback runtime. No cloud credential or customer export is required.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{promisify}=require('node:util'),{pathToFileURL}=require('node:url');
const scrypt=promisify(crypto.scrypt),ROOT=__dirname;
const roles=['owner','manager','accountant','warehouse','auditor','cashier'];
const problem=(message,status=400)=>Object.assign(new Error(message),{status});
const rows=r=>Array.isArray(r)?r:r.rows||[];
const safeUser=u=>({id:u.id,name:u.name,username:u.username,email:u.email,role:u.role,active:u.active,version:Number(u.version)});
async function passwordHash(password){if(typeof password!=='string'||password.length<10||password.length>128)throw problem('كلمة المرور من ١٠ إلى ١٢٨ حرفًا');const salt=crypto.randomBytes(24).toString('hex'),hash=await scrypt(password,salt,64);return salt+':'+hash.toString('hex');}
async function passwordMatches(password,stored){if(typeof password!=='string'||password.length>128)return false;const [salt,value]=String(stored).split(':');if(!salt||!value)return false;const hash=await scrypt(password,salt,64),original=Buffer.from(value,'hex');return original.length===hash.length&&crypto.timingSafeEqual(original,hash);}
function normalizedUser(input){const username=String(input.username||'').trim().toLowerCase(),name=String(input.name||'').trim();if(!/^[a-z0-9][a-z0-9_.-]{2,59}$/.test(username))throw problem('اسم الدخول من ٣ إلى ٦٠ حرفًا إنجليزيًا أو رقمًا دون مسافات');if(name.length<2||name.length>100)throw problem('أدخل اسم المستخدم من حرفين إلى ١٠٠ حرف');if(!roles.includes(input.role))throw problem('اختر دورًا صالحًا');return{username,name,role:input.role,email:username+'@offline.local'};}
async function createRuntime({dataDir,port=0,engine:providedEngine,actions:providedActions}={}){
 dataDir=path.resolve(dataDir||path.join(process.env.LOCALAPPDATA||ROOT,'BrandaFinanceOffline','v3'));fs.mkdirSync(dataDir,{recursive:true});
 const openEngine=async()=> (await import(pathToFileURL(path.join(ROOT,'engine/index.mjs')).href)).createEngine({dataDir:path.join(dataDir,'database')});
 let engine=providedEngine||await openEngine();
 await engine.querySystem(`create table if not exists public.local_auth_users(id uuid primary key,username text not null unique,email text not null,name text not null,role text not null,active boolean not null default true,password_hash text not null,version integer not null default 1,created_at timestamptz not null default now())`);
 await engine.querySystem('revoke all on public.local_auth_users from public');
 await engine.querySystem('revoke all on public.local_auth_users from authenticated');
 const sessions=new Map();let origin='',bootstrapBusy=false,loginFailures=0,blockedUntil=0;
 const csrf=crypto.randomBytes(32).toString('hex');
 let storage=require('./storage.cjs').createStorage({dataDir,engine,getOrigin:()=>origin});
 const selectUser=async id=>rows(await engine.querySystem('select * from public.local_auth_users where id=$1',[id]))[0];
 const initialized=async()=>rows(await engine.querySystem('select id from public.local_auth_users limit 1')).length>0;
 function issue(user){const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{id:user.id,version:user.version,csrf:crypto.randomBytes(32).toString('hex'),expires:Date.now()+30*86400000});return token;}
 function revoke(id){for(const[token,s]of sessions)if(s.id===id)sessions.delete(token);}
 async function session(req){const token=/(?:^|;\s*)branda_local=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1],s=token&&sessions.get(token);if(!s||s.expires<Date.now())return null;const user=await selectUser(s.id);if(!user||!user.active||Number(user.version)!==Number(s.version)){sessions.delete(token);return null;}return{...s,token,user:safeUser(user)};}
 async function createUser(input,actor){if(actor.role!=='owner')throw problem('إدارة المستخدمين متاحة للمالك فقط',403);const u=normalizedUser(input);if(u.role==='owner')throw problem('لا يمكن إنشاء مالك إضافي');const id=crypto.randomUUID(),hash=await passwordHash(input.password);if(rows(await engine.querySystem('select id from public.local_auth_users where username=$1',[u.username])).length)throw problem('اسم الدخول مستخدم بالفعل');await engine.provisionUser({id,...u,active:input.active!==false});try{await engine.querySystem('insert into public.local_auth_users(id,username,email,name,role,active,password_hash) values($1,$2,$3,$4,$5,$6,$7)',[id,u.username,u.email,u.name,u.role,input.active!==false,hash]);}catch{await engine.provisionUser({id,...u,active:false});throw problem('تعذر حفظ المستخدم تحقق من اسم الدخول');}return{id,...u,active:input.active!==false};}
 async function updateUser(input,actor){if(actor.role!=='owner')throw problem('إدارة المستخدمين متاحة للمالك فقط',403);const existing=await selectUser(input.id);if(!existing)throw problem('المستخدم غير موجود',404);const u=normalizedUser({...input,username:input.username||existing.username});if(existing.role==='owner'||input.id===actor.id)throw problem('استخدم تغيير كلمة مروري لحساب المالك');if(u.role==='owner')throw problem('لا يمكن تغيير دور المستخدم إلى مالك');const collision=rows(await engine.querySystem('select id from public.local_auth_users where username=$1 and id<>$2',[u.username,input.id]));if(collision.length)throw problem('اسم الدخول مستخدم بالفعل');const hash=input.password?await passwordHash(input.password):existing.password_hash;await engine.provisionUser({id:existing.id,...u,active:input.active!==false});await engine.querySystem('update public.local_auth_users set username=$2,email=$3,name=$4,role=$5,active=$6,password_hash=$7,version=version+1 where id=$1',[existing.id,u.username,u.email,u.name,u.role,input.active!==false,hash]);revoke(existing.id);return{id:existing.id,...u,active:input.active!==false};}
 let actions=providedActions;
 async function actionContext(actor,token){if(!actions){const bundled=path.join(ROOT,'actions/dist/actions.cjs');if(!fs.existsSync(bundled))throw problem('ملفات المالية غير مكتملة أعد فك الحزمة',503);actions=require(bundled);}const info=await engine.actorInfo(actor.id);if(!info)throw problem('لا تملك صلاحية هذه المنشأة',403);const cafe=info.cafe||{id:info.cafeId,name:info.company||info.name,slug:info.slug||'local-finance',businessCategory:'butcher_shops'};return{engine,user:actor,cafe,dataDir,origin,storage:storage.forActor(actor,cafe),createUser:input=>createUser({...input,username:input.username||String(input.email||'').split('@')[0]},actor),logout:async()=>{sessions.delete(token);}};}
 async function executeAction(actor,module,name,args,token){const context=await actionContext(actor,token);return actions.executeAction(context,module,name,args);}
 function decode(value,depth=0){if(depth>15)throw problem('بيانات متداخلة أكبر من المسموح');if(!value||typeof value!=='object')return value;if(value.$type==='File'){if(typeof value.data!=='string'||value.data.length>5*1024*1024)throw problem('حجم الملف أكبر من المسموح');return new File([Buffer.from(value.data,'base64')],String(value.name||'file'),{type:String(value.type||'application/octet-stream')});}if(value.$type==='FormData'){if(!Array.isArray(value.entries)||value.entries.length>100)throw problem('بيانات الملف غير صالحة');const form=new FormData();for(const[k,v]of value.entries)form.append(String(k),decode(v,depth+1));return form;}if(Array.isArray(value))return value.map(v=>decode(v,depth+1));return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v,depth+1)]));}
 const send=(res,status,value,headers={})=>{const body=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",...headers});res.end(body);};
 const cookie=token=>`branda_local=${token}; HttpOnly; SameSite=Strict; Path=/`;
 async function bytes(req,max=8*1024*1024){if(Number(req.headers['content-length']||0)>max)throw problem('حجم الطلب أكبر من المسموح',413);let length=0,chunks=[];for await(const chunk of req){length+=chunk.length;if(length>max)throw problem('حجم الطلب أكبر من المسموح',413);chunks.push(chunk);}return Buffer.concat(chunks);}
 async function body(req){try{return JSON.parse((await bytes(req)).toString('utf8')||'{}');}catch(error){if(error.status)throw error;throw problem('بيانات الطلب غير صالحة');}}
 let requestTail=Promise.resolve();
 const server=http.createServer((req,res)=>{const run=async()=>{try{
  if(req.headers.host!==origin.replace('http://','')||req.headers['sec-fetch-site']==='cross-site')throw problem('الوصول متاح من البرنامج المحلي فقط',403);
  const url=new URL(req.url,origin),route=url.pathname;
  if(req.method==='POST'&&req.headers.origin!==origin)throw problem('مصدر الطلب غير مسموح',403);
  const current=await session(req);
  if(route==='/api/restore'&&req.method==='POST'){
   if(req.headers['x-csrf-token']!==csrf)throw problem('أعد فتح الصفحة',403);
   if(await initialized())throw problem('الاستعادة متاحة قبل إعداد المنشأة فقط',409);
   const archive=await bytes(req,250*1024*1024),stage=path.join(dataDir,'recovery-'+crypto.randomUUID());
   const restored=await require('./backup.cjs').restoreBackup({archive,dataDir:stage});
   await restored.close();await engine.close();
   const database=path.join(dataDir,'database'),previous=path.join(dataDir,'empty-before-restore-'+crypto.randomUUID());
   fs.renameSync(database,previous);
   try{fs.renameSync(path.join(stage,'database'),database);if(fs.existsSync(path.join(stage,'files')))fs.renameSync(path.join(stage,'files'),path.join(dataDir,'files'));engine=await openEngine();storage=require('./storage.cjs').createStorage({dataDir,engine,getOrigin:()=>origin});sessions.clear();}
   catch(error){if(fs.existsSync(database))fs.renameSync(database,path.join(stage,'failed-database'));fs.renameSync(previous,database);engine=await openEngine();throw error;}
   return send(res,200,{ok:true});
  }
  if(route==='/api/storage/file'&&req.method==='GET'){if(!current)throw problem('سجل الدخول أولًا',401);const file=url.searchParams.has('token')?await storage.read(current.user,url.searchParams.get('token')):await storage.readPublic(current.user,url.searchParams.get('bucket'),url.searchParams.get('path'));return send(res,200,file.bytes,{'Content-Type':file.mime,'Content-Disposition':'inline; filename="'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_')+'"'});}
  if(route==='/api/storage/upload'&&req.method==='POST'){if(!current)throw problem('سجل الدخول أولًا',401);if(req.headers['x-csrf-token']!==current.csrf)throw problem('أعد فتح الصفحة',403);const form=await new Request(origin+route,{method:'POST',headers:{'Content-Type':req.headers['content-type']||''},body:await bytes(req,11*1024*1024)}).formData();return send(res,200,await storage.acceptUpload(current.user,{token:String(form.get('token')||''),bucket:String(form.get('bucket')||''),name:String(form.get('path')||''),file:form.get('file')}));}
  if(route.startsWith('/api/finance/')){if(!current)throw problem('سجل الدخول أولًا',401);if(req.method==='POST'&&req.headers['x-csrf-token']!==current.csrf)throw problem('أعد فتح الصفحة',403);const context=await actionContext(current.user,current.token);if(!actions.executeRoute)throw problem('مسار المالية غير مكتمل',503);const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:await bytes(req,11*1024*1024)})});const response=await actions.executeRoute(context,route,request);return send(res,response.status,Buffer.from(await response.arrayBuffer()),Object.fromEntries(response.headers));}
  if(route==='/api/session'&&req.method==='GET'){let snapshot=null;if(current){const result=await executeAction(current.user,'@/app/actions/brand-finance','fetchBrandFinanceAction',[],current.token);if(!result.ok)throw problem(result.message,503);snapshot=result.data;}return send(res,200,{initialized:await initialized(),authenticated:!!current,csrf:current?.csrf||csrf,user:current?.user||null,snapshot});}
  if(req.method==='POST'){
   if(req.headers['x-csrf-token']!==(current?.csrf||csrf))throw problem('أعد فتح الصفحة ثم حاول مجددًا',403);
   const input=await body(req);
   if(route==='/api/setup'){
    if(bootstrapBusy||await initialized())throw problem('تم إعداد المنشأة مسبقًا',409);bootstrapBusy=true;
    try{const u=normalizedUser({...input,role:'owner'}),company=String(input.company||'').trim();if(company.length<2||company.length>150)throw problem('أدخل اسم المنشأة');const hash=await passwordHash(input.password),id=crypto.randomUUID();await engine.setupOwner({id,email:u.email,name:u.name,company});await engine.querySystem('insert into public.local_auth_users(id,username,email,name,role,password_hash) values($1,$2,$3,$4,$5,$6)',[id,u.username,u.email,u.name,'owner',hash]);const token=issue(await selectUser(id));return send(res,200,{ok:true},{'Set-Cookie':cookie(token)});}finally{bootstrapBusy=false;}
   }
   if(route==='/api/login'){
    if(Date.now()<blockedUntil)throw problem('محاولات متعددة انتظر قليلًا ثم حاول',429);const u=rows(await engine.querySystem('select * from public.local_auth_users where username=$1',[String(input.username||'').toLowerCase().trim()]))[0];const dummy='0'.repeat(48)+':'+'0'.repeat(128);const matches=await passwordMatches(input.password,u?.password_hash||dummy);if(!u||!u.active||!matches){loginFailures++;blockedUntil=Date.now()+Math.min(30000,Math.max(0,loginFailures-3)*1000);throw problem('اسم الدخول أو كلمة المرور غير صحيحة',401);}loginFailures=0;blockedUntil=0;const token=issue(u);return send(res,200,{ok:true},{'Set-Cookie':cookie(token)});
   }
   if(!current)throw problem('سجل الدخول أولًا',401);
   if(route==='/api/backup'){if(current.user.role!=='owner')throw problem('متاح للمالك فقط',403);const archive=await require('./backup.cjs').exportBackup({engine,dataDir});return send(res,200,archive,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="Branda-Finance-'+new Date().toISOString().slice(0,10)+'.branda"'});}
   if(route==='/api/logout'){sessions.delete(current.token);return send(res,200,{ok:true},{'Set-Cookie':cookie('')+'; Max-Age=0'});}
   if(route==='/api/password'){const user=await selectUser(current.id);if(!await passwordMatches(input.currentPassword,user.password_hash))throw problem('كلمة المرور الحالية غير صحيحة');const hash=await passwordHash(input.newPassword);await engine.querySystem('update public.local_auth_users set password_hash=$2,version=version+1 where id=$1',[current.id,hash]);revoke(current.id);const token=issue(await selectUser(current.id));return send(res,200,{ok:true},{'Set-Cookie':cookie(token)});}
   if(route==='/api/users'){const user=input.id?await updateUser(input,current.user):await createUser(input,current.user);return send(res,200,{ok:true,user});}
   if(route==='/api/action'){if(typeof input.module!=='string'||typeof input.name!=='string'||!Array.isArray(input.args)||input.args.length>10)throw problem('طلب المالية غير صالح');return send(res,200,await executeAction(current.user,input.module,input.name,decode(input.args),current.token));}
   if(route==='/api/quit'){if(current.user.role!=='owner')throw problem('متاح للمالك فقط',403);send(res,200,{ok:true});setTimeout(()=>server.close(),100);return;}
   throw problem('العملية غير موجودة',404);
  }
  if(route==='/api/users'&&req.method==='GET'){if(current?.user.role!=='owner')throw problem('إدارة المستخدمين متاحة للمالك فقط',403);return send(res,200,{users:rows(await engine.querySystem('select id,username,email,name,role,active,version from public.local_auth_users order by created_at')).map(safeUser),currentUserId:current.id,roles});}
  if(route.startsWith('/api/'))throw problem('المسار غير موجود',404);
  if(req.method!=='GET')throw problem('طريقة الطلب غير مسموحة',405);
  const client=path.join(ROOT,'dist/public'),decoded=decodeURIComponent(route),file=path.resolve(client,'.'+decoded),relative=path.relative(client,file);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw problem('المسار غير صالح',403);
  let asset=file;if(!fs.existsSync(asset)||!fs.statSync(asset).isFile()){if(path.extname(decoded))throw problem('الملف غير موجود',404);asset=path.join(client,'index.html');}
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.ttf':'font/ttf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'}[path.extname(asset)]||'application/octet-stream';return send(res,200,fs.readFileSync(asset),{'Content-Type':mime});
 }catch(error){if(!res.headersSent)send(res,error.status||400,{ok:false,error:error.status?error.message:'تعذر تنفيذ العملية المحلية تحقق من البيانات وحاول مجددًا',message:error.status?error.message:'تعذر تنفيذ العملية المحلية تحقق من البيانات وحاول مجددًا'});}};requestTail=requestTail.then(run,run);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
 return{server,get engine(){return engine;},origin,dataDir,close:async()=>{await new Promise(resolve=>server.close(resolve));await engine.close?.();},passwordHash,passwordMatches};
}
module.exports={createRuntime,passwordHash,passwordMatches,normalizedUser};
if(require.main===module){(async()=>{
 const args=process.argv.slice(2),value=n=>args.includes(n)?args[args.indexOf(n)+1]:undefined,dataDir=path.resolve(value('--data')||path.join(process.env.LOCALAPPDATA||ROOT,'BrandaFinanceOffline','v3'));
 fs.mkdirSync(dataDir,{recursive:true});const statePath=path.join(dataDir,'running.json'),lockPath=path.join(dataDir,'application.lock');
 const open=url=>{if(!args.includes('--no-browser'))require('node:child_process').spawn('explorer.exe',[url],{windowsHide:true,stdio:'ignore'}).unref();};
 if(fs.existsSync(lockPath)){let alive=false;try{const held=JSON.parse(fs.readFileSync(lockPath,'utf8'));process.kill(held.pid,0);alive=true;}catch{}if(alive){if(fs.existsSync(statePath)){const state=JSON.parse(fs.readFileSync(statePath,'utf8'));if(/^http:\/\/127\.0\.0\.1:\d+$/.test(state.url)){open(state.url);console.log(state.url);return;}}throw new Error('البرنامج يبدأ حاليًا انتظر قليلًا ثم افتحه مجددًا');}fs.rmSync(lockPath,{force:true});}
 fs.writeFileSync(lockPath,JSON.stringify({pid:process.pid}),{flag:'wx'});
 try{require('./network-guard.cjs').installNetworkGuard();const runtime=await createRuntime({dataDir,port:Number(value('--port')||0)});fs.writeFileSync(statePath,JSON.stringify({pid:process.pid,url:runtime.origin,version:'3.0.0'}));console.log(runtime.origin);runtime.server.on('close',async()=>{await runtime.engine.close?.();fs.rmSync(statePath,{force:true});fs.rmSync(lockPath,{force:true});});open(runtime.origin);}catch(error){fs.rmSync(lockPath,{force:true});throw error;}
})().catch(error=>{console.error('Local startup failed:',error.message);process.exitCode=1;});}
