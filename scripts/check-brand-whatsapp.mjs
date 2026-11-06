import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const LOCO = '321fd305-1883-48df-ab69-829cf7d1bc48';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const env = { MARKETING_ENCRYPTION_KEY: Buffer.alloc(32,9).toString('base64'), MARKETING_PUBLIC_URL:'https://barndaksa.com', GREEN_API_PARTNER_TOKEN:'test-only' };
const inputs = new Set();
function loader(overrides={}, variables=env) {
  const cache=new Map();
  function load(file) {
    file=path.resolve(file); if(cache.has(file))return cache.get(file);
    inputs.add(file); const exports={}; cache.set(file,exports);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    new Function('require','exports','process',code)(name=>{
      if(name==='server-only')return {};
      if(name in overrides)return overrides[name];
      if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
      return require(name);
    },exports,{env:variables});return exports;
  }return load;
}
const secrets=loader()('lib/marketing/crypto.ts');
const creds={idInstance:'7103999999',apiTokenInstance:'private-test-token',apiUrl:'https://api.greenapi.com'};
function linked(overrides={}) { return {cafe_id:LOCO,requested_phone:'966500000001',verified_phone:'966500000001',status:'connected',generation:id(10),instance_id:creds.idInstance,encrypted_credentials:secrets.encryptMarketingSecret(creds,`${LOCO}:${creds.idInstance}`),lease_until:null,transactional_requested_at:null,...overrides}; }
class ProviderError extends Error { constructor(code='GREEN_API_MARKETING_REQUEST_FAILED',uncertain=true){super('private-token-in-provider-message');this.code=code;this.uncertain=uncertain;} }
function harness(options={}) {
  let row=options.connection??null, adminReads=0, provisions=0, stateReads=0, qrReads=0, deletes=0, accountReads=0, generation=20;
  const calls=[];
  const db={from(table){const filters=[];let patch;const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(k,v){filters.push([k,v]);return q;},not(){return q;},update(p){patch=p;return q;},maybeSingle(){return q;},then(resolve,reject){
    calls.push({table,filters,patch});let result;
    if(table==='cafes') result={data:options.cafeMissing?null:{id:LOCO,name:'LOCO',owner_user_id:options.owner??id(1),status:options.cafeStatus??'active'}};
    else if(table==='cafe_members')result={data:{role:options.member??'staff'}};
    else if(table==='brand_marketing_connections'){
      if(options.connectionError)result={error:{message:'private database failure'}};
      else {const matches=!row||filters.every(([k,v])=>row[k]===v);if(patch&&matches)row={...row,...patch};result={data:matches?row:null};}
    } else throw Error('Forbidden unrelated table '+table);
    return Promise.resolve(result).then(resolve,reject);
  }};return q;},async rpc(name,args){calls.push({rpc:name,args});
    if(name==='loco_claim_whatsapp_connection'){
      if(row?.status==='connected'||row?.lease_until&&Date.parse(row.lease_until)>Date.now())return {error:{message:'busy'}};
      row={...row,cafe_id:LOCO,requested_phone:args.p_phone,status:'provisioning',generation:id(generation++),lease_token:id(7),lease_until:new Date(Date.now()+120000).toISOString(),allow_create:!row?.provision_attempted_at,provision_attempted_at:new Date().toISOString(),transactional_requested_at:new Date().toISOString()};return {data:row};
    }
    if(name==='loco_activate_whatsapp_connection'){
      if(row.status!=='connected'||row.verified_phone!==args.p_phone||row.generation!==args.p_generation)return {error:{message:'changed'}};
      row={...row,transactional_requested_at:row.transactional_requested_at??new Date().toISOString()};return {data:true};
    }
    if(name==='marketing_disconnect_connection'){row={...row,status:'disconnecting',generation:id(generation++),transactional_requested_at:null};return {data:row.generation};}
    throw Error('Forbidden unrelated RPC '+name);
  }};
  const session={auth:{getUser:async()=>({data:{user:options.user===null?null:{id:id(1)}}})},from:table=>{assert.equal(table,'profiles');return {select:()=>({eq:()=>({maybeSingle:async()=>({data:options.profile??{role:'cafe_owner',status:'active'}})})})};}};
  const provider={GreenApiProviderError:ProviderError,
    async provisionGreenApiMarketingInstance(args){provisions++;calls.push({provision:args});if(options.provisionError)throw options.provisionError;return {credentials:creds,reused:provisions>1};},
    async configureGreenApiMarketingWebhook(){},
    async getGreenApiMarketingState(){stateReads++;if(options.stateError)throw options.stateError;if(options.changeGenerationOnRead)row={...row,generation:id(99)};return options.state??'authorized';},
    async getGreenApiMarketingAccount(){accountReads++;return {phone:options.accountPhone??'966500000001'};},
    async getGreenApiMarketingQr(){qrReads++;return {type:'qrCode',message:'YWJj'};},
    async deleteGreenApiMarketingInstance(){deletes++;assert.equal(row.status,'disconnecting');assert.equal(row.transactional_requested_at,null);if(options.deleteError)throw options.deleteError;},
  };
  const load=loader({
    '@/lib/supabase/server':{createClient:async()=>session},'@/lib/supabase/admin':{createAdminClient:()=>{adminReads++;return db;}},
    '@/lib/data/cafes':{requireOwnerCafeContext:async()=>{if(options.contextMissing)throw Error('no access');return {id:options.contextCafe??LOCO};}},
    '@/lib/platform/maintenance':{readMaintenanceSessionCookie:async()=>options.maintenance??null},
    '@/lib/whatsapp/green-api-marketing':provider,
  },options.configured===false?{}:env);
  return {...load('lib/data/brand-whatsapp.ts'),load,db,calls,row:()=>row,counts:()=>({adminReads,provisions,stateReads,qrReads,deletes,accountReads})};
}
let checks=0;async function test(name,run){await run();checks++;console.log('PASS '+name);}
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Real network forbidden in connection tests');};
try {
  await test('Read-only owner dashboard exposes no credentials, campaigns, audience or provider request',async()=>{
    const h=harness({connection:linked({last_error:'secret-provider-value'})}),d=await h.getBrandWhatsAppDashboard();
    assert.equal(d.brandName,'LOCO');assert.equal(d.transactionalEnabled,false);assert.equal(d.configured,true);
    assert.deepEqual(Object.keys(d).sort(),['brandName','configured','connection','transactionalEnabled']);
    for(const secret of ['7103999999','private-test-token','encrypted_credentials','secret-provider-value','webhook_token_hash'])assert(!JSON.stringify(d).includes(secret));
    assert.equal(h.counts().stateReads,0);assert.equal(h.counts().provisions,0);assert(!h.calls.some(x=>x.rpc));
  });
  await test('Session, profile, immutable brand and actual owner all gate connection reads',async()=>{
    for(const config of [{user:null},{profile:{role:'cafe_owner',status:'suspended'}},{contextCafe:id(2)},{contextMissing:true},{owner:id(2),member:'manager'},{owner:id(2),member:'staff'},{cafeStatus:'suspended'},{cafeMissing:true}]){
      const h=harness(config);await assert.rejects(()=>h.getBrandWhatsAppDashboard(),e=>[401,403].includes(e.status));
      assert(!h.calls.some(x=>x.table==='brand_marketing_connections'));assert.equal(h.counts().provisions,0);
    }
    await harness({owner:id(2),member:'owner'}).getBrandWhatsAppDashboard();
  });
  await test('Admin access needs a live maintenance session bound to the actor and LOCO',async()=>{
    for(const maintenance of [null,{adminUserId:id(2),cafeId:LOCO,expiresAt:Date.now()+100000},{adminUserId:id(1),cafeId:LOCO,expiresAt:Date.now()-1},{adminUserId:id(1),cafeId:id(2),expiresAt:Date.now()+100000}]){
      const h=harness({profile:{role:'platform_admin',status:'active'},maintenance});await assert.rejects(()=>h.getBrandWhatsAppDashboard(),e=>e.status===403);assert.equal(h.counts().adminReads,0);
    }
    await harness({profile:{role:'platform_admin',status:'active'},maintenance:{adminUserId:id(1),cafeId:LOCO,expiresAt:Date.now()+100000}}).getBrandWhatsAppDashboard();
  });
  await test('Connection API rejects all campaign/send actions, arbitrary tenant IDs and invalid phone payloads',async()=>{
    for(const input of [{action:'createCampaign'},{action:'sendTest'},{action:'refresh',cafeId:id(2)},{action:'connect',phone:'0500000001',customerIds:[]},{action:'connect',phone:'evil0500000001'},{action:'connect',phone:'0555'}]){
      const h=harness();await assert.rejects(()=>h.runBrandWhatsAppAction(input),e=>e.status===400);assert.equal(h.counts().adminReads,0);assert.equal(h.counts().provisions,0);
    }
  });
  await test('Explicit connect uses scoped durable claim and encrypted storage without campaign entitlement',async()=>{
    const h=harness();const result=await h.runBrandWhatsAppAction({action:'connect',phone:'٠٥٠٠٠٠٠٠٠١'});
    assert.equal(h.calls.find(x=>x.rpc)?.rpc,'loco_claim_whatsapp_connection');assert.equal(h.row().requested_phone,'966500000001');
    assert.equal(result.dashboard.transactionalEnabled,true);assert.equal(result.dashboard.connection.status,'pairing');assert(!h.row().encrypted_credentials.includes(creds.apiTokenInstance));
    assert.equal(h.counts().provisions,1);assert(!JSON.stringify(result).includes(creds.apiTokenInstance));
    assert.equal(h.calls.find(x=>x.provision).provision.allowCreate,true);
  });
  await test('Uncertain provisioning preserves durable intent and never authorizes a second creation',async()=>{
    const h=harness({provisionError:new ProviderError()});
    await assert.rejects(()=>h.runBrandWhatsAppAction({action:'connect',phone:'0500000001'}),e=>e.status===503);assert.equal(h.row().status,'uncertain');
    await assert.rejects(()=>h.runBrandWhatsAppAction({action:'connect',phone:'0500000001'}));
    assert.deepEqual(h.calls.filter(x=>x.provision).map(x=>x.provision.allowCreate),[true,false]);
  });
  await test('Existing connected sender requires explicit activation and fresh provider/account verification',async()=>{
    const h=harness({connection:linked()});assert.equal(await h.getLocoCustomerWhatsAppCredentials(LOCO),null);
    const result=await h.runBrandWhatsAppAction({action:'connect',phone:'0500000001'});
    assert.equal(result.dashboard.transactionalEnabled,true);assert.equal(h.counts().provisions,0);assert.equal(h.counts().stateReads,1);assert.equal(h.counts().accountReads,1);
    assert(h.calls.some(x=>x.rpc==='loco_activate_whatsapp_connection'));const first=h.row().transactional_requested_at;
    await h.runBrandWhatsAppAction({action:'connect',phone:'0500000001'});assert.equal(h.row().transactional_requested_at,first);
  });
  await test('Activation rejects another phone, provider mismatch, disconnected sender and changed generation',async()=>{
    for(const options of [{accountPhone:'966500000099'},{state:'notAuthorized'},{changeGenerationOnRead:true}]){
      const h=harness({connection:linked(),...options});await assert.rejects(()=>h.runBrandWhatsAppAction({action:'connect',phone:'0500000001'}),e=>e.status===409);
      assert.equal(h.row().transactional_requested_at,null);assert.equal(h.counts().provisions,0);
    }
    const h=harness({connection:linked()});await assert.rejects(()=>h.runBrandWhatsAppAction({action:'connect',phone:'0500000002'}),e=>e.status===409);assert.equal(h.counts().stateReads,0);
  });
  await test('QR uses existing sanitized pairing path without provider creation or send',async()=>{
    const h=harness({connection:linked({status:'pairing',verified_phone:null,transactional_requested_at:new Date().toISOString()}),state:'notAuthorized'});
    const result=await h.runBrandWhatsAppAction({action:'qr'});assert.equal(result.qr,'YWJj');assert.equal(h.counts().qrReads,1);assert.equal(h.counts().provisions,0);
    const busy=harness({connection:linked({status:'pairing'}),state:'starting'});assert.equal((await busy.runBrandWhatsAppAction({action:'qr'})).qrStatus,'timeout');assert.equal(busy.counts().qrReads,0);
  });
  await test('Disconnect disables transactional routing before provider mutation and preserves uncertain retry data',async()=>{
    const h=harness({connection:linked({transactional_requested_at:new Date().toISOString()}),deleteError:new ProviderError()});
    await assert.rejects(()=>h.runBrandWhatsAppAction({action:'disconnect'}),e=>e.status===503);
    assert.equal(h.row().status,'disconnecting');assert.equal(h.row().transactional_requested_at,null);assert(h.row().encrypted_credentials);assert.equal(await h.getLocoCustomerWhatsAppCredentials(LOCO),null);
    const done=harness({connection:linked({transactional_requested_at:new Date().toISOString()})});assert.equal((await done.runBrandWhatsAppAction({action:'disconnect'})).dashboard.connection.status,'disconnected');assert.equal(done.row().encrypted_credentials,null);
  });
  await test('Routing getter requires active LOCO plus opt-in, connected matched phone and authentic encrypted credentials',async()=>{
    const h=harness({connection:linked({transactional_requested_at:new Date().toISOString()})});
    assert.equal(await h.getLocoCustomerWhatsAppCredentials(id(2)),null);assert.equal(h.counts().adminReads,0);
    const value=await h.getLocoCustomerWhatsAppCredentials(LOCO);assert.deepEqual(value,{...creds,expectedPhone:'966500000001',generation:id(10)});assert.equal(h.counts().stateReads,0);
    for(const options of [{cafeStatus:'suspended'},{cafeMissing:true},{connectionError:true},{connection:linked()},{connection:linked({status:'pairing',transactional_requested_at:'now'})},{connection:linked({verified_phone:'966500000009',transactional_requested_at:'now'})},{connection:linked({encrypted_credentials:'tampered',transactional_requested_at:'now'})}]){
      assert.equal(await harness({connection:linked({transactional_requested_at:'now'}),...options}).getLocoCustomerWhatsAppCredentials(LOCO),null);
    }
  });
  await test('HTTP boundary is same-origin, strictly bounded, private/no-store and redacts provider errors',async()=>{
    let calls=0;const h=harness();const api=loader({'@/lib/data/brand-whatsapp':{BrandWhatsAppError:h.BrandWhatsAppError,getBrandWhatsAppDashboard:async()=>{throw Error('private-token');},runBrandWhatsAppAction:async()=>{calls++;return {dashboard:{}};}}})('app/api/brand-whatsapp/route.ts');
    const get=await api.GET();assert.equal(get.status,503);assert(!(await get.text()).includes('private-token'));assert.equal(get.headers.get('cache-control'),'private, no-store');
    for(const request of [new Request('https://brand.test/api/brand-whatsapp',{method:'POST',body:'{}'}),new Request('https://brand.test/api/brand-whatsapp',{method:'POST',headers:{origin:'https://other.test'},body:'{}'})])assert.equal((await api.POST(request)).status,403);
    for(const [body,status] of [['not-json',400],['x'.repeat(2001),413]])assert.equal((await api.POST(new Request('https://brand.test/api/brand-whatsapp',{method:'POST',headers:{origin:'https://brand.test'},body}))).status,status);
    assert.equal(calls,0);assert.equal((await api.POST(new Request('https://brand.test/api/brand-whatsapp',{method:'POST',headers:{origin:'https://brand.test'},body:'{"action":"refresh"}'}))).status,200);assert.equal(calls,1);
  });
  await test('Missing server configuration stays visible but cannot provision or mutate a connection',async()=>{
    const h=harness({configured:false});assert.equal((await h.getBrandWhatsAppDashboard()).configured,false);await assert.rejects(()=>h.runBrandWhatsAppAction({action:'connect',phone:'0500000001'}),e=>e.status===503);assert.equal(h.counts().provisions,0);assert(!h.calls.some(x=>x.rpc));
  });
  fs.mkdirSync('output/loco-brand-phone',{recursive:true});fs.writeFileSync('output/loco-brand-phone/backend-checks.json',JSON.stringify({at:new Date().toISOString(),checks,runtime:process.version,inputs:Object.fromEntries([...inputs].map(f=>[path.relative(process.cwd(),f).replaceAll('\\','/'),createHash('sha256').update(fs.readFileSync(f)).digest('hex')]))},null,2));
  console.log(`Brand WhatsApp: ${checks} grouped checks passed with no real network`);
} finally {globalThis.fetch=originalFetch;}
