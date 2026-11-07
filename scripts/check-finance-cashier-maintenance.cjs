const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => name in mocks ? mocks[name] : name === 'server-only' ? {} : require(name), exports);
  return exports;
}
async function main() {
  let session = null, authorized = true, rpcError = false;
  const calls = [];
  const { getFinanceCashierMaintenance } = load('lib/data/finance-cashier-maintenance.ts', {
    '@/lib/platform/maintenance': { getCurrentMaintenanceSession: async () => session },
    '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async (name, args) => {
      calls.push({ name, args });
      return { error: rpcError ? { code: '42501' } : null, data: args.p_operation === 'authorize' ? { authorized } : { id: 'cashier' } };
    } }) },
  });
  assert.equal(await getFinanceCashierMaintenance('brand'), null);
  session = { cafeId: 'other', adminUserId: 'admin', expiresAt: Date.now() + 60_000 };
  assert.equal(await getFinanceCashierMaintenance('brand'), null);
  session.cafeId = 'brand'; session.expiresAt = Date.now() - 1;
  assert.equal(await getFinanceCashierMaintenance('brand'), null);
  assert.equal(calls.length, 0, 'Missing, expired and other-tenant cookies never call the service client');
  session.expiresAt = Date.now() + 60_000;
  authorized = false; assert.equal(await getFinanceCashierMaintenance('brand'), null);
  authorized = true; rpcError = true; assert.equal(await getFinanceCashierMaintenance('brand'), null);
  rpcError = false;
  const context = await getFinanceCashierMaintenance('brand'); assert(context);
  await context.execute('update', { userId: 'cashier', role: 'cashier', active: false, name: 'Cashier' });
  assert.equal(calls.at(-1).name, 'brand_finance_maintenance_cashier');
  assert.equal(calls.at(-1).args.p_cafe_id, 'brand');
  assert.equal(calls.at(-1).args.p_actor_id, 'admin');
  assert.equal(calls.at(-1).args.p_maintenance_expires_at, new Date(session.expiresAt).toISOString());
  assert.equal(calls.at(-1).args.p_operation, 'update');
  console.log('PASS cashier maintenance context: absent/expired/wrong tenant/audit denial and server-bound mutation identity');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
