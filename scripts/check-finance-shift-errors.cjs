const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { z } = require('zod');
let failure, calls = 0;
const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'cashier' } } }) },
  rpc: async (name) => {
    if (name === 'brand_finance_context') return { data: { id: 'tenant', role: 'cashier' }, error: null };
    assert.equal(name, 'brand_finance_execute'); calls++;
    return { data: { id: 'saved-shift' }, error: failure };
  },
};
const mocks = {
  'server-only': {}, zod: { z },
  'next/server': { after: () => {} },
  './finance-shift-alerts': { dispatchShiftAlerts: async () => {} },
  './finance-pos-customer-messages': { dispatchFinancePosCustomerMessages: async () => {} },
  '@/lib/finance/pos-customer-server': { prepareFinancePosCustomerPayload: () => { throw Error('No sale in shift test'); } },
  '@/lib/supabase/server': { createClient: async () => client },
  '@/lib/data/cafes': { requireOwnerCafeContext: async () => { throw Error('Cashier must not require dashboard access'); } },
  '@/lib/menu/standalone-menu': { isOwnedMenuAsset: () => false },
};
const exportsForTest = {};
const compiled = ts.transpileModule(fs.readFileSync('lib/data/brand-finance.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('require', 'exports', compiled)(name => {
  assert(name in mocks, name); return mocks[name];
}, exportsForTest);
const command = { operation: 'shift_open', requestId: '00000000-0000-4000-8000-000000000001', payload: { accountId: 'drawer', openingCash: 0 } };
async function main() {
  for (const [constraint, message] of [
    ['bf_one_live_drawer', /الصندوق مرتبط بوردية/],
    ['bf_one_live_shift', /لديك وردية مفتوحة/],
  ]) {
    failure = { code: '23505', message: `duplicate key value violates unique constraint "${constraint}"` };
    await assert.rejects(() => exportsForTest.executeBrandFinanceCommand(command, 'test-cafe'), message);
  }
  failure = { code: '23505', message: 'duplicate key value violates unique constraint "private_other_constraint"' };
  await assert.rejects(() => exportsForTest.executeBrandFinanceCommand(command, 'test-cafe'), error => error.message.includes('لم تحفظ العملية') && !error.message.includes('private_other_constraint'));
  failure = { code: '42501', message: 'private permission details' };
  await assert.rejects(() => exportsForTest.executeBrandFinanceCommand(command, 'test-cafe'), /لا تملك صلاحية/);
  failure = { code: 'P0001', message: 'رصيد بداية الوردية يجب أن يطابق رصيد الخزينة سجل الرصيد الافتتاحي أولا' };
  await assert.rejects(() => exportsForTest.executeBrandFinanceCommand(command, 'test-cafe'), /رصيد بداية الوردية/);
  failure = null;
  assert.deepEqual(await exportsForTest.executeBrandFinanceCommand(command, 'test-cafe'), { id: 'saved-shift' });
  assert.equal(calls, 6, 'Each operation runs once; an error cannot trigger a financial retry or force-close a shift');
  console.log('PASS 6 shift result/error cases and single-attempt/no-dashboard boundary');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
