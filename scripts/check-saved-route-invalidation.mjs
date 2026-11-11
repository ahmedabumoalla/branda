import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const source = path => fs.readFileSync(path, 'utf8');
function exportedFunction(path, name) {
  const text = source(path), ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `${path}:${name}`);
  return compile(declaration.getText(ast));
}
function evaluate(text, bindings, exports = {}) {
  new Function(...Object.keys(bindings), 'exports', text)(...Object.values(bindings), exports);
  return exports;
}
const actionResult = evaluate(compile(source('lib/platform/action-result.ts')), {}).actionResult;
let checks = 0;

// The helper invalidates owner views and only the requested team's route tree.
const paths = [];
const helper = evaluate(compile(source('lib/performance/finance-route-invalidation.ts')), {
  require: name => name === 'server-only' ? {} : name === 'next/cache' ? { revalidatePath: (...args) => paths.push(args) } : assert.fail(name),
});
helper.invalidateFinanceViews('brand-a');
assert.deepEqual(paths, [['/dashboard/finance', 'layout'], ['/finance/brand-a', 'layout']]);
paths.length = 0; helper.invalidateFinanceViews();
assert.deepEqual(paths, [['/dashboard/finance', 'layout']]);
checks += 2;

// Execute actual action bodies with asynchronous persistence boundaries. Reads and
// denied/failed writes must never evict routes; invalidation occurs after success.
const delegates = [
  ['finance-cash-differences', 'settleFinanceCashDifferenceAction', 'settleFinanceCashDifference', [{ requestId: 'same-id' }, 'brand-a']],
  ['finance-cash-handovers', 'receiveFinanceShiftCashAction', 'receiveFinanceShiftCash', [{ requestId: 'same-id' }, 'brand-a']],
  ['finance-shift-monitor', 'superviseFinanceShiftAction', 'superviseFinanceShift', [{ requestId: 'same-id' }, 'brand-a']],
  ['finance-treasury', 'executeFinanceTreasuryAction', 'executeFinanceTreasury', ['save', { amount: 50 }, 'same-id', 'brand-a']],
  ['finance-treasury', 'executeFinanceTreasuryCorrectionAction', 'executeFinanceTreasuryCorrection', ['save', { amount: 50 }, 'same-id', 'brand-a']],
];
for (const [file, name, delegate, args] of delegates) {
  const events = []; let finish, reject;
  const action = evaluate(exportedFunction(`app/actions/${file}.ts`, name), {
    actionResult, invalidateFinanceViews: slug => events.push(['invalidate', slug]),
    [delegate]: (...received) => { events.push(['write', received]); return new Promise((resolve, fail) => { finish = resolve; reject = fail; }); },
  })[name];
  const pending = action(...args);
  assert.deepEqual(events, [['write', args]], `${name}: no invalidation before persistence`);
  const saved = { id: 'saved', revision: 4 }; finish(saved);
  assert.deepEqual(await pending, { ok: true, data: saved });
  assert.deepEqual(events, [['write', args], ['invalidate', 'brand-a']]);
  events.length = 0;
  const failed = action(...args); reject(Error('permission denied'));
  assert.equal((await failed).ok, false);
  assert.deepEqual(events, [['write', args]], `${name}: rejected mutation retains cache`);
  checks += 3;
}

