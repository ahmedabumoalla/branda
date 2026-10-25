const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,mocks={}){const exports={};const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','exports',compiled)(name=>{if(name in mocks)return mocks[name];if(name==='server-only')return{};if(name.startsWith('@/')){const p=name.slice(2);return load(fs.existsSync(p+'.ts')?p+'.ts':p+'.tsx',mocks);}return require(name);},exports);return exports;}
async function main(){
 let role='owner',enabled=true,allowed=true,contextTenant='tenant',authError=false,createError=false,grantError=false,grantThrows=false,cleanupError=false;
 let destinationError=false,destinationCalls=0;
 let salesMemberships=[{cafe_id:'tenant'}],salesCafes=[{id:'tenant',slug:'brand-test',name:'Brand'}],salesContextRole='cashier';
 const log={signIn:[],signOut:0,create:[],grant:[],remove:[]};
 let welcomeFails=false,linkChanged=true,linkError=false,otpEligible=true,otpRequestFails=false,otpVerifyFails=false,admissionResult='created',completionFails=false; const welcomes=[],linkedWelcomes=[],otpRequests=[],otpVerifications=[],admissions=[],completions=[];
 process.env.PHONE_OTP_ENABLED='true';process.env.WHATSAPP_PROVIDER='green_api';delete process.env.VERCEL;
 const client={auth:{signInWithPassword:async credentials=>{log.signIn.push(credentials);return{data:{user:authError?null:{id:'actor'}},error:authError?{}:null};},signOut:async opts=>{assert.equal(opts.scope,'local');log.signOut++;return{};}},rpc:async(name,args)=>{if(name==='brand_finance_sales_cashier_destinations'){destinationCalls++;assert.equal(args,undefined,'No caller-selected employee identity');return{error:destinationError?{code:'42501',message:'private detail'}:null,data:allowed&&salesContextRole==='cashier'&&salesMemberships.length&&contextTenant==='tenant'?salesCafes.filter(c=>c.slug!=='expired').map(c=>({...c,id:c.id==='second'?'00000000-0000-4000-8000-000000000002':'00000000-0000-4000-8000-000000000001'})):[]};}log.grant.push({name,args});if(grantThrows)throw Error('Network');return{error:grantError?{}:null,data:{id:'new-staff',changed:linkChanged},...(name==='brand_finance_link_sales_cashier'&&linkError?{error:{}}:{})};}};
 const mocks={
  'next/headers':{headers:async()=>new Headers({'x-forwarded-for':'untrusted-client'})},
  '@/lib/barndaksa/env':{getSupabaseServiceRoleKey:()=> 'isolated-test-key'},
  '@/lib/whatsapp/green-api':{greenApiProviderInstanceKey:()=> 'isolated-provider',sendGreenApiSalesCashierWelcome:async input=>{welcomes.push(input);if(welcomeFails)throw Error('Provider timeout');return{providerMessageId:'queued'};},sendGreenApiLinkedSalesCashierWelcome:async input=>{linkedWelcomes.push(input);if(welcomeFails)throw Error('Timeout');return{providerMessageId:'queued'};}},
  '@/lib/supabase/server':{createClient:async()=>client},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{if(name==='begin_finance_sales_cashier_otp_request'){admissions.push(args);assert.equal(args.p_phone_normalized,'966500000000');assert.equal(args.p_provider_instance,'isolated-provider');assert.match(args.p_ip_hash,/^[a-f0-9]{64}$/);assert.equal(args.p_global_daily_limit,20);return{data:[{result:otpEligible?admissionResult:'unavailable',request_id:'request-id'}],error:null};}if(name==='complete_finance_sales_cashier_otp_request'){completions.push(args);return{error:completionFails?{}:null};}assert.equal(name,'brand_finance_sales_cashier_phone_enabled');assert.equal(args.p_phone,'966500000000');return {data:otpEligible,error:null};},from:()=>{throw Error('Direct finance table reads are forbidden');},auth:{admin:{createUser:async value=>{log.create.push(value);return{data:{user:createError?null:{id:'new-staff'}},error:createError?(createError===true?{}:createError):null};},deleteUser:async id=>{log.remove.push(id);return{error:cleanupError?{}:null};}}}})},
  '@/lib/data/cafes':{requireOwnerCafeContext:async()=>({id:'tenant',slug:'brand-test',role})},
  '@/lib/data/feature-entitlements':{getOwnerFeatureCodes:async()=>enabled?['finance']:[]},
  '@/lib/data/brand-finance':{getBrandFinanceSnapshot:async slug=>{assert.equal(slug,'brand-test');if(!allowed)throw Error('Denied');return{cafe:{id:contextTenant},canAdminister:role==='owner'};},getBrandFinanceContext:async slug=>{if(!allowed||slug==='expired')throw Error('Denied');return{cafe:{id:slug==='second'?'second':contextTenant,role:salesContextRole}};}},
 };
 const financeAccess=load('lib/data/finance-access.ts',mocks);
 const {signInFinance,provisionFinanceStaff,signInSalesCashier,provisionSalesCashier,requestSalesCashierOtp,verifySalesCashierOtp}=financeAccess;
 client.auth.signInWithOtp=async input=>{otpRequests.push(input);return{error:otpRequestFails?{}:null};};
 client.auth.verifyOtp=async input=>{otpVerifications.push(input);return{error:otpVerifyFails?{}:null,data:{user:otpVerifyFails?null:{id:'actor'}}};};
 assert((await signInFinance('brand-test','USER@example.test','password')).ok);assert.equal(log.signIn[0].email,'user@example.test');
 assert((await signInFinance('brand-test','0500000000','password')).ok);assert.equal(log.signIn[1].phone,'+966500000000');
 authError=true;assert(!(await signInFinance('brand-test','user@example.test','wrong')).ok);assert.equal(log.signOut,0);authError=false;
 allowed=false;assert(!(await signInFinance('brand-test','user@example.test','password')).ok);assert.equal(log.signOut,1);allowed=true;
 const before=log.signIn.length;await assert.rejects(signInFinance('../other','user@example.test','password'));assert.equal(log.signIn.length,before);
 const input={email:'staff@example.test',name:'Staff',password:'temporary-password-123',role:'cashier'};
 for(const disallowed of ['manager','staff','platform_admin']){role=disallowed;await assert.rejects(provisionFinanceStaff(input));}role='owner';
 enabled=false;await assert.rejects(provisionFinanceStaff(input));enabled=true;
 contextTenant='other';await assert.rejects(provisionFinanceStaff(input));contextTenant='tenant';
 await assert.rejects(provisionFinanceStaff({...input,password:'short'}));assert.equal(log.create.length,0);
 createError=true;await assert.rejects(provisionFinanceStaff(input));assert.equal(log.remove.length,0,'Existing users must never be deleted/reset');createError=false;
 grantError=true;await assert.rejects(provisionFinanceStaff(input));assert.deepEqual(log.remove,['new-staff']);grantError=false;
 assert((await provisionFinanceStaff(input)).ok);assert.equal(log.grant.at(-1).name,'brand_finance_execute');assert.equal(log.grant.at(-1).args.p_cafe_id,'tenant');assert.equal(log.grant.at(-1).args.p_payload.role,'cashier');
 assert(!('password' in log.grant.at(-1).args.p_payload));assert(!('account_type' in log.create.at(-1).user_metadata));

 const salesInput={name:'Sales Cashier',phone:'٠٥٠٠٠٠٠٠٠٠',password:'Abcde!12'};
 const createdBeforePolicy=log.create.length;
 for(const password of ['Abcd!12','abcdef!1','Abcdef12','Abcdef 1','كلمةمرور!','Abcd!\n12'])await assert.rejects(provisionSalesCashier({...salesInput,password}));
 assert.equal(log.create.length,createdBeforePolicy,'Invalid password cannot create accounts or send credentials');
 for(const phone of ['٠٥٠٠٠٠٠٠٠٠','۰۵۰۰۰۰۰۰۰۰','0500000000','+966500000000','00966500000000','500000000']){
  assert.equal((await signInSalesCashier(phone,'password')).redirectTo,'/finance/brand-test/pos');assert.equal(log.signIn.at(-1).phone,'+966500000000');
 }
 const attempts=log.signIn.length,exits=log.signOut;
 for(const phone of ['','abc0500000000','123','+15555555555'])await assert.rejects(signInSalesCashier(phone,'password'));
 assert.equal(log.signIn.length,attempts);assert.equal(log.signOut,exits,'invalid input preserves existing session');
 authError=true;assert(!(await signInSalesCashier('0500000000','wrong')).ok);assert.equal(log.signOut,exits);authError=false;
 for(const disallowed of ['manager','owner']){salesContextRole=disallowed;assert(!(await signInSalesCashier('0500000000','password')).ok);}salesContextRole='cashier';
 salesMemberships=[];assert(!(await signInSalesCashier('0500000000','password')).ok);salesMemberships=[{cafe_id:'tenant'}];
 allowed=false;assert(!(await signInSalesCashier('0500000000','password')).ok);allowed=true;
 contextTenant='wrong';assert(!(await signInSalesCashier('0500000000','password')).ok);contextTenant='tenant';
 salesCafes.push({id:'second',slug:'second',name:'Second'},{id:'expired',slug:'expired',name:'Expired'});
 const multi=await signInSalesCashier('0500000000','password');assert.equal(multi.brands.length,2);assert(!('redirectTo' in multi));salesCafes=salesCafes.slice(0,1);
 destinationError=true;const destinationFailure=await signInSalesCashier('0500000000','password');assert(!destinationFailure.ok);assert(!destinationFailure.message.includes('private detail'));destinationError=false;
 salesCafes[0].slug='https://evil.test';assert(!(await signInSalesCashier('0500000000','password')).ok);salesCafes[0].slug='brand-test';assert(destinationCalls>0);
 for(const disallowed of ['manager','staff','platform_admin']){role=disallowed;await assert.rejects(provisionSalesCashier(salesInput));}role='owner';
 enabled=false;await assert.rejects(provisionSalesCashier(salesInput));enabled=true;
 contextTenant='wrong';await assert.rejects(provisionSalesCashier(salesInput));contextTenant='tenant';
 const removedBefore=log.remove.length;createError=true;await assert.rejects(provisionSalesCashier(salesInput));assert.equal(log.remove.length,removedBefore);createError=false;
 grantError=true;await assert.rejects(provisionSalesCashier(salesInput));assert.equal(log.remove.length,removedBefore+1);grantError=false;
 grantThrows=true;await assert.rejects(provisionSalesCashier(salesInput));assert.equal(log.remove.length,removedBefore+2);grantThrows=false;
 grantError=true;cleanupError=true;const originalError=console.error;let cleanupLogged=false;console.error=()=>{cleanupLogged=true;};try{await assert.rejects(provisionSalesCashier(salesInput));}finally{console.error=originalError;}assert(cleanupLogged);grantError=false;cleanupError=false;
 assert.equal(welcomes.length,0,'Denied grants and duplicate accounts must not send credentials');
 assert.equal((await provisionSalesCashier(salesInput)).delivery,'queued');assert.equal(log.create.at(-1).phone,'+966500000000');assert.equal(log.create.at(-1).phone_confirm,true);
 assert.equal(welcomes.length,1);assert.equal(welcomes[0].phone,'966500000000');assert.equal(welcomes[0].password,salesInput.password);assert.equal(welcomes[0].slug,'brand-test');
 const beforeDeliveryFailure=log.remove.length;welcomeFails=true;
 const unconfirmed=await provisionSalesCashier(salesInput);assert(unconfirmed.ok);assert.equal(unconfirmed.delivery,'unconfirmed');assert.equal(log.remove.length,beforeDeliveryFailure,'Delivery failure cannot delete a provisioned account');assert.equal(welcomes.length,2,'One send attempt per created account');welcomeFails=false;
 assert.deepEqual(log.create.at(-1).app_metadata,{finance_staff_provisioned:true,finance_cafe_id:'tenant'});assert(!('account_type' in log.create.at(-1).user_metadata));
 assert.deepEqual(log.grant.at(-1),{name:'brand_finance_add_sales_cashier',args:{p_cafe_id:'tenant',p_user_id:'new-staff',p_name:'Sales Cashier'}});

 const {createSalesCashierAccountAction}=load('app/actions/finance-access.ts',{...mocks,'@/lib/data/finance-access':financeAccess});
 const unchanged={removed:log.remove.length,grants:log.grant.length,sends:welcomes.length};
 for(const code of ['phone_exists','user_already_exists']) {
  createError={code,message:'private provider details'};
  const linked=await createSalesCashierAccountAction(salesInput);
  assert.equal(linked.ok,true);assert.match(linked.message,/ربط حساب العميل/);assert(!linked.message.includes('private provider details'));
  assert(!('password' in log.grant.at(-1).args));assert(!('password' in linkedWelcomes.at(-1)));
 }
 assert.equal(log.remove.length,unchanged.removed,'Existing identity never deleted');assert.equal(welcomes.length,unchanged.sends,'Existing identity never receives a replacement password');
 assert.equal(linkedWelcomes.length,2);const linkSends=linkedWelcomes.length;linkChanged=false;
 assert.equal((await createSalesCashierAccountAction(salesInput)).delivery,'unchanged');assert.equal(linkedWelcomes.length,linkSends,'Repeat link does not resend');linkChanged=true;
 linkError=true;assert(!(await createSalesCashierAccountAction(salesInput)).ok);assert.equal(linkedWelcomes.length,linkSends);linkError=false;
 welcomeFails=true;assert.equal((await createSalesCashierAccountAction(salesInput)).delivery,'unconfirmed');assert.equal(log.remove.length,unchanged.removed);welcomeFails=false;
 createError={code:'weak_password'};assert.match((await createSalesCashierAccountAction(salesInput)).message,/كلمة المرور/);
 createError={code:'unexpected_failure'};assert.match((await createSalesCashierAccountAction(salesInput)).message,/خدمة الدخول/);createError=false;
 role='manager';assert.match((await createSalesCashierAccountAction(salesInput)).message,/مالك العلامة/);role='owner';
 enabled=false;assert.match((await createSalesCashierAccountAction(salesInput)).message,/اشتراك/);enabled=true;
 assert.match((await createSalesCashierAccountAction({...salesInput,password:'weak'})).message,/٨ خانات/);
 assert.match((await createSalesCashierAccountAction({...salesInput,phone:'123'})).message,/رقم جوال/);
 assert.match((await createSalesCashierAccountAction({...salesInput,name:''})).message,/اسم الكاشير/);

 assert((await requestSalesCashierOtp('0500000000')).ok);assert.deepEqual(otpRequests[0],{phone:'+966500000000',options:{shouldCreateUser:false}});
 assert.deepEqual(completions.at(-1),{p_request_id:'request-id',p_accepted:true});
 assert.equal(admissions[0].p_ip_hash,require('node:crypto').createHmac('sha256','isolated-test-key').update('sales-otp:v1:ip:local').digest('hex'),'Client forwarded header must not choose the IP bucket');
 for(const result of ['cooldown','hourly_limit','daily_limit','global_limit']){admissionResult=result;assert(!(await requestSalesCashierOtp('0500000000')).ok);}admissionResult='created';assert.equal(otpRequests.length,1,'Quota rejection never reaches Auth');
 process.env.PHONE_OTP_ENABLED='false';assert(!(await requestSalesCashierOtp('0500000000')).ok);process.env.PHONE_OTP_ENABLED='true';assert.equal(otpRequests.length,1);
 otpEligible=false;assert((await requestSalesCashierOtp('0500000000')).ok);assert.equal(otpRequests.length,1,'No OTP/account creation for non-sales phone');
 assert(!(await verifySalesCashierOtp('0500000000','123456')).ok);assert.equal(otpVerifications.length,0);
 otpEligible=true;otpRequestFails=true;assert(!(await requestSalesCashierOtp('0500000000')).ok);otpRequestFails=false;
 assert.deepEqual(completions.at(-1),{p_request_id:'request-id',p_accepted:false});
 completionFails=true;assert(!(await requestSalesCashierOtp('0500000000')).ok);completionFails=false;
 assert.equal((await verifySalesCashierOtp('0500000000','١٢٣٤٥٦')).redirectTo,'/finance/brand-test/pos');assert.equal(otpVerifications.at(-1).token,'123456');
 otpVerifyFails=true;assert(!(await verifySalesCashierOtp('0500000000','123456')).ok);otpVerifyFails=false;
 salesContextRole='manager';const signOuts=log.signOut;assert(!(await verifySalesCashierOtp('0500000000','123456')).ok);assert.equal(log.signOut,signOuts+1,'Recheck live membership after authentication');salesContextRole='cashier';
 await assert.rejects(verifySalesCashierOtp('0500000000','12345'));await assert.rejects(requestSalesCashierOtp('invalid'));

 let signed=0,access=true;
 const {sendGreenApiSalesCashierWelcome,sendGreenApiLinkedSalesCashierWelcome}=load('lib/whatsapp/green-api.ts');
 const oldFetch=global.fetch,envNames=['GREEN_API_API_URL','GREEN_API_ID_INSTANCE','GREEN_API_API_TOKEN_INSTANCE'],oldEnv=envNames.map(name=>process.env[name]);
 const requests=[];let providerResponse={ok:true,json:async()=>({idMessage:'queued-id'})};
 try {
  process.env.GREEN_API_API_URL='https://provider.invalid';process.env.GREEN_API_ID_INSTANCE='test';process.env.GREEN_API_API_TOKEN_INSTANCE='test-token';
  global.fetch=async(url,options)=>{requests.push({url,options});return providerResponse;};
  const welcome={phone:'966500000000',fullName:'Cashier',brandName:'Brand',slug:'brand-test',password:'Abcde!12'};
  assert.equal((await sendGreenApiSalesCashierWelcome(welcome)).providerMessageId,'queued-id');
  const body=JSON.parse(requests[0].options.body);assert.equal(body.chatId,'966500000000@c.us');assert.equal(body.linkPreview,false);
  assert(body.message.includes(welcome.password));assert(body.message.includes('https://barndaksa.com/finance/brand-test/login'));assert(body.message.includes('Brand'));
  assert(!requests[0].url.includes(welcome.password));assert.equal(requests[0].options.cache,'no-store');assert(requests[0].options.signal);
  for(const invalid of [{phone:'0500000000'},{slug:'../../login'},{slug:'https://evil.test'}])await assert.rejects(sendGreenApiSalesCashierWelcome({...welcome,...invalid}));
  assert.equal(requests.length,1,'Invalid destinations are rejected before network');
  providerResponse={ok:false,json:async()=>({secret:'never consumed'})};await assert.rejects(sendGreenApiSalesCashierWelcome(welcome),/UNCONFIRMED/);
  providerResponse={ok:true,json:async()=>({})};await assert.rejects(sendGreenApiSalesCashierWelcome(welcome),/UNCONFIRMED/);
  global.fetch=async()=>{throw Error('Timeout');};await assert.rejects(sendGreenApiSalesCashierWelcome(welcome));
  delete process.env.GREEN_API_API_TOKEN_INSTANCE;await assert.rejects(sendGreenApiSalesCashierWelcome(welcome),/CONFIGURATION_MISSING/);
  process.env.GREEN_API_API_TOKEN_INSTANCE='test-token';providerResponse={ok:true,json:async()=>({idMessage:'linked-queued'})};
  global.fetch=async(url,options)=>{requests.push({url,options});return providerResponse;};
  assert.equal((await sendGreenApiLinkedSalesCashierWelcome({phone:welcome.phone,fullName:welcome.fullName,brandName:welcome.brandName})).providerMessageId,'linked-queued');
  const linkedBody=JSON.parse(requests.at(-1).options.body);assert.equal(linkedBody.chatId,body.chatId);assert(linkedBody.message.includes('/cashier/login?type=sales'));assert(!linkedBody.message.includes(welcome.password));assert(linkedBody.message.includes('رمز واتساب'));
 } finally {global.fetch=oldFetch;envNames.forEach((name,index)=>{if(oldEnv[index]===undefined)delete process.env[name];else process.env[name]=oldEnv[index];});}
 const {GET}=load('app/api/finance/[slug]/media/route.ts',{
  '@/lib/data/brand-finance':{getBrandFinanceContext:async slug=>{assert.equal(slug,'brand-test');if(!access)throw Error('Forbidden');return{cafe:{id:'tenant'}};}},
  '@/lib/supabase/admin':{createAdminClient:()=>({storage:{from:bucket=>{assert.equal(bucket,'menu-products');return{createSignedUrl:async(path,ttl)=>{signed++;assert.equal(ttl,600);return{data:{signedUrl:'https://storage.example/original?signature='+signed},error:null};}};}}})},
 });
 const request=path=>new Request('https://barndaksa.com/api/finance/brand-test/media?path='+encodeURIComponent(path));
 const params={params:Promise.resolve({slug:'brand-test'})};
 access=false;assert.equal((await GET(request('tenant/p.webp'),params)).status,403);assert.equal(signed,0);access=true;
 for(const bad of ['other/p.webp','tenant/../secret','tenant/%2e%2e/secret','tenant/\\secret'])assert.equal((await GET(request(bad),params)).status,403);
 assert.equal(signed,0);
 const one=await GET(request('tenant/p.webp'),params),two=await GET(request('tenant/p.webp'),params);
 assert.equal(one.status,307);assert.equal(one.headers.get('cache-control'),'private, no-store');assert.equal(one.headers.get('vary'),'Cookie');assert.notEqual(one.headers.get('location'),two.headers.get('location'));
 let refreshed=0;
 const {proxy}=load('proxy.ts',{'@/lib/supabase/middleware':{updateSession:async()=>{refreshed++;return new Response('refreshed');}},'@/lib/platform/storefront-availability':{isStorefrontEnabled:()=>true,isStorefrontPath:()=>false}});
 const {NextRequest}=require('next/server');await proxy(new NextRequest('https://barndaksa.com/finance/brand-test/pos'));assert.equal(refreshed,1);
 console.log('PASS finance access: email/phone login, denied service logout, owner-only staff provisioning, no existing-account reset, new-account compensation, private image tenant/service gate and finance cookie refresh');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
