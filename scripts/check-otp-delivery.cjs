const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { createHmac, randomBytes } = require('node:crypto');
function load(file, mocks) {
  const output = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => name in mocks ? mocks[name] : require(name), output);
  return output;
}
let count = 0;
async function test(name, run) { await run(); count++; console.log('PASS ' + name); }
const id = '16b4c203-44a2-4a18-98c5-c63403800a01', lease = '16b4c203-44a2-4a18-98c5-c63403800a02';
let key = 'isolated-service-test-key', jobs = [], calls = [], sends = [], unavailable = false, admitted = true, sendError = false, releaseSend;
const admin = { rpc: async (name, args) => {
  calls.push({ name, args });
  if (unavailable) return { error: { code: 'XX000' } };
  if (name === 'enqueue_customer_phone_otp_delivery') {
    if (!admitted) return { error: { code: '42501' } };
    jobs.push({ id, payload: args.p_payload, lease_token: lease });
    return { data: id };
  }
  if (name === 'claim_customer_phone_otp_delivery') return { data: jobs.splice(0, 1) };
  if (name === 'finish_customer_phone_otp_delivery') return { data: true };
  throw new Error('unexpected RPC');
} };
const messages = [];
const originalError = console.error;
console.error = (...args) => messages.push(JSON.stringify(args));
const delivery = load('lib/auth/otp-delivery.ts', {
  'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => admin },
  '@/lib/barndaksa/env': { getSupabaseServiceRoleKey: () => key },
  '@/lib/whatsapp/green-api': {
    greenApiProviderInstanceKey: () => 'isolated-provider',
    sendGreenApiSupabaseOtp: async (payload, options) => {
      sends.push({ payload, options });
      if (sendError) throw new Error('private-provider-secret');
      if (releaseSend) await releaseSend.promise;
    },
  },
});
const secret = randomBytes(32);
process.env.SUPABASE_SEND_SMS_HOOK_SECRET = 'v1,whsec_' + secret.toString('base64');
let afterTasks = [];
const signature = load('lib/auth/supabase-hook-signature.ts', { 'server-only': {} });
const hook = load('app/api/auth/hooks/send-sms/route.ts', {
  'next/server': { after: fn => afterTasks.push(fn) },
  '@/lib/auth/phone-utils': load('lib/auth/phone-utils.ts', { 'server-only': {} }),
  '@/lib/auth/supabase-hook-signature': signature,
  '@/lib/auth/otp-delivery': delivery,
  '@/lib/auth/phone-otp': { isAllowedCustomerOtpPhone: () => true, isPhoneOtpRequiredForBrand: () => true },
});
function request(signed = true, raw = JSON.stringify({ user: { phone: '+966500000001' }, sms: { otp: '123456' } })) {
  const timestamp = String(Math.floor(Date.now()/1000)), webhookId = 'isolated-hook';
  return new Request('https://example.test/api/auth/hooks/send-sms', { method: 'POST', body: raw, headers: signed ? {
    'webhook-id': webhookId, 'webhook-timestamp': timestamp,
    'webhook-signature': 'v1,' + createHmac('sha256', secret).update(`${webhookId}.${timestamp}.${raw}`).digest('base64'),
  } : {} });
}
(async () => {
  await test('untrusted hook never writes queue or sends', async () => {
    assert.equal((await hook.POST(request(false))).status, 401); assert.equal(calls.length, 0);
  });
  await test('Auth responds after durable enqueue before any provider wait', async () => {
    const response = await hook.POST(request());
    assert.equal(response.status, 200); assert.equal(sends.length, 0); assert.equal(afterTasks.length, 1);
    assert.equal(calls.at(-1).name, 'enqueue_customer_phone_otp_delivery');
    assert(!calls.at(-1).args.p_payload.includes('123456'));
    assert(!calls.at(-1).args.p_payload.includes('966500000001'));
  });
  await test('slow provider runs after Auth acknowledgement with separate 25s deadline', async () => {
    let resolve; releaseSend = { promise: new Promise(r => resolve = r) };
    const task = afterTasks.shift()(); await new Promise(r => setImmediate(r));
    assert.equal(sends.length, 1); assert.equal(sends[0].payload.code, '123456');
    assert.equal(sends[0].options.timeoutMs, 25000);
    assert(!calls.some(call => call.name === 'finish_customer_phone_otp_delivery'));
    resolve(); await task; releaseSend = null;
    assert.equal(calls.at(-1).args.p_status, 'sent');
  });
  await test('unadmitted signed requests fail closed', async () => {
    admitted = false; assert.equal((await hook.POST(request())).status, 403); admitted = true;
    assert.equal(afterTasks.length, 0);
  });
  await test('failed persistence never acknowledges Auth success', async () => {
    unavailable = true; assert.equal((await hook.POST(request())).status, 502); unavailable = false;
    assert.equal(afterTasks.length, 0);
  });
  await test('random IV makes each encrypted envelope distinct', () => {
    const payload = { phoneNormalized: '966500000001', code: '123456' };
    assert.notEqual(delivery.sealOtpDelivery(payload), delivery.sealOtpDelivery(payload));
  });
  await test('tampered ciphertext never reaches provider', async () => {
    const payload = delivery.sealOtpDelivery({ phoneNormalized: '966500000001', code: '123456' });
    const parts = payload.split('.'); parts[3] = (parts[3][0] === 'a' ? 'b' : 'a') + parts[3].slice(1);
    jobs = [{ id, payload: parts.join('.'), lease_token: lease }];
    const before = sends.length; await delivery.deliverQueuedOtp();
    assert.equal(sends.length, before); assert.equal(calls.at(-1).args.p_status, 'failed');
  });
  await test('key mismatch never sends', async () => {
    const payload = delivery.sealOtpDelivery({ phoneNormalized: '966500000001', code: '123456' });
    key = 'rotated-test-key'; jobs = [{ id, payload, lease_token: lease }];
    const before = sends.length; await delivery.deliverQueuedOtp(); assert.equal(sends.length, before);
    key = 'isolated-service-test-key';
  });
  await test('provider timeout is unknown and cannot resend a claimed job', async () => {
    await delivery.enqueueOtpDelivery({ phoneNormalized: '966500000001', code: '123456', webhookId: 'new-hook' });
    sendError = true; await delivery.deliverQueuedOtp(); sendError = false;
    assert.equal(calls.at(-1).args.p_status, 'unknown');
    const before = sends.length; assert.equal(await delivery.deliverQueuedOtp(), false); assert.equal(sends.length, before);
  });
  await test('cron worker recovers pending work when after is interrupted', async () => {
    await hook.POST(request()); afterTasks = [];
    const result = await delivery.runOtpDeliveryJobs(); assert.equal(result.processed, 1); assert.equal(result.errors, 0);
  });
  await test('cron requires a strong matching secret', async () => {
    let runs = 0;
    const cron = load('app/api/auth/otp-jobs/route.ts', { '@/lib/auth/otp-delivery': { runOtpDeliveryJobs: async () => { runs++; return {}; } } });
    process.env.CRON_SECRET = 'x'.repeat(32);
    assert.equal((await cron.GET(new Request('https://example.test'))).status, 401);
    assert.equal(runs, 0);
    assert.equal((await cron.GET(new Request('https://example.test', { headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } }))).status, 200);
    assert.equal(runs, 1);
  });
  await test('no OTP, phone, payload or provider secret appears in logs', () => {
    const output = messages.join('');
    for (const value of ['123456', '966500000001', 'private-provider-secret', 'isolated-service-test-key']) assert(!output.includes(value));
  });
  console.error = originalError;
  console.log(`PASS ${count} OTP delivery tests; no real messages or accounts`);
})().catch(error => { console.error = originalError; console.error(error); process.exitCode = 1; });
