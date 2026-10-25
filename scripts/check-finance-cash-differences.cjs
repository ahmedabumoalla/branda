const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', compiled)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'zod') return require('zod');
    throw new Error(`Unexpected dependency: ${name}`);
  }, exports);
  return exports;
}
async function main() {
  const cafeId = '11111111-1111-4111-8111-111111111111';
  const employeeId = '22222222-2222-4222-8222-222222222222';
  const varianceId = '33333333-3333-4333-8333-333333333333';
  const requestId = '44444444-4444-4444-8444-444444444444';
  let role = 'owner', error = null, calls = [], contexts = [], data = { rows: [{ id: varianceId }], total: 51, canSettle: true, employees: [{ id: employeeId, name: 'Employee' }] };
  const dal = load('lib/data/finance-cash-differences.ts', {
    'server-only': {}, './brand-finance': { getBrandFinanceContext: async slug => {
      contexts.push(slug);
      return { cafe: { id: cafeId, role }, client: { rpc: async (name, args) => { calls.push({ name, args }); return { data, error }; } } };
    } },
  });
  const actionResult = load('lib/platform/action-result.ts', {});
  const actions = load('app/actions/finance-cash-differences.ts', { '@/lib/platform/action-result': actionResult, '@/lib/data/finance-cash-differences': dal });
  const input = { varianceId, requestId, resolution: 'charge_employee', employeeId, note: ' Count confirmed ' };
  for (const invalid of [-1, 1.5, '0', NaN, 10000001]) await assert.rejects(() => dal.getFinanceCashDifferences(invalid));
  assert.equal(contexts.length, 0, 'Malformed pages rejected before database access');
  role = 'cashier';
  await assert.rejects(() => dal.getFinanceCashDifferences());
  await assert.rejects(() => dal.settleFinanceCashDifference(input));
  assert.equal(calls.length, 0, 'Cashiers cannot read owner discrepancy records or settle');
  role = 'manager';
  const managerPage = await dal.getFinanceCashDifferences(0, 'brand');
  assert.equal(managerPage.canSettle, false);
  assert.equal(managerPage.hasMore, true);
  assert.deepEqual(managerPage.employees, [{ user_id: employeeId, name: 'Employee' }]);
  assert.deepEqual(calls.at(-1), { name: 'brand_finance_cash_differences', args: { p_cafe_id: cafeId, p_offset: 0, p_limit: 50 } });
  const beforeManager = calls.length;
  await assert.rejects(() => dal.settleFinanceCashDifference(input));
  assert.equal(calls.length, beforeManager, 'Managers denied before settlement RPC');
  role = 'owner'; data.canSettle = false;
  assert.equal((await dal.getFinanceCashDifferences()).canSettle, false, 'Maintenance owner-shaped role cannot enable settlement');
  data.canSettle = true;
  assert.equal((await dal.getFinanceCashDifferences(50)).hasMore, false);
  const beforeInvalid = calls.length;
  for (const value of [
    { ...input, varianceId: 'not-id' }, { ...input, requestId: 'not-id' },
    { ...input, employeeId: undefined }, { ...input, employeeId: 'not-id' },
    { ...input, resolution: 'delete' }, { ...input, note: ' ' },
    { ...input, note: 'x'.repeat(1001) }, { ...input, p_cafe_id: 'spoof' },
  ]) await assert.rejects(() => dal.settleFinanceCashDifference(value));
  assert.equal(calls.length, beforeInvalid, 'Invalid input and spoofed tenant never reach RPC');
  data = { id: varianceId, document_id: requestId, number: 99 };
  await dal.settleFinanceCashDifference(input, 'brand');
  const call = calls.at(-1);
  assert.equal(call.name, 'brand_finance_settle_cash_difference');
  assert.deepEqual(call.args, { p_cafe_id: cafeId, p_variance_id: varianceId, p_resolution: 'charge_employee', p_employee_id: employeeId, p_note: 'Count confirmed', p_request_id: requestId });
  data.duplicate = true;
  assert.equal((await dal.settleFinanceCashDifference(input, 'brand')).duplicate, true);
  assert.deepEqual(calls.at(-1).args, call.args, 'Retry uses unchanged caller request identity');
  await dal.settleFinanceCashDifference({ ...input, resolution: 'waive' });
  assert.equal(calls.at(-1).args.p_employee_id, null, 'Waiver cannot accidentally assign a hidden old employee selection');
  error = { code: '42501', message: 'foreign tenant or not actual owner' };
  const denied = await actions.settleFinanceCashDifferenceAction(input, 'other-brand');
  assert.equal(denied.ok, false); assert.ok(!denied.message.includes('foreign'));
  assert.equal(contexts.at(-1), 'other-brand', 'Slug resolved through the signed-in context, never caller tenant id');
  error = { code: 'XX000', message: 'sensitive SQL statement' };
  const failed = await actions.settleFinanceCashDifferenceAction(input);
  assert.equal(failed.ok, false); assert.ok(!failed.message.includes('sensitive'));
  const listError = await actions.fetchFinanceCashDifferencesAction(0);
  assert.equal(listError.ok, false); assert.ok(!listError.message.includes('sensitive'));
  error = null; data = null;
  await assert.rejects(() => dal.getFinanceCashDifferences());
  await assert.rejects(() => dal.settleFinanceCashDifference(input));
  console.log('PASS cash-difference DAL/actions: owner vs manager/cashier, authoritative owner flag, tenant context, input constraints, pagination, employee mapping, waiver, idempotent retry and private database failures');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
