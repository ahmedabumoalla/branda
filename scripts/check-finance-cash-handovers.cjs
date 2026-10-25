const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'zod') return require('zod');
    throw Error('Unexpected dependency ' + name);
  }, exports);
  return exports;
}
(async () => {
  const cafeId = '11111111-1111-4111-8111-111111111111', drawerId = '22222222-2222-4222-8222-222222222222';
  const handoverId = '33333333-3333-4333-8333-333333333333', requestId = '44444444-4444-4444-8444-444444444444';
  let role = 'cashier', error = null, calls = [], contexts = [];
  let data = { rows: [{ id: handoverId }], total: 51, canReceive: true, cashierDrawerId: drawerId, accountants: [{ user_id: cafeId, name: 'Accountant' }] };
  const dal = load('lib/data/finance-cash-handovers.ts', {
    'server-only': {}, './brand-finance': { getBrandFinanceContext: async slug => {
      contexts.push(slug);
      return { cafe: { id: cafeId, role }, client: { rpc: async (name, args) => { calls.push({ name, args }); return { data, error }; } } };
    } },
  });
  const actions = load('app/actions/finance-cash-handovers.ts', { '@/lib/platform/action-result': load('lib/platform/action-result.ts', {}), '@/lib/data/finance-cash-handovers': dal });
  const input = { handoverId, requestId, accountId: drawerId, note: ' Count confirmed ' };
  for (const offset of [-1, NaN, 0.1, '0', 10000001]) await assert.rejects(() => dal.getFinanceCashHandovers(offset));
  assert.equal(contexts.length, 0);
  const cashierPage = await dal.getFinanceCashHandovers(0, 'brand');
  assert.equal(cashierPage.canReceive, false); assert.equal(cashierPage.hasMore, true);
  assert.equal(cashierPage.cashierDrawerId, drawerId);
  assert.deepEqual(calls.at(-1), { name: 'brand_finance_cash_handovers', args: { p_cafe_id: cafeId, p_offset: 0, p_limit: 50 } });
  const before = calls.length;
  await assert.rejects(() => dal.receiveFinanceShiftCash(input));
  assert.equal(calls.length, before, 'Cashier receipt denied before RPC');
  role = 'manager';
  assert.equal((await dal.getFinanceCashHandovers(50)).canReceive, true);
  assert.equal((await dal.getFinanceCashHandovers(50)).hasMore, false);
  data.canReceive = false;
  assert.equal((await dal.getFinanceCashHandovers()).canReceive, false, 'Server flag never elevated');
  const invalidBefore = calls.length;
  for (const invalid of [{ ...input, amount: 999 }, { ...input, p_cafe_id: cafeId }, { ...input, handoverId: 'bad' }, { ...input, requestId: 'bad' }, { ...input, accountId: 'bad' }, { ...input, note: 'x'.repeat(1001) }]) await assert.rejects(() => dal.receiveFinanceShiftCash(invalid));
  assert.equal(calls.length, invalidBefore, 'Forged amount/tenant/invalid IDs never reach RPC');
  data = { id: handoverId, number: 77 };
  assert.equal((await dal.receiveFinanceShiftCash(input, 'brand')).number, 77);
  const call = calls.at(-1);
  assert.deepEqual(call, { name: 'brand_finance_receive_shift_cash', args: { p_cafe_id: cafeId, p_handover_id: handoverId, p_account_id: drawerId, p_note: 'Count confirmed', p_request_id: requestId } });
  data.duplicate = true; assert.equal((await dal.receiveFinanceShiftCash(input, 'brand')).duplicate, true);
  assert.deepEqual(calls.at(-1), call);
  role = 'owner'; await dal.receiveFinanceShiftCash({ ...input, note: '' });
  error = { code: '42501', message: 'private tenant SQL' };
  const denied = await actions.receiveFinanceShiftCashAction(input, 'other-brand');
  assert.equal(denied.ok, false); assert(!denied.message.includes('SQL')); assert.equal(contexts.at(-1), 'other-brand');
  error = { code: 'XX000', message: 'private internal SQL' };
  assert(!(await actions.receiveFinanceShiftCashAction(input)).message.includes('SQL'));
  assert.equal((await actions.fetchFinanceCashHandoversAction()).ok, false);
  error = null; data = null;
  await assert.rejects(() => dal.getFinanceCashHandovers()); await assert.rejects(() => dal.receiveFinanceShiftCash(input));
  console.log('PASS cash-handover DAL/actions: scoped read, no cashier receipts, owner/manager receipt, exact server amount, strict input, pagination, retry identity and private errors');
})().catch(error => { console.error(error); process.exitCode = 1; });
