const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', compiled)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'server-only') return {};
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    return require(name);
  }, exports);
  return exports;
}
(async () => {
  let checks = 0;
  const originalFetch = global.fetch;
  const keys = ['GREEN_API_API_URL', 'GREEN_API_ID_INSTANCE', 'GREEN_API_API_TOKEN_INSTANCE', 'CRON_SECRET'];
  const originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.GREEN_API_API_URL = 'https://isolated.invalid'; process.env.GREEN_API_ID_INSTANCE = 'fixture'; process.env.GREEN_API_API_TOKEN_INSTANCE = 'fixture-secret';
    const provider = load('lib/whatsapp/green-api.ts');
    let calls = 0; let outcome = 'queued';
    global.fetch = async (_url, init) => {
      calls++; const payload = JSON.parse(init.body);
      assert.equal(payload.chatId, '966500000000@c.us'); assert.equal(payload.linkPreview, false); assert.equal(init.cache, 'no-store');
      if (outcome === 'timeout') throw new Error('provider transport uncertainty');
      if (outcome === 'bad-json') return { ok: true, json: async () => { throw new Error('invalid'); } };
      return { ok: outcome === 'queued' || outcome === 'missing-id', status: Number(outcome) || 200, json: async () => outcome === 'missing-id' ? {} : { idMessage: 'queue-id' } };
    };
    for (const [scenario, expected] of [['queued', 'queued'], ['400', 'rejected'], ['429', 'rejected'], ['500', 'unknown'], ['timeout', 'unknown'], ['bad-json', 'unknown'], ['missing-id', 'unknown']]) {
      outcome = scenario;
      assert.equal((await provider.sendGreenApiFinanceShiftAlert({ phone: '966500000000', message: 'isolated fixture' })).status, expected); checks++;
    }
    assert.equal(calls, 7); await assert.rejects(() => provider.sendGreenApiFinanceShiftAlert({ phone: 'invalid', message: 'fixture' })); assert.equal(calls, 7); checks++;
    let configured = false; const sends = []; const completions = []; let completeError = false;
    const row = { id: 'fixture', leaseToken: 'lease', phase: 'opening', shiftNumber: 12, expectedCash: 100, countedCash: 90, difference: -10, ownerPhone: '0500000000', employeeName: 'Fixture employee', previousEmployeeName: 'Previous employee', drawerName: 'Branch drawer', brandName: 'Fixture brand' };
    let rows = [row];
    const module = load('lib/data/finance-shift-alerts.ts', {
      '@/lib/whatsapp/green-api': { isGreenApiConfigured: () => configured, sendGreenApiFinanceShiftAlert: async (input) => { sends.push(input); return { status: outcome, providerMessageId: outcome === 'queued' ? 'provider-id' : undefined }; } },
      '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async (name, args) => name.includes('claim') ? { data: rows } : (completions.push(args), { data: !completeError, error: completeError ? {} : null }) }) },
    });
    assert.equal((await module.dispatchShiftAlerts()).configured, false); assert.equal(sends.length, 0); checks++;
    configured = true; outcome = 'queued';
    assert.equal((await module.dispatchShiftAlerts()).queued, 1); assert.equal(sends[0].phone, '966500000000'); assert.equal(completions[0].p_lease_token, 'lease'); checks++;
    rows = [{ ...row, ownerPhone: null }]; await module.dispatchShiftAlerts(); assert.equal(sends.length, 1); assert.equal(completions.at(-1).p_status, 'missing_owner'); checks++;
    rows = [row]; outcome = 'unknown'; assert.equal((await module.dispatchShiftAlerts()).needsReview, 1); assert.equal(completions.at(-1).p_status, 'unknown'); checks++;
    completeError = true; outcome = 'queued'; const prior = sends.length; assert.equal((await module.dispatchShiftAlerts()).needsReview, 1); assert.equal(sends.length, prior + 1); checks++;
    const message = module.financeShiftAlertMessage(row); assert.match(message, /العجز/); assert.match(message, /رقم 12/); assert.match(message, /Previous employee/); assert.match(message, /الموظف الذي بدأ الوردية: Fixture employee/); assert.match(message, /Branch drawer/); assert.doesNotMatch(message, /الرصيد المتوقع|النقدية المعدودة|delivered/); checks++;
    assert.match(module.financeShiftAlertMessage({ ...row, previousEmployeeName: null }), /لا توجد وردية سابقة/); checks++;
    assert.match(module.financeShiftAlertMessage({ ...row, difference: 10 }), /الزيادة/); checks++;
    for (const difference of [0, NaN, Infinity]) {
      const before = sends.length; rows = [{ ...row, difference }]; completeError = false;
      await module.dispatchShiftAlerts(); assert.equal(sends.length, before); assert.equal(completions.at(-1).p_status, 'rejected'); checks++;
    }
    assert.throws(() => module.financeShiftAlertMessage({ ...row, shiftNumber: 0 })); checks++;
    let cronCalls = 0;
    const cron = load('app/api/finance/jobs/route.ts', {
      '@/lib/data/finance-shift-alerts': { dispatchShiftAlerts: async () => { cronCalls++; return { queued: 1 }; } },
      '@/lib/data/finance-pos-customer-messages': { dispatchFinancePosCustomerMessages: async () => ({ claimed: 0, queued: 0, needsReview: 0 }) },
    });
    delete process.env.CRON_SECRET;
    assert.equal((await cron.GET(new Request('http://localhost/api/finance/jobs'))).status, 401); checks++;
    process.env.CRON_SECRET = 'isolated-secret-'.repeat(4);
    assert.equal((await cron.GET(new Request('http://localhost/api/finance/jobs', { headers: { authorization: 'Bearer wrong' } }))).status, 401); assert.equal(cronCalls, 0); checks++;
    assert.equal((await cron.GET(new Request('http://localhost/api/finance/jobs', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }))).status, 200); assert.equal(cronCalls, 1); checks++;
    console.log(`PASS ${checks} finance alert tests: provider acknowledgement/uncertainty, owner recipient, no duplicate retries, disabled config and cron authentication`);
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
