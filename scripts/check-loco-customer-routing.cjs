const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const loco = '321fd305-1883-48df-ab69-829cf7d1bc48';
const wahed = '8dbf85ba-df8f-4218-bc6f-9d2b39e937ef';
const meram = '98fd33d5-522d-46e7-adeb-34b04a665f4f';
const supportsPrivateWhatsApp = id => [loco,wahed,meram].includes(id);
function load(file, mocks = {}, env = process.env, fetcher = globalThis.fetch) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', 'process', 'fetch', 'setTimeout', code)(name => name === 'server-only' ? {} : name in mocks ? mocks[name] : name.startsWith('@/') ? load(name.slice(2)+'.ts',mocks,env,fetcher) : require(name), exports, { env }, fetcher,fn=>{fn();return 0;});
  return exports;
}
const config = id => ({ apiUrl: 'https://api.greenapi.com', idInstance: id, apiTokenInstance: 'isolated-token-' + id });
const env = { GREEN_API_API_URL: config('111').apiUrl, GREEN_API_ID_INSTANCE: '111', GREEN_API_API_TOKEN_INSTANCE: config('111').apiTokenInstance,
  GREEN_API_OTP_BACKUP_API_URL: config('222').apiUrl, GREEN_API_OTP_BACKUP_ID_INSTANCE: '222', GREEN_API_OTP_BACKUP_API_TOKEN_INSTANCE: config('222').apiTokenInstance,
  GREEN_API_ACCESS_SENDER: 'backup' };