// Exercise actual action error/permission ordering around mocked schema and RPC
// boundaries; these checks do not replace input-validation or database tests.
const schema = { safeParse: value => ({ success: true, data: value }) };
for (const [file, name, schemaName, args, extra] of [
  ['finance-payment-management', 'manageInvoicePaymentAction', 'paymentManagementSchema', [{ action: 'edit', revision: 3 }, 'brand-a'], {}],
  ['finance-invoice-management', 'updateInvoiceManagementAction', 'change', [{ action: 'delivery', ids: ['saved'] }, 'brand-a'], {}],
  ['finance-invoice-drafts', 'saveInvoiceDraftAction', null, [{ id: 'draft', revision: 2, payload: {} }, 'brand-a'], {}],
  ['finance-journal-detail', 'saveJournalDescriptionsAction', 'descriptionsSchema', [{ id: 'journal', revision: 2 }, 'brand-a'], {}],
  ['finance-invoice-settings', 'saveFinanceInvoiceSettings', null, ['brand-a', { vat: true }, 2], { state: value => value }],
  ['finance-quotes', 'saveQuoteAction', null, [{ id: 'quote', revision: 1, payload: {} }, 'brand-a'], { quoteRecord: value => value, failure: error => { throw error; } }],
  ['finance-quotes', 'convertQuoteAction', null, [{ id: 'quote', revision: 1 }, 'brand-a'], { failure: error => { throw error; } }],
]) {
  const events = []; let allowed = true, rpcError = null;
  // Input validators are isolated here: these tests target post-write cache behavior.
  const chain = new Proxy(() => chain, { get: (_target, key) => key === 'safeParse' ? schema.safeParse : () => chain });
  const context = async () => ({ cafe: { id: 'brand-id', role: 'owner' }, client: { rpc: async (rpc, values) => {
    events.push(['write', rpc, values.p_cafe_id]); return { data: { id: 'saved', revision: 4 }, error: rpcError };
  } } });
  const action = evaluate(exportedFunction(`app/actions/${file}.ts`, name), {
    actionResult, context, getBrandFinanceContext: context, canFinance: () => allowed,
    invalidateFinanceViews: slug => events.push(['invalidate', slug]),
    z: chain, invoiceDraftSchema: chain, invoiceSettingsSchema: chain, quotePayloadSchema: chain,
    ...(schemaName ? { [schemaName]: schema } : {}), ...extra,
  })[name];
  assert.equal((await action(...args)).ok, true, name);
  assert.equal(events[0][0], 'write', name);
  assert.deepEqual(events.at(-1), ['invalidate', 'brand-a']);
  events.length = 0; rpcError = { code: '42501', message: 'forbidden' };
  assert.equal((await action(...args)).ok, false, name);
  assert.ok(events.every(event => event[0] !== 'invalidate'), `${name}: failed RPC`);
  if (source(`app/actions/${file}.ts`).includes('canFinance(cafe.role,')) {
    events.length = 0; rpcError = null; allowed = false;
    assert.equal((await action(...args)).ok, false, name);
    assert.equal(events.length, 0, `${name}: permission denial`);
  }
  checks += 3;
}

// Direct owner/administrator writes keep original values/guards and invalidate only
// after authorization and successful persistence, including plain void actions.
for (const [file, name, delegate, gate, args, expected] of [
  ['loyalty-cards', 'saveLoyaltyCardProgramAction', 'saveOwnerLoyaltyProgram', 'assertOwnerLoyaltyEnabled', [{}], '/dashboard/loyalty'],
  ['loyalty-cards', 'createLoyaltyCashierAction', 'createOwnerCashier', 'assertOwnerCashierEnabled', [{}], '/dashboard/cashier'],
  ['loyalty-cards', 'updateCashierPermissionsAction', 'updateOwnerCashierPermissions', 'assertOwnerCashierEnabled', [{}], '/dashboard/cashier'],
  ['loyalty-cards', 'setLoyaltyCashierStatusAction', 'setOwnerCashierStatus', 'assertOwnerCashierEnabled', ['cashier-a', false], '/dashboard/cashier'],
  ['loyalty-experience', 'saveLoyaltyExperienceAction', 'saveOwnerLoyaltyExperience', null, [{}], '/dashboard/loyalty'],
  ['branches', 'deleteBranchAction', 'softDeleteBranch', 'requireStorefrontEnabled', ['branch-a'], '/dashboard/branches'],
  ['admin', 'updateCafeStatusAction', 'updateCafeStatus', null, ['brand-a', false], '/admin/cafes'],
]) {
  const events = []; let failure = false;
  const bindings = { revalidatePath: (...values) => events.push(['invalidate', ...values]),
    [delegate]: async (...values) => { events.push(['write', ...values]); if (failure) throw Error('failed'); return { id: 'saved' }; },
    ...(gate ? { [gate]: () => events.push(['gate']) } : {}),
  };
  const action = evaluate(exportedFunction(`app/actions/${file}.ts`, name), bindings)[name];
  await action(...args);
  assert.ok(events.some(event => event[0] === 'invalidate' && event[1] === expected), name);
  assert.ok(events.findIndex(event => event[0] === 'write') < events.findIndex(event => event[0] === 'invalidate'));
  failure = true; events.length = 0;
  await assert.rejects(action(...args), /failed/);
  assert.ok(events.every(event => event[0] !== 'invalidate'));
  checks += 2;
}
console.log(`PASS ${checks} saved-route invalidation checks: delayed success, unchanged request IDs/results, failed writes and authorization gates; no live writes`);
