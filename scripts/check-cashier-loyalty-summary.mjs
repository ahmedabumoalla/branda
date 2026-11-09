import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '..');
function load(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)(name => {
    if (name === 'server-only') return {};
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`, mocks);
    return require(name);
  }, exports);
  return exports;
}
const cafeId = '10000000-0000-4000-8000-000000000001', cashierId = '20000000-0000-4000-8000-000000000001';
const input = { cafeId, cashierId, method: 'code', value: '123' };
const summary = { customerName: 'Test', stampsInCycle: 4, purchasesRequired: 6, availableRewards: 2 };
let token = 'test-cookie', calls = [], ownerCalls = 0, replies = [], owner = async () => ({ cafeId, cashierId, token });
const mocks = {
  '@/lib/data/cashier': { getCashierToken: async () => token, requireCashierPermission: async () => { ownerCalls++; return owner(); } },
  '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: (name, args) => {
    calls.push({ name, args });
    return { abortSignal: async signal => { assert(signal instanceof AbortSignal); return replies.shift() ?? { data: { ok: true, summary }, error: null }; } };
  } }) },
};
const dal = load('lib/data/cashier-loyalty-summary.ts', mocks);
let checks = 0;
async function check(name, fn) { calls = []; replies = []; ownerCalls = 0; token = 'test-cookie'; owner = async () => ({ cafeId, cashierId, token }); await fn(); checks++; console.log(`PASS ${name}`); }
await check('ordinary cashier uses one scoped RPC and exact compact summary', async () => {
  assert.deepEqual(await dal.getCashierLoyaltySummary(input), { ok: true, summary });
  assert.equal(calls.length, 1); assert.equal(ownerCalls, 0);
  assert.deepEqual(calls[0], { name: 'get_cashier_loyalty_summary', args: { p_session_token: token, p_expected_cafe_id: cafeId, p_expected_cashier_id: cashierId, p_method: 'code', p_value: '123', p_owner_verified: false } });
});
await check('Arabic Persian numbers and phone in either tab normalize safely', async () => {
  for (const method of ['code', 'phone']) for (const value of ['٠٥٠١٢٣٤٥٦٧', '۰۵۰۱۲۳۴۵۶۷', '+966 50 123 4567', '00966501234567', '501234567']) {
    assert.equal((await dal.getCashierLoyaltySummary({ ...input, method, value })).ok, true);
    assert.equal(calls.at(-1).args.p_method, 'phone'); assert.equal(calls.at(-1).args.p_value, '966501234567');
  }
  for (const value of ['1', '٢', '۹۹۹۹۹']) {
    await dal.getCashierLoyaltySummary({ ...input, method: 'phone', value });
    assert.equal(calls.at(-1).args.p_method, 'code');
  }
});
await check('QR card accepted reward QR and malformed input rejected before RPC', async () => {
  const { createBarndaksaQrPayload } = load('lib/loyalty/secure-qr-payload.ts');
  await dal.getCashierLoyaltySummary({ ...input, value: createBarndaksaQrPayload('loyalty-card', 'ABCD123') });
  assert.equal(calls.at(-1).args.p_value, 'ABCD123');
  for (const value of ['', 'a'.repeat(501), '1 OR 1=1', createBarndaksaQrPayload('customer-reward', 'ABCD123')]) {
    assert.equal((await dal.getCashierLoyaltySummary({ ...input, value })).code, 'invalid_input');
  }
  assert.equal(calls.length, 1);
  assert.equal((await dal.getCashierLoyaltySummary({ ...input, ownerVerified: true })).code, 'invalid_input');
});
await check('missing cookie returns no data and no RPC', async () => {
  token = null; assert.equal((await dal.getCashierLoyaltySummary(input)).code, 'session_invalid'); assert.equal(calls.length, 0);
});
await check('owner fallback verifies live auth before server-only owner binding', async () => {
  replies.push({ data: { ok: false, code: 'owner_auth_required' } });
  assert.deepEqual(await dal.getCashierLoyaltySummary(input), { ok: true, summary });
  assert.equal(ownerCalls, 1); assert.equal(calls.length, 2); assert.equal(calls[1].args.p_owner_verified, true);
});
await check('owner auth denial and changed session never send verified binding', async () => {
  replies.push({ data: { ok: false, code: 'owner_auth_required' } }); owner = async () => { throw Error('private error'); };
  assert.equal((await dal.getCashierLoyaltySummary(input)).code, 'unavailable'); assert.equal(calls.length, 1);
  replies.push({ data: { ok: false, code: 'owner_auth_required' } }); owner = async () => ({ cafeId, cashierId, token: 'different' });
  assert.equal((await dal.getCashierLoyaltySummary(input)).code, 'session_scope_changed'); assert.equal(calls.length, 2);
});
await check('owner verifier respects abort and never exposes customer summary', async () => {
  replies.push({ data: { ok: false, code: 'owner_auth_required' } }); owner = () => new Promise(() => {});
  const abort = new AbortController(); const pending = dal.getCashierLoyaltySummary(input, abort.signal);
  setTimeout(() => abort.abort(), 10);
  assert.equal((await pending).code, 'unavailable'); assert.equal(calls.length, 1);
});
await check('safe failures strip internal errors and reject malformed balances', async () => {
  for (const response of [{ error: { code: 'XX000', message: 'private details' } }, { data: { ok: true, summary: { ...summary, stampsInCycle: -1 } } }, { data: { code: 'secret-private-error' } }]) {
    replies.push(response); assert.deepEqual(await dal.getCashierLoyaltySummary(input), { ok: false, code: 'unavailable' });
  }
  replies.push({ error: { code: '42501' } }); assert.equal((await dal.getCashierLoyaltySummary(input)).code, 'permission_denied');
});
let routeCalls = 0, routeResult = { ok: true, summary };
const route = load('app/api/loyalty/customer-summary/route.ts', { '@/lib/data/cashier-loyalty-summary': { getCashierLoyaltySummary: async (body, signal) => { routeCalls++; assert.deepEqual(body, input); assert(signal instanceof AbortSignal); return routeResult; } } });
const request = (body = JSON.stringify(input), headers = {}) => new Request('https://barndaksa.com/api/loyalty/customer-summary', { method: 'POST', headers: { origin: 'https://barndaksa.com', 'content-type': 'application/json', ...headers }, body });
await check('route rejects cross-origin missing origin oversized and non JSON requests', async () => {
  for (const r of [request(undefined, { origin: 'https://other.test' }), request(undefined, { origin: '' }), request(undefined, { 'sec-fetch-site': 'cross-site' }), request(undefined, { 'content-type': 'text/plain' }), request('x'.repeat(4097)), request('{'), request(undefined, { 'content-length': '9000' })]) {
    assert([400,403].includes((await route.POST(r)).status));
  }
  assert.equal(routeCalls, 0);
});
await check('route allows same origin with private no-store and correct safe statuses', async () => {
  const result = await route.POST(request()); assert.equal(result.status, 200); assert.match(result.headers.get('cache-control'), /no-store/); assert.equal(result.headers.get('vary'), 'Cookie, Origin');
  assert.deepEqual(await result.json(), { ok: true, summary });
  for (const [code, status] of [['not_found',404], ['session_invalid',401], ['session_scope_changed',403], ['permission_denied',403], ['unavailable',503]]) {
    routeResult = { ok: false, code }; assert.equal((await route.POST(request())).status, status);
  }
});
console.log(JSON.stringify({ checks, result: 'PASS' }));
