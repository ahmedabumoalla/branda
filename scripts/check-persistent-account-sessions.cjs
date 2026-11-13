const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
let checks = 0;
function check(value, message) { assert(value, message); checks++; }
function load(file, mocks = {}) {
  const exports = {};
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    if (name.startsWith('.')) return load(path.join(path.dirname(file), name) + '.ts', mocks);
    return require(name);
  }, exports);
  return exports;
}
async function main() {
  const policy = load('lib/auth/session-policy.ts');
  check(policy.SESSION_COOKIE_SECONDS === 34560000, 'Browser cookie renews for 400 days');
  const { getActiveUser } = load('lib/auth/active-user.ts');
  let user = { id: 'admin' }, error = null, active = true, accessError = null;
  const client = { auth: { getUser: async () => ({ data: { user }, error }) }, rpc: async name => {
    assert.equal(name, 'current_account_active'); return { data: active, error: accessError };
  } };
  check((await getActiveUser(client)).id === 'admin', 'Active account retained');
  active = false; check(await getActiveUser(client) === null, 'Suspended/banned account denied');
  active = true; error = { status: 503 }; await assert.rejects(getActiveUser(client), /temporarily/); checks++;
  error = { name: 'AuthRetryableFetchError' }; await assert.rejects(getActiveUser(client), /temporarily/); checks++;
  error = null; accessError = {}; await assert.rejects(getActiveUser(client), /temporarily/); checks++;
  accessError = null; user = null; check(await getActiveUser(client) === null, 'Explicitly ended session stays ended');
  process.env.BARNDAKSA_MAINTENANCE_SECRET = 'isolated-session-test-secret';
  const tokens = load('lib/platform/maintenance-token.ts');
  const context = { adminUserId: 'admin', cafeId: 'brand', expiresAt: policy.PERSISTENT_SESSION_EXPIRES_AT };
  const signed = tokens.encodeSession(context);
  check(tokens.decodeSession(signed).expiresAt > Date.now() + 365 * 86400000, 'Maintenance has no short deadline');
  check(tokens.decodeSession(signed + 'x') === null, 'Tampered signature denied');
  check(tokens.decodeSession(tokens.encodeSession({ ...context, expiresAt: Date.now() - 1 })) === null, 'Expired legacy credentials never revived');

  const { NextRequest } = require('next/server');
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon';
  user = { id: 'admin' }; active = true;
  const middleware = load('lib/supabase/middleware.ts', {
    '@supabase/ssr': { createServerClient: (_url, _key, options) => ({
      ...client,
      auth: { getUser: async () => {
        options.cookies.setAll([{ name: 'sb-test-auth-token', value: 'renewed', options: { httpOnly: true } }], { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' });
        return client.auth.getUser();
      } },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'platform_admin' } }) }) }) }),
    }) },
  });
  const request = () => new NextRequest('https://example.test/dashboard', { headers: { cookie: `${tokens.maintenanceSessionCookieName}=${signed}` } });
  let response = await middleware.updateSession(request());
  check(response.cookies.get('sb-test-auth-token').value === 'renewed', 'Refresh token reaches browser');
  check(response.headers.get('pragma') === 'no-cache', 'SSR refresh headers preserved');
  check(response.cookies.get(tokens.maintenanceSessionCookieName).maxAge === policy.SESSION_COOKIE_SECONDS, 'Verified admin context renews');
  active = false; response = await middleware.updateSession(request());
  check(response.status === 307 && response.headers.get('location').includes('account_disabled'), 'Blocked user cannot access dashboard');
  check(response.cookies.get('sb-test-auth-token').value === 'renewed', 'Blocked redirect preserves refreshed cookies');
  check(!response.cookies.get(tokens.maintenanceSessionCookieName), 'Blocked admin context never renewed');
  response = await middleware.updateSession(new NextRequest('https://example.test/api/auth/session'));
  check(response.status === 403, 'Blocked session API denied');
  active = true; error = { status: 503 }; response = await middleware.updateSession(request());
  check(response.status === 200 && !response.headers.get('location'), 'Temporary outage does not redirect to login');
  check(!response.cookies.get(tokens.maintenanceSessionCookieName), 'Outage never renews privileged context');
  error = null;
  const route = load('app/api/auth/session/route.ts', { '@/lib/supabase/server': { createClient: async () => client } });
  check((await route.GET()).status === 200, 'Heartbeat active');
  active = false; check((await route.GET()).status === 403, 'Heartbeat blocked');
  active = true; accessError = {}; check((await route.GET()).status === 503, 'Heartbeat outage does not claim logout');
  accessError = null; user = null; check((await route.GET()).status === 401, 'Heartbeat ended session');

  const authSource = fs.readFileSync('app/actions/auth.ts', 'utf8');
  const ast = ts.createSourceFile('auth.ts', authSource, ts.ScriptTarget.Latest, true);
  const action = ast.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'logoutAction');
  const compiled = ts.transpileModule(action.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls = [], exports = {};
  new Function('exports', 'createClient', 'cookies', 'clearMaintenanceSessionCookie', 'redirect', compiled)(exports,
    async () => ({ rpc: async (name, args) => calls.push([name, args.p_session_token]), auth: { signOut: async options => calls.push(['signout', options.scope]) } }),
    async () => ({ get: () => ({ value: 'local-token' }), delete: name => calls.push(['delete', name]) }),
    async () => calls.push(['maintenance-cleared']), url => { throw new Error(url); });
  await assert.rejects(exports.logoutAction(), /\/login/);
  assert.deepEqual(calls, [['logout_cafe_cashier', 'local-token'], ['delete', 'barndaksa_cashier_session'], ['maintenance-cleared'], ['signout', 'local']]); checks++;
  check(!/\.auth\.signOut\(\)/.test(authSource), 'No global signout for validation or password verification');
  check(!/\.auth\.signOut\(\)/.test(fs.readFileSync('lib/data/customers.ts', 'utf8')), 'Customer password verifier cannot end other sessions');
  const financeSource = fs.readFileSync('lib/data/brand-finance.ts', 'utf8');
  const financeAst = ts.createSourceFile('finance.ts', financeSource, ts.ScriptTarget.Latest, true);
  const contextAction = financeAst.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'getBrandFinanceContext');
  const financeExports = {}; let financeCalls = 0;
  const financeClient = { ...client, rpc: async name => name === 'current_account_active'
    ? client.rpc(name) : (financeCalls++, { data: { id: 'brand' }, error: null }) };
  new Function('exports', 'createClient', 'getActiveUser', 'z', 'throwIfFinanceUnavailable', ts.transpileModule(contextAction.getText(financeAst), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(financeExports, async () => financeClient, getActiveUser, require('zod').z, () => {});
  user = { id: 'staff' }; active = false;
  await assert.rejects(financeExports.getBrandFinanceContext('test-cafe')); checks++;
  check(financeCalls === 0, 'Blocked finance user never reaches tenant data');
  active = true; check((await financeExports.getBrandFinanceContext('test-cafe')).cafe.id === 'brand', 'Active finance account retained');
  accessError = {}; await assert.rejects(financeExports.getBrandFinanceContext('test-cafe'), /temporarily/); checks++;
  check(financeCalls === 1, 'Unavailable account check fails closed without logout');
  accessError = null;

  let effect, cleanup, heartbeatCalls = 0, responseCode = 200, redirected = null;
  const listeners = new Map(); let timerCleared = false;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  globalThis.window = { setInterval: (_fn, delay) => { assert.equal(delay, 300000); return 7; }, clearInterval: id => { timerCleared = id === 7; },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
    location: { replace: url => { redirected = url; } } };
  globalThis.fetch = async (_url, options) => { heartbeatCalls++; assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store'); return { status: responseCode }; };
  const keeper = load('components/auth/session-keeper.tsx', { react: { useEffect: fn => { effect = fn; } }, 'next/navigation': { usePathname: () => '/dashboard' } });
  keeper.SessionKeeper(); cleanup = effect();
  await new Promise(resolve => setImmediate(resolve));
  check(heartbeatCalls === 1 && listeners.size === 2, 'Heartbeat starts and listens for focus/reconnect');
  responseCode = 503; await listeners.get('focus')(); check(redirected === null, 'Service outage preserves current screen');
  responseCode = 401; await listeners.get('online')(); check(redirected === null, 'Heartbeat does not discard credentials on an unconfirmed session');
  responseCode = 403; await listeners.get('focus')(); check(redirected?.includes('account_disabled'), 'Confirmed block prevents continued access');
  cleanup(); check(timerCleared && listeners.size === 0, 'Heartbeat unmount cleans interval and listeners');
  delete globalThis.window; globalThis.fetch = originalFetch;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else delete globalThis.navigator;
  console.log(`PASS ${checks} persistent account session checks`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
