const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const base = {
  GREEN_API_API_URL: 'https://1100.api.greenapi.com', GREEN_API_ID_INSTANCE: '111', GREEN_API_API_TOKEN_INSTANCE: 'primary-secret',
  GREEN_API_OTP_BACKUP_API_URL: 'https://7700.api.greenapi.com', GREEN_API_OTP_BACKUP_ID_INSTANCE: '222', GREEN_API_OTP_BACKUP_API_TOKEN_INSTANCE: 'backup-secret',
};
function load(file, env, fetcher) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', 'process', 'fetch', code)(name => name === 'server-only' || name.includes('green-api-partner') ? {} : require(name), exports, { env }, fetcher);
  return exports;
}
async function scenario({ state = 'authorized', backupState = 'authorized', status = 200, ambiguous, env = base, method = 'sendGreenApiSupabaseOtp' } = {}) {
  const calls = [];
  const api = load('lib/whatsapp/green-api.ts', env, async (url, init) => {
    const backup = url.includes('waInstance222');
    calls.push({ url, ...init });
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    if (url.includes('getStateInstance')) {
      if (state === 'timeout' && !backup) throw Error('private URL');
      return Response.json({ stateInstance: backup ? backupState : state });
    }
    if (ambiguous === 'timeout') throw Error('primary-secret URL');
    if (ambiguous === 'json') return new Response('bad json');
    if (ambiguous === 'ack') return Response.json({});
    return backup || status === 200 ? Response.json({ idMessage: 'ack' }) : new Response('', { status });
  });
  let error;
  try { await api[method]({ phoneNormalized: '966500000001', code: '123456', brandName: 'Example' }); } catch (e) { error = e; }
  return { calls, sends: calls.filter(c => c.method === 'POST'), error };
}
(async () => {
  let checks = 0;
  for (const method of ['sendGreenApiSupabaseOtp', 'sendGreenApiOtp']) {
    const normal = await scenario({ method });
    assert.equal(normal.error, undefined); assert.equal(normal.sends.length, 1); assert.match(normal.sends[0].url, /waInstance111/); checks++;
    for (const state of ['notAuthorized', 'blocked', 'sleepMode', 'starting', 'yellowCard', 'suspended', 'timeout']) {
      const x = await scenario({ method, state });
      assert.equal(x.error, undefined); assert.equal(x.sends.length, 1); assert.match(x.sends[0].url, /waInstance222/); checks++;
    }
  }
  for (const status of [401, 403, 429, 466]) {
    const x = await scenario({ status }); assert.equal(x.error, undefined); assert.equal(x.sends.length, 2);
    assert.equal(x.sends[0].body, x.sends[1].body, 'same code and recipient'); checks++;
  }
  for (const status of [400, 408, 500, 502, 504]) {
    const x = await scenario({ status }); assert.ok(x.error); assert.equal(x.sends.length, 1); checks++;
  }
  for (const ambiguous of ['timeout', 'json', 'ack']) {
    const x = await scenario({ ambiguous }); assert.equal(x.error.message, 'OTP_SEND_OUTCOME_UNKNOWN'); assert.equal(x.sends.length, 1); checks++;
  }
  const down = await scenario({ state: 'notAuthorized', backupState: 'notAuthorized' });
  assert.ok(down.error); assert.equal(down.sends.length, 0); checks++;
  const legacy = await scenario({ env: Object.fromEntries(Object.entries(base).filter(([k]) => !k.includes('BACKUP'))) });
  assert.equal(legacy.error, undefined); assert.equal(legacy.calls.length, 1); checks++;
  for (const value of ['http://7700.api.greenapi.com', 'https://evil.example', 'https://api.greenapi.com/steal']) {
    const x = await scenario({ env: { ...base, GREEN_API_OTP_BACKUP_API_URL: value } });
    assert.equal(x.error, undefined); assert.equal(x.calls.length, 1); assert.match(x.sends[0].url, /waInstance111/); checks++;
  }
  const invalid = load('lib/whatsapp/green-api.ts', base, () => { throw Error('must not request'); });
  await assert.rejects(() => invalid.sendGreenApiSupabaseOtp({ phoneNormalized: 'bad', code: '123456' }), /OTP_INPUT_INVALID/); checks++;
  const urls = [];
  const operational = load('lib/whatsapp/green-api.ts', base, async url => { urls.push(url); return Response.json({ idMessage: 'ok' }); });
  await operational.sendGreenApiPagerMessage({ phone: '966500000001', message: 'test' });
  await operational.sendGreenApiFinanceShiftAlert({ phone: '966500000001', message: 'test' });
  await operational.sendGreenApiOwnerWelcome({ phone: '966500000001', brandName: 'Test', password: 'mock', startsTrial: false });
  assert.equal(urls.length, 3); assert.ok(urls.every(url => url.includes('waInstance111'))); checks++;
  const marketing = fs.readFileSync('lib/whatsapp/green-api-marketing.ts', 'utf8');
  assert.match(marketing, /value.idInstance === process.env.GREEN_API_OTP_BACKUP_ID_INSTANCE/);
  assert.ok(!fs.readFileSync('lib/whatsapp/green-api-platform-campaigns.ts', 'utf8').includes('OTP_BACKUP')); checks++;
  console.log(`PASS ${checks} OTP failover scenarios; mocked only, no messages sent`);
})().catch(e => { console.error(e); process.exitCode = 1; });
