const fs = require('node:fs'), assert = require('node:assert/strict'), crypto = require('node:crypto'), ts = require('typescript'), { z } = require('zod');
const file = 'app/actions/loyalty-experience.ts';
const text = fs.readFileSync(file, 'utf8');
const source = text.slice(text.indexOf('export async function scanLoyaltyExperienceAction('), text.indexOf('export async function sendLoyaltyWalletAnnouncementAction('));
const cafeId = crypto.randomUUID(), cashierId = crypto.randomUUID(), requestId = crypto.randomUUID();
let state, calls, checks = 0;
function reset() { state = { session: { cafeId, cashierId, cafeSlug: 'mind-hospital', token: 'server-private-token' }, features: true, result: { ok: true, status: 'redeemed' } };calls = []; }
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const reject = async (fn, expression) => { await assert.rejects(fn, expression);checks++; };
const exportsObject = {};
const deps = {
 z,
 requireCashierPermission: async permission => { calls.push(['permission', permission]);if (state.sessionError) throw Error('Expired');return state.session; },
 getPublicCafeFeatureCodesBySlug: async slug => { calls.push(['features', slug]);return state.features; }, featureCodesAllow: features => features,
 normalizeLoyaltyDigits: value => value, parseBarndaksaQrPayload: () => null, isCashierLoyaltyCode: value => /^[A-Z0-9_-]{4,100}$/.test(value),
 resolveCashierCardNumber: async (value, cafe) => { calls.push(['resolve', value, cafe]);return value; },
 createAdminClient: () => ({ rpc: async (name, payload) => { calls.push(['rpc', name, payload]);return { data: state.result, error: state.rpcError ?? null }; } }),
 after: () => { calls.push(['after']); }, syncWalletCardByCode: async () => { throw Error('No real wallet sync allowed'); },
};
new Function('exports', ...Object.keys(deps), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(exportsObject, ...Object.values(deps));
const input = { value: 'REWARD123', requestId, kind: 'redeem', expectedScope: { cafeId, cashierId } };
(async () => {
 const startedAt = new Date().toISOString();
 reset();equal(await exportsObject.scanLoyaltyExperienceAction(input), state.result, 'matching scope executes original operation');
 equal(calls.filter(call => call[0] === 'permission').length, 1, 'one authoritative session captured for validation and dispatch');
 equal(calls.find(call => call[0] === 'rpc'), ['rpc', 'execute_loyalty_audited_operation', { p_session_token: 'server-private-token', p_code: 'REWARD123', p_request_id: requestId, p_operation: 'redeem' }], 'original audited operation parameters unchanged');
 for (const kind of ['stamp', 'redeem']) for (const field of ['cafeId', 'cashierId']) { reset();state.session[field] = crypto.randomUUID();await reject(() => exportsObject.scanLoyaltyExperienceAction({ ...input, kind }), /تغيرت جلسة/);equal(calls, [['permission', 'loyalty']], 'changed operator or tenant rejected before lookup or mutation'); }
 for (const expectedScope of [{ cafeId }, { cafeId, cashierId: 'invalid' }, { cafeId, cashierId, token: 'forged' }, null]) { reset();await reject(() => exportsObject.scanLoyaltyExperienceAction({ ...input, expectedScope }), /./);equal(calls, [], 'invalid scope rejected before auth or IO'); }
 reset();state.sessionError = true;await reject(() => exportsObject.scanLoyaltyExperienceAction(input), /Expired/);equal(calls.filter(call => call[0] === 'rpc').length, 0, 'expired original session cannot mutate');
 reset();state.features = false;await reject(() => exportsObject.scanLoyaltyExperienceAction(input), /غير متاح/);equal(calls.filter(call => call[0] === 'rpc').length, 0, 'feature gate preserved');
 reset();const { expectedScope: omitted, ...legacy } = input;void omitted;equal(await exportsObject.scanLoyaltyExperienceAction(legacy), state.result, 'existing legacy callers retain original session permission path');
 reset();state.result = { ok: false, errorCode: 'reward_unavailable' };equal(await exportsObject.scanLoyaltyExperienceAction(input), { ok: false, status: 'reward_unavailable' }, 'audited rejection unchanged');
 reset();state.rpcError = {};await reject(() => exportsObject.scanLoyaltyExperienceAction(input), /تعذر/);
 const files = [file, 'scripts/check-loyalty-scan-scope.cjs', 'package-lock.json'];
 fs.mkdirSync('output/finance-loyalty-reader-20261114', { recursive: true });fs.writeFileSync('output/finance-loyalty-reader-20261114/scan-scope.json', JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), runtime: process.version, passed: true, checks, inputs: Object.fromEntries(files.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex')])), limits: ['Mocked session and audited operation dispatch', 'No actual card, stamp, reward or message operations'] }, null, 2));
 console.log(`PASS ${checks} loyalty scan scope checks`);
})().catch(error => { console.error(error);process.exitCode = 1; });
