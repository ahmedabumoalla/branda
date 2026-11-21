const fs = require('node:fs'), assert = require('node:assert/strict'), crypto = require('node:crypto'), ts = require('typescript');
const file = 'app/actions/finance-loyalty-reader.ts';
let checks = 0, state, calls;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
function reset() {
  calls = [];
  state = { cafe: { id: 'mind', slug: 'mind-hospital', role: 'owner' }, owner: { id: 'mind', role: 'owner' }, features: ['finance', 'loyalty'], user: { id: 'actor' }, cashier: { owner_user_id: 'actor' }, session: { cafeId: 'mind', cafeSlug: 'mind-hospital', cashierId: 'cashier', token: 'PRIVATE_TOKEN' }, console: { cafe: { id: 'mind', slug: 'mind-hospital' }, cashier: { id: 'cashier', canUseLoyalty: true } }, brand: { cafeId: 'mind', program: {}, identity: { name: 'Mind' } } };
}
const mocks = {
 'zod': require('zod'),
 '@/lib/loyalty/read-identifier': { normalizeLoyaltyDigits: value => value },
 '@/lib/data/brand-finance': { getBrandFinanceContext: async slug => { calls.push(['finance', slug]); if (state.financeError) throw Error('Forbidden'); return { client: {}, cafe: state.cafe }; } },
 '@/lib/data/cafes': { requireOwnerCafeContext: async () => { calls.push(['owner']); return state.owner; } },
 '@/lib/data/feature-entitlements': { getCafeFeatureCodes: async id => { calls.push(['features', id]); return state.features; } },
 '@/lib/platform/feature-gates': { featureCodesAllow: (features, code) => features.includes(code) },
 '@/lib/finance/permissions': { canFinance: (role, capability) => capability === 'pos' && ['owner', 'manager', 'cashier'].includes(role), canEmployeeAction: (role, _permissions, _code, fallback) => role === 'owner' || fallback },
 '@/lib/auth/active-user': { getActiveUser: async () => state.user },
 '@/lib/data/cashier': {
  startOwnerCashierSession: async () => { calls.push(['start']); if (state.startError) throw Error('Unavailable'); },
  requireCashierPermission: async permission => { calls.push(['permission', permission]); if (state.permissionError) throw Error('Denied'); return state.session; },
  getCashierConsole: async options => { calls.push(['console', options]); return state.console; },
 },
 '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => { calls.push(['table', table]); const query = { select: selection => { calls.push(['select', selection]); return query; }, eq: (key, value) => { calls.push(['eq', key, value]); return query; }, maybeSingle: async () => ({ data: state.cashier, error: state.cashierError ?? null }) }; return query; } }) },
 '@/lib/data/loyalty-experience': { getLoyaltyBrand: async slug => { calls.push(['brand', slug]); return state.brand; } },
 '@/lib/platform/action-result': { actionResult: async (operation, message) => { try { return { ok: true, data: await operation() }; } catch { return { ok: false, message }; } } },
};
const exportsObject = {};
new Function('require', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(name => { if (!(name in mocks)) throw Error(`Unexpected import ${name}`); return mocks[name]; }, exportsObject);
const open = confirm => exportsObject.openFinanceLoyaltyReaderAction('mind-hospital', confirm);
(async () => {
 const startedAt = new Date().toISOString();
 reset();state.brand.program = { pointsProgram: { mode: 'points', rateSar: 5, rateQuantity: 1, milestones: [{ points: 20, reward: 'Tea' }] } };
 equal((await open()).data, { status: 'ready', console: { ...state.console, pointsProgram: state.brand.program.pointsProgram }, identity: state.brand.identity, canIssue: true }, 'embedded reader receives its own brand points program');
 equal(calls.filter(call => call[0] === 'start').length, 1, 'only explicit opening starts existing owner session');
 equal(calls.find(call => call[0] === 'console'), ['console', { recordEntry: false, includeOrders: false }], 'reader loads no customer orders or duplicate console-entry logging');
 equal(calls.filter(call => call[0] === 'eq'), [['eq', 'id', 'cashier'], ['eq', 'cafe_id', 'mind'], ['eq', 'active', true]], 'cashier actor lookup scoped to active exact tenant');
 equal(JSON.stringify(await open()).includes('PRIVATE_TOKEN'), false, 'no private session token returned');
 reset();state.owner.role = 'platform_admin';state.cafe.maintenance = true;equal((await open()).data.status, 'ready', 'verified maintenance may use original reader');
 for (const maintenance of [undefined, false]) { reset();state.owner.role = 'platform_admin';state.cafe.maintenance = maintenance;equal((await open()).ok, false, 'unverified admin denied');equal(calls.some(call => call[0] === 'start'), false, 'unverified admin creates no session'); }
 for (const role of ['cashier', 'manager']) { reset();state.cafe.role = role;equal((await open()).data, { status: 'login_required' }, 'staff must explicitly use original loyalty credentials');equal(calls.some(call => ['start', 'permission', 'table', 'console'].includes(call[0])), false, 'staff never silently reuse another employee cookie'); }
 for (const role of ['accountant', 'warehouse', 'auditor']) { reset();state.cafe.role = role;equal((await open(true)).ok, false, 'non POS role denied even with loyalty confirmation');equal(calls.some(call => call[0] === 'permission'), false, 'non POS role cannot inspect loyalty session'); }
 reset();state.cafe.role = 'cashier';state.console.cashier.fullName = 'Explicit loyalty operator';equal((await open(true)).data.console.cashier.fullName, 'Explicit loyalty operator', 'explicit dual-session choice returns actual loyalty operator');equal(calls.some(call => ['start', 'owner', 'table'].includes(call[0])), false, 'staff confirmation does not create owner session or elevate privileges');
 for (const mutate of [s => { s.user = null; }, s => { s.session.cafeId = 'other'; }, s => { s.session.cafeSlug = 'other'; }, s => { s.permissionError = true; }, s => { s.console.cashier.id = 'changed-cookie'; }, s => { s.console.cashier.canUseLoyalty = false; }]) { reset();state.cafe.role = 'cashier';mutate(state);equal((await open(true)).ok, false, 'explicit confirmation still validates both sessions and scope'); }
 reset();state.cafe.role = 'cashier';equal((await open('true')).ok, false, 'nonboolean confirmation rejected');
 reset();equal((await exportsObject.openFinanceLoyaltyReaderAction('another-brand')).ok, false, 'entry limited to requested MIND flow');equal(calls, [], 'invalid tenant rejected before IO');
 for (const features of [[], ['finance'], ['loyalty']]) { reset();state.features = features;equal((await open()).ok, false, 'both entitlements required');equal(calls.some(call => call[0] === 'start'), false, 'no unauthorized session creation'); }
 for (const mutate of [s => { s.financeError = true; }, s => { s.cafe.slug = 'other'; }, s => { s.owner.id = 'other'; }, s => { s.owner.role = 'manager'; }, s => { s.user = null; }, s => { s.startError = true; }, s => { s.permissionError = true; }, s => { s.session.cafeId = 'other'; }, s => { s.session.cafeSlug = 'other'; }, s => { s.cashier.owner_user_id = 'another-actor'; }, s => { s.cashier = null; }, s => { s.cashierError = {}; }, s => { s.console = null; }, s => { s.console.cafe.id = 'other'; }, s => { s.console.cashier.id = 'another-cashier'; }, s => { s.console.cashier.canUseLoyalty = false; }, s => { s.brand.cafeId = 'other'; }]) { reset();mutate(state);const result = await open();equal(result.ok, false, 'invalid session or identity denied');equal(Object.hasOwn(result, 'data'), false, 'failure returns no reader data'); }
 reset();state.brand = null;equal((await open()).data.identity, undefined, 'unconfigured reward program is not fabricated');
 const cashierSource = fs.readFileSync('lib/data/cashier.ts', 'utf8');
 const consoleSource = cashierSource.slice(cashierSource.indexOf('export async function getCashierConsole('), cashierSource.indexOf('export async function getCashierOrders('));
 const consoleModule = {}, orderCalls = [], entryCalls = [];
 new Function('exports', 'createAdminClient', 'requireCashierPermission', 'loadCashierOrders', 'recordCashierConsoleEntry', ts.transpileModule(consoleSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(consoleModule, () => ({}), async () => state.session, async () => { orderCalls.push(true);return { orders: [{ id: 'original-order' }], dataError: null }; }, async () => { entryCalls.push(true); });
 reset();equal((await consoleModule.getCashierConsole({ recordEntry: false, includeOrders: false })).orders, [], 'actual reader console returns empty orders');equal(orderCalls.length, 0, 'actual reader console never fetches orders');equal(entryCalls.length, 0, 'actual reader console never records entry');
 equal((await consoleModule.getCashierConsole()).orders, [{ id: 'original-order' }], 'default cashier console retains original order loading');equal(orderCalls.length, 1, 'existing default fetch still runs');equal(entryCalls.length, 1, 'existing default entry logging retained');
 state.session = null;equal(await consoleModule.getCashierConsole({ includeOrders: false }), null, 'no-order option still requires valid loyalty session');equal(orderCalls.length, 1, 'unauthorized path cannot load orders');
 const files = [file, 'lib/data/cashier.ts', 'scripts/check-finance-loyalty-reader.cjs', 'package-lock.json'];
 fs.mkdirSync('output/finance-loyalty-reader-20261114', { recursive: true });
 fs.writeFileSync('output/finance-loyalty-reader-20261114/server.json', JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), runtime: process.version, passed: true, checks, inputs: Object.fromEntries(files.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex')])), limits: ['Mocked server auth/session checks; no real session creation, stamp, card, reward or message', 'Finance staff explicitly selects the verified loyalty operator; no implicit mapping between independent employee identities'] }, null, 2));
 console.log(`PASS ${checks} finance loyalty reader checks`);
})().catch(error => { console.error(error); process.exitCode = 1; });
