const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('app/actions/maintenance.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(authError) {
  const calls = [];
  const stubs = {
    zod: require('zod'),
    '@/lib/auth/session-policy': { PERSISTENT_SESSION_EXPIRES_AT: Date.UTC(9999, 11, 31) },
    '@/lib/data/cafes': { requirePlatformAdmin: async () => { if (authError) throw authError; return { id: 'admin' }; } },
    '@/lib/supabase/admin': { createAdminClient() {
      calls.push('admin');
      return { from: () => ({ select: () => ({ is: async () => ({ data: [{ id: 'cafe', slug: 'test', name: 'Test' }] }) }), insert: async () => { calls.push('audit'); return {}; } }) };
    } },
    '@/lib/platform/maintenance': {
      maintenanceSessionMaxAgeSeconds: 1800,
      makeMaintenanceAccountNumber: () => 'BR-TEST',
      setMaintenanceSessionCookie: async () => calls.push('cookie'),
    },
  };
  const exports = {};
  new Function('require', 'exports', compiled)(name => { assert(Object.hasOwn(stubs, name)); return stubs[name]; }, exports);
  return { action: exports.enterMaintenanceModeAction, calls };
}
(async () => {
  for (const [message, redirectTo] of [['Unauthorized', '/login'], ['Forbidden: platform admin required', null]]) {
    const h = load(new Error(message));
    const result = await h.action('BR-TEST');
    assert.equal(result.ok, false);
    assert.equal(result.redirectTo, redirectTo);
    assert.deepEqual(h.calls, [], 'Denied requests must not read privileged data, issue cookies or audit a session');
  }
  const failure = new Error('provider unavailable');
  const unexpected = load(failure);
  await assert.rejects(unexpected.action('BR-TEST'), error => error === failure);
  assert.deepEqual(unexpected.calls, []);
  const valid = load();
  assert.equal((await valid.action('BR-TEST')).redirectTo, '/dashboard');
  assert.deepEqual(valid.calls, ['admin', 'cookie', 'admin', 'audit']);
  console.log('PASS maintenance auth: expired session, forbidden role, unexpected failure and valid admin');
})().catch(error => { console.error(error); process.exitCode = 1; });
