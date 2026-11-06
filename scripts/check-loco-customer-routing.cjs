const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const loco = '321fd305-1883-48df-ab69-829cf7d1bc48';
function load(file, mocks = {}, env = process.env, fetcher = globalThis.fetch) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', 'process', 'fetch', code)(name => name === 'server-only' ? {} : name in mocks ? mocks[name] : require(name), exports, { env }, fetcher);
  return exports;
}
const config = id => ({ apiUrl: 'https://api.greenapi.com', idInstance: id, apiTokenInstance: 'isolated-token-' + id });
const env = { GREEN_API_API_URL: config('111').apiUrl, GREEN_API_ID_INSTANCE: '111', GREEN_API_API_TOKEN_INSTANCE: config('111').apiTokenInstance,
  GREEN_API_OTP_BACKUP_API_URL: config('222').apiUrl, GREEN_API_OTP_BACKUP_ID_INSTANCE: '222', GREEN_API_OTP_BACKUP_API_TOKEN_INSTANCE: config('222').apiTokenInstance,
  GREEN_API_ACCESS_SENDER: 'backup' };
let checks = 0;
async function scenario({ states = {}, linked = { ...config('333'), expectedPhone: '966511111111' }, accountPhone = '966511111111', fault, tenant = loco, getterError = false, configuration = env } = {}) {
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
    '@/lib/whatsapp/brand-connection-types': { LOCO_CAFE_ID: loco },
    '@/lib/data/brand-whatsapp': { getLocoCustomerWhatsAppCredentials: async id => { gets.push(id); if (getterError) throw Error('private-token'); return linked; } },
  });
  const selected = await router.selectLocoCustomerSender(tenant);
  const result = selected ? await green.sendGreenApiCustomerMessage(selected, { phone: '966500000000', message: 'isolated customer test' }) : null;
  return { calls, gets, selected, result, router };
}
(async () => {
  for (const [options, expected] of [[{},'333'], [{states:{333:'notAuthorized'}},'111'], [{linked:null},'111'], [{getterError:true},'111'], [{states:{333:'timeout',111:'notAuthorized'}},'222'], [{states:{333:'notAuthorized',111:'notAuthorized',222:'notAuthorized'}},null]]) {
    const x = await scenario(options); assert.equal(x.selected?.idInstance ?? null, expected); assert.equal(x.calls.filter(c=>c.method==='POST').length, expected ? 1 : 0); checks++;
  }
  for (const fault of ['timeout','json','ack',408,500,502,400,401,403,429,466]) {
    const x = await scenario({fault}); assert.equal(x.calls.filter(c=>c.method==='POST').length,1,'never resubmit after any POST');
    assert.equal(x.calls.length,2,'no fallback health check after POST');
    assert.equal(x.result.status, typeof fault === 'number' && fault < 500 && fault !== 408 ? 'rejected' : 'unknown'); checks++;
  }
  const foreign = await scenario({tenant:'another-cafe'}); assert.equal(foreign.selected,null); assert.equal(foreign.calls.length,0); assert.equal(foreign.gets.length,0); checks++;
  const missingPrimary = await scenario({linked:null,configuration:{...env,GREEN_API_ID_INSTANCE:''}}); assert.equal(missingPrimary.selected.idInstance,'222'); checks++;
  const invalidBrand = await scenario({linked:{...config('333'),apiUrl:'https://evil.example'}}); assert.equal(invalidBrand.selected.idInstance,'111'); checks++;
  const changedPhone = await scenario({accountPhone:'966522222222'}); assert.equal(changedPhone.selected.idInstance,'111'); assert.equal(changedPhone.calls.filter(c=>c.method==='POST').length,1); checks++;
  const normal = await scenario();
  for(const purpose of ['finance_cashier_login','owner_login','cashier_login',null,undefined]) { assert.equal(normal.router.isLocoCustomerOtp(loco,purpose),false); checks++; }
  for(const purpose of ['customer_signup','customer_login']) { assert.equal(normal.router.isLocoCustomerOtp(loco,purpose),true); assert.equal(normal.router.isLocoCustomerOtp('other',purpose),false); checks++; }
  assert.equal(normal.router.isLocoCustomerOtp(null,'customer_login'),false); checks++;
  console.log(`PASS ${checks} LOCO customer routing cases; mocked provider only, no real messages`);
})().catch(error=>{console.error(error);process.exitCode=1;});