let checks = 0;
async function scenario({ states = {}, linked = { ...config('333'), expectedPhone: '966511111111' }, accountPhone = '966511111111', fault, tenant = loco, getterError = false, configuration = env, loyaltyOnly = false, brand = false } = {}) {
  const calls = [], gets = [];
  const fetcher = async (url, init) => {
    const instance = /waInstance(\d+)/.exec(url)[1]; calls.push({ instance, ...init });
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    if (init.method !== 'POST') {
      if (states[instance] === 'timeout') throw new Error('private-token');
      return Response.json({ stateInstance: states[instance] ?? 'authorized', phone: accountPhone });
    }
    if (fault === 'timeout') throw new Error('private-token');
    if (fault === 'json') return new Response('invalid');
    if (fault === 'ack') return Response.json({});
    if (typeof fault === 'number') return new Response('', { status: fault });
    return Response.json({ idMessage: 'ack' });
  };
  const green = load('lib/whatsapp/green-api.ts', {}, configuration, fetcher);
  const marketing = load('lib/whatsapp/green-api-marketing.ts', {
    '@/lib/whatsapp/green-api-partner': { GreenApiProviderError: class extends Error {} },
  }, configuration, fetcher);
  const router = load('lib/whatsapp/customer-routing.ts', {
    '@/lib/whatsapp/green-api': green,
    '@/lib/whatsapp/green-api-marketing': marketing,
    '@/lib/whatsapp/brand-connection-types': { LOCO_CAFE_ID: loco, MERAM_CAFE_ID:meram, WAHED_MASOUB_CAFE_ID: wahed, supportsPrivateWhatsApp },
    '@/lib/data/brand-whatsapp': {
      getLocoCustomerWhatsAppCredentials: async id => { assert.equal(id,loco); gets.push(id); if (getterError) throw Error('private-token'); return linked; },
      getBrandCustomerWhatsAppCredentials: async id => { assert.equal(id,tenant); gets.push(id); if (getterError) throw Error('private-token'); return linked; },
    },
  });
  const selected = await (brand ? loyaltyOnly ? router.selectBrandLoyaltySender(tenant) : router.selectBrandCustomerSender(tenant) : loyaltyOnly ? router.selectLocoLoyaltySender(tenant) : router.selectLocoCustomerSender(tenant));
  const result = selected ? await green.sendGreenApiCustomerMessage(selected, { phone: '966500000000', message: 'isolated customer test' }) : null;
  return { calls, gets, selected, result, router };
}
(async () => {
  for (const options of [{states:{333:'notAuthorized'}}, {linked:null}, {getterError:true}, {states:{333:'timeout'}}, {accountPhone:'966522222222'}, {linked:{...config('333'),apiUrl:'https://evil.example'}}, {tenant:'another-cafe'}]) {
    const x = await scenario({...options,loyaltyOnly:true});
    assert.equal(x.selected,null,'unavailable or unverified loyalty sender must defer');
    assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
    assert.ok(x.calls.every(c=>c.instance==='333'),'never even consider platform primary or backup'); checks++;
  }
  for (const fault of [undefined,'timeout','json','ack',400,401,403,429,500]) {
    const x = await scenario({loyaltyOnly:true,fault});
    assert.equal(x.selected.idInstance,'333');
    assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
    assert.ok(x.calls.every(c=>c.instance==='333'),'never switch sender after a brand POST'); checks++;
  }
  for (const [options, expected] of [[{},'333'], [{states:{333:'notAuthorized'}},'111'], [{linked:null},'111'], [{getterError:true},'111'], [{states:{333:'timeout',111:'notAuthorized'}},'222'], [{states:{333:'notAuthorized',111:'notAuthorized',222:'notAuthorized'}},null]]) {
    const x = await scenario(options); assert.equal(x.selected?.idInstance ?? null, expected); assert.equal(x.calls.filter(c=>c.method==='POST').length, expected ? 1 : 0); checks++;
  }
  for (const fault of ['timeout','json','ack',408,500,502,400,401,403,429,466]) {
    const x = await scenario({fault}); assert.equal(x.calls.filter(c=>c.method==='POST').length,1,'never resubmit after any POST');
    assert.equal(x.calls.length,2,'no fallback health check after POST');
    assert.equal(x.result.status, typeof fault === 'number' && fault < 500 && fault !== 408 ? 'rejected' : 'unknown'); checks++;
  }
  const foreign = await scenario({tenant:'another-cafe'}); assert.equal(foreign.selected,null); assert.equal(foreign.calls.length,0); assert.equal(foreign.gets.length,0); checks++;
  const missingPrimary = await scenario({linked:null,configuration:{...env,GREEN_API_ID_INSTANCE:''}}); assert.equal(missingPrimary.selected,null); checks++;
  const invalidBrand = await scenario({linked:{...config('333'),apiUrl:'https://evil.example'}}); assert.equal(invalidBrand.selected.idInstance,'111'); checks++;
  const changedPhone = await scenario({accountPhone:'966522222222'}); assert.equal(changedPhone.selected.idInstance,'111'); assert.equal(changedPhone.calls.filter(c=>c.method==='POST').length,1); checks++;
  const normal = await scenario();
  for(const options of [{},{linked:null},{getterError:true},{states:{333:'notAuthorized'}},{accountPhone:'966522222222'}]){
    const x=await scenario({brand:true,tenant:meram,...options});
    for(const purpose of ['customer_signup','customer_login','finance_cashier_login']) assert.equal(x.router.isBrandCustomerOtp(meram,purpose),true);
    if(Object.keys(options).length){
      assert.equal(x.selected,null);await assert.rejects(x.router.selectBrandOtpSender(meram),/OTP_SENDERS_UNAVAILABLE/);
    }else{assert.equal(x.selected.idInstance,'333');assert.equal((await x.router.selectBrandOtpSender(meram)).idInstance,'333');}
    assert(x.calls.every(c=>c.instance==='333'));checks++;
  }
  const incidentGreen = load('lib/whatsapp/green-api.ts', {}, {...env,GREEN_API_TEMPORARY_BACKUP_ONLY:'true'}, async()=>{throw Error('Unexpected network');});
  const documents = load('lib/whatsapp/company-document.ts', {
    './green-api': incidentGreen,
    './customer-routing': {selectBrandCustomerSender:async()=>{throw Error('Unexpected routing');}},
    './brand-connection-types': {LOCO_CAFE_ID:loco,supportsPrivateWhatsApp},
  }, env, async()=>{throw Error('Unexpected document submission');});
  for (const tenant of [loco,'other']) { assert.equal(await documents.selectCompanyDocumentSender(tenant),null); checks++; }
  await assert.rejects(documents.sendCompanyDocument(config('222'),{}),/MESSAGING_TEMPORARILY_PAUSED/); checks++;
  for(const purpose of ['finance_cashier_login','owner_login','cashier_login',null,undefined]) { assert.equal(normal.router.isLocoCustomerOtp(loco,purpose),false); checks++; }
  for(const purpose of ['customer_signup','customer_login']) { assert.equal(normal.router.isLocoCustomerOtp(loco,purpose),true); assert.equal(normal.router.isLocoCustomerOtp('other',purpose),false); checks++; }
  assert.equal(normal.router.isLocoCustomerOtp(null,'customer_login'),false); checks++;
  for (const [options, expected] of [[{},'333'],[{linked:null},'111'],[{states:{333:'notAuthorized'}},'111'],[{states:{333:'timeout'}},'111'],[{accountPhone:'966522222222'},'111'],[{getterError:true},'111'],[{states:{111:'notAuthorized'}},'333'],[{linked:null,states:{111:'notAuthorized'}},'222']]) {
    const x=await scenario({...options,brand:true,tenant:wahed});assert.equal(x.selected?.idInstance,expected);assert.deepEqual(x.gets,[wahed]);assert.equal(x.calls.filter(c=>c.method==='POST').length,1);checks++;
  }
  for(const fault of ['timeout','json','ack',400,403,429,500]) {
    const x=await scenario({brand:true,tenant:wahed,fault});assert.equal(x.selected.idInstance,'333');assert.equal(x.calls.filter(c=>c.method==='POST').length,1);assert.ok(x.calls.every(c=>c.instance==='333'),'Wahed private POST cannot trigger platform fallback');checks++;
  }
  for(const options of [{linked:null},{states:{333:'notAuthorized'}},{accountPhone:'966522222222'},{states:{333:'timeout'}}]) {
    const x=await scenario({...options,brand:true,tenant:wahed,loyaltyOnly:true});assert.equal(x.selected,null,'worker decides primary fallback before POST');assert.equal(x.calls.filter(c=>c.method==='POST').length,0);checks++;
  }
  const otherBrand=await scenario({brand:true,tenant:'another-cafe'});assert.equal(otherBrand.selected,null);assert.equal(otherBrand.calls.length,0);assert.equal(otherBrand.gets.length,0);checks++;
  for(const purpose of ['customer_signup','customer_login']) {assert.equal(normal.router.isBrandCustomerOtp(wahed,purpose),true);assert.equal(normal.router.isBrandCustomerOtp('other',purpose),false);checks++;}
  for(const purpose of ['owner_login','cashier_login','finance_cashier_login',null]) {assert.equal(normal.router.isBrandCustomerOtp(wahed,purpose),false);checks++;}
  const brandedLoco=await scenario({brand:true,tenant:loco,loyaltyOnly:true,linked:null});assert.equal(brandedLoco.selected,null,'generic adapter preserves strict LOCO loyalty');checks++;
  console.log(`PASS ${checks} LOCO customer routing cases; mocked provider only, no real messages`);
})().catch(error=>{console.error(error);process.exitCode=1;});
