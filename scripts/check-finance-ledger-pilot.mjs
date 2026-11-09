import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const results = [];
function check(label, action) { action(); results.push(label); }
function load(file, imports = {}, extra = '') {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8') + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => name in imports ? imports[name] : require(name), module, module.exports);
  return module.exports;
}
const ledger = load('lib/finance/ledger.ts');
const csv = load('lib/finance/csv.ts');
check('decimal arithmetic remains exact for money', () => assert.equal(ledger.ledgerMinor('12.34'), 1234n));
for (const invalid of ['-1', '1.001', '1e3', 'NaN', 'Infinity']) check(`reject invalid money ${invalid}`, () => assert.equal(ledger.ledgerMinor(invalid), null));
const lines = [{ accountId: 'a', debit: '0.10', credit: '0', memo: '' }, { accountId: 'b', debit: '0', credit: '0.10', memo: '' }];
check('balanced fractional journal accepted', () => assert.equal(ledger.ledgerTotals(lines).valid, true));
check('unbalanced journal rejected', () => assert.equal(ledger.ledgerTotals([{ ...lines[0], debit: '0.11' }, lines[1]]).valid, false));
check('both sides positive on one line rejected', () => assert.equal(ledger.ledgerTotals([{ ...lines[0], credit: '0.10' }, lines[1]]).valid, false));
check('unconverted document preserves quantity and price', () => assert.deepEqual(ledger.documentCommercialLine({ quantity: 2, unit_price: 7 }), { converted: false, quantity: 2, price: 7, unit: '' }));
check('CSV formula guarded and numbers preserved', () => { assert.equal(csv.financeCsvCell('=SUM(A1)'), '"\'=SUM(A1)"'); assert.equal(csv.financeCsvCell(-2), '"-2"'); });
let cafe = { id: ledger.ledgerPilotCafeId, role: 'owner' }, calls = [], revalidations = [], rpcError = null;
const context = async () => ({ cafe, client: { rpc: async (name, args) => { calls.push({ name, args }); return { data: { id: '00000000-0000-4000-8000-000000000001' }, error: rpcError }; } } });
const actions = load('app/actions/finance-ledger.ts', { '@/lib/finance/ledger': ledger, '@/lib/data/brand-finance': { getBrandFinanceContext: context }, 'next/cache': { revalidatePath: value => revalidations.push(value) } });
const requestId = '00000000-0000-4000-8000-000000000002', documentId = '00000000-0000-4000-8000-000000000003';
const reads = [() => actions.fetchLedgerAction(0, 'test-cafe'), () => actions.fetchLedgerEventsAction(documentId, null, 'test-cafe'), () => actions.fetchLedgerDocumentAction(documentId, 'test-cafe'), () => actions.fetchLedgerReportAction('2026-01-01', '2026-11-09', null, 0, 'test-cafe')];
for (const [name, value] of [['other tenant', { id: documentId, role: 'owner' }], ['cashier', { id: ledger.ledgerPilotCafeId, role: 'cashier' }], ['warehouse', { id: ledger.ledgerPilotCafeId, role: 'warehouse' }]]) {
  cafe = value;
  for (const read of reads) { const before = calls.length; const result = await read(); check(`${name} denied at server read boundary`, () => { assert.equal(result.ok, false); assert.equal(calls.length, before); }); }
  const before = calls.length; const result = await actions.executeLedgerAction({ action: 'save', requestId, payload: {} }, 'test-cafe');
  check(`${name} denied before mutation RPC`, () => { assert.equal(result.ok, false); assert.equal(calls.length, before); });
}
cafe = { id: ledger.ledgerPilotCafeId, role: 'owner' };
for (const [role, action] of [['auditor', 'save'], ['manager', 'account_save'], ['accountant', 'period_close'], ['manager', 'period_reopen'], ['accountant', 'settings']]) {
  cafe = { id: ledger.ledgerPilotCafeId, role };
  const before = calls.length;
  const response = await actions.executeLedgerAction({ action, requestId, payload: { kind: 'expense' } }, 'test-cafe');
  check(`${role} cannot perform ${action} at server boundary`, () => { assert.equal(response.ok, false); assert.equal(calls.length, before); });
}
cafe = { id: ledger.ledgerPilotCafeId, role: 'auditor' };
const auditRead = await actions.fetchLedgerAction(0, 'test-cafe');
check('auditor retains read access', () => assert.equal(auditRead.ok, true));
cafe = { id: ledger.ledgerPilotCafeId, role: 'owner' };
for (const read of reads) { const result = await read(); check('pilot authorized read scopes tenant from server context', () => { assert.equal(result.ok, true); assert.equal(calls.at(-1).args.p_cafe_id, ledger.ledgerPilotCafeId); }); }
for (const kind of ['cash', 'bank', 'pos', 'inventory', 'receivable', 'payable', 'fixed_asset']) {
  const before = calls.length; const result = await actions.executeLedgerAction({ action: 'account_save', requestId, payload: { kind } }, 'test-cafe');
  check(`server rejects account type ${kind}`, () => { assert.equal(result.ok, false); assert.equal(calls.length, before); });
}
for (const kind of ledger.ledgerEditableAccountKinds) {
  const result = await actions.executeLedgerAction({ action: 'account_save', requestId, payload: { kind } }, 'test-cafe');
  check(`manual account ${kind} reaches scoped RPC`, () => { assert.equal(result.ok, true); assert.equal(calls.at(-1).args.p_cafe_id, ledger.ledgerPilotCafeId); });
}
const command = { action: 'save', requestId, payload: { title: 'test' } };
await actions.executeLedgerAction(command, 'test-cafe'); await actions.executeLedgerAction(command, 'test-cafe');
check('retry retains same idempotency identifier', () => assert.deepEqual(calls.slice(-2).map(x => x.args.p_request_id), [requestId, requestId]));
check('successful mutation revalidates scoped ledger', () => assert.equal(revalidations.at(-1), '/finance/test-cafe/ledger'));
rpcError = { code: '40001', message: 'conflict' };
const conflict = await actions.executeLedgerAction(command, 'test-cafe');
check('conflict asks user to review refreshed data', () => { assert.equal(conflict.ok, false); assert.match(conflict.message, /تغيرت البيانات/); });
rpcError = { code: 'XX000', message: 'secret internal server detail' };
const internal = await actions.fetchLedgerAction(0, 'test-cafe');
check('internal error details not exposed', () => { assert.equal(internal.ok, false); assert.doesNotMatch(internal.message, /secret/); });
rpcError = null;
const invalid = await actions.executeLedgerAction({ ...command, requestId: 'invalid' }, 'test-cafe');
check('request identity validated', () => assert.equal(invalid.ok, false));
// Exercise the real component retry state with controlled hooks, without a browser or production data.
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
let slots = [], cursor = 0, effects = [], documentResponse = { ok: false, message: 'تعذر تحميل المستند التجريبي' };
let ledgerResponse = { ok: false, message: 'تعذر قراءة دفتر الاختبار' }, mutationResponse = { ok: false, message: 'تعذر حفظ قيد الاختبار' };
const mutationCalls = [], startTransition = callback => callback();
const hooks = { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
  useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
  useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, j) => v !== old[j])) { slots[i] = deps; effects.push(fn); } },
  useCallback(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, j) => v !== old.deps[j])) slots[i] = { fn, deps }; return slots[i].fn; },
  useTransition() { return [false, startTransition]; },
  useId() { return 'test-field'; } };
const ui = load('components/finance/ledger-workspace.tsx', { react: hooks, 'next/link': ({ children, ...props }) => React.createElement('a', props, children),
  '@/lib/finance/ledger': ledger, '@/lib/finance/csv': csv,
  '@/app/actions/finance-ledger': { fetchLedgerDocumentAction: async () => documentResponse,
    fetchLedgerAction: async () => ledgerResponse,
    executeLedgerAction: async command => { mutationCalls.push(command); return mutationResponse; } },
  './ledger.module.css': new Proxy({}, { get: (_, key) => String(key) }) }, '\nexport { DocumentDetails, AccountEditor, JournalForm };');
const renderDetails = () => { cursor = 0; return ui.DocumentDetails({ id: documentId, close() {}, open() {} }); };
const flush = async () => { const queue = effects; effects = []; for (const effect of queue) effect(); await new Promise(setImmediate); };
function findButton(node, text) { if (!node || typeof node !== 'object') return null; if (node.type === 'button' && node.props.children === text) return node; for (const child of React.Children.toArray(node.props?.children)) { const match = findButton(child, text); if (match) return match; } return null; }
renderDetails(); await flush();
let tree = renderDetails();
check('document failure is announced accessibly', () => assert.match(renderToStaticMarkup(tree), /role="alert"/));
documentResponse = { ok: true, data: { document: { number: 9, created_at: '2026-11-09T10:00:00Z', total: 0, reference_id: null, note: 'اختبار' }, lines: [], journal: [], partyName: null, warehouseName: null } };
findButton(tree, 'إعادة المحاولة').props.onClick(); renderDetails(); await flush(); tree = renderDetails();
check('document retry success clears old error and shows data', () => { const html = renderToStaticMarkup(tree); assert.doesNotMatch(html, /role="alert"/); assert.match(html, /المستند المالي 9/); });
slots = []; cursor = 0; effects = [];
const accounts = ['cash', 'bank', 'inventory', 'expense', 'revenue', 'equity'].map(kind => ({ id: kind, kind, name: kind, code: kind, active: true, frozen: false, is_group: false, revision: 1 }));
const form = ui.JournalForm({ draft: null, accounts, dimensions: [], pending: false, onDirty() {}, save() {}, cancel() {} });
check('journal form only offers permitted manual accounts', () => { const html = renderToStaticMarkup(form); for (const kind of ['cash', 'bank', 'inventory']) assert.doesNotMatch(html, new RegExp(`option value="${kind}"`)); for (const kind of ledger.ledgerEditableAccountKinds) assert.match(html, new RegExp(`option value="${kind}"`)); });
slots = []; cursor = 0;
const editor = ui.AccountEditor({ accounts, accountId: 'bank', select() {}, leave: () => true, pending: false, canWrite: true, onDirty() {}, save() {} });
check('treasury account has no ledger edit form', () => assert.doesNotMatch(renderToStaticMarkup(editor), /<form/));
function findComponent(node, component) { if (!node || typeof node !== 'object') return null; if (node.type === component) return node; for (const child of React.Children.toArray(node.props?.children)) { const match = findComponent(child, component); if (match) return match; } return null; }
slots = []; cursor = 0; effects = [];
const priorWindow = globalThis.window;
globalThis.window = { addEventListener() {}, removeEventListener() {}, confirm: () => true };
const finance = { role: 'owner', cafe: { name: 'اختبار', id: ledger.ledgerPilotCafeId }, userId: documentId };
const renderWorkspace = () => { cursor = 0; return ui.LedgerWorkspace({ finance, slug: 'test-cafe' }); };
const snapshot = { accounts, drafts: [], periods: [], hasMore: false, settings: { maker_checker: true, revision: 1 } };
renderWorkspace(); await flush(); tree = renderWorkspace();
check('workspace initial read failure is shown', () => assert.match(renderToStaticMarkup(tree), /تعذر قراءة دفتر الاختبار/));
ledgerResponse = { ok: true, data: snapshot };
findButton(tree, 'تحديث البيانات').props.onClick(); await flush(); tree = renderWorkspace();
check('successful workspace refresh clears only the old read error', () => { const html = renderToStaticMarkup(tree); assert.doesNotMatch(html, /role="alert"/); assert.match(html, /لا توجد قيود/); });
findButton(tree, 'قيد جديد +').props.onClick(); tree = renderWorkspace();
findComponent(tree, ui.JournalForm).props.save({ title: 'اختبار', lines }); await flush(); tree = renderWorkspace();
check('failed mutation retains its retry control', () => { assert.match(renderToStaticMarkup(tree), /تعذر حفظ قيد الاختبار/); assert.ok(findButton(tree, 'إعادة المحاولة بنفس الطلب')); });
ledgerResponse = { ok: false, message: 'تعذر تحديث بيانات الاختبار' };
findButton(tree, 'تحديث البيانات').props.onClick(); await flush(); tree = renderWorkspace();
check('read and mutation failures coexist without losing retry', () => { const html = renderToStaticMarkup(tree); assert.match(html, /تعذر حفظ قيد الاختبار/); assert.match(html, /تعذر تحديث بيانات الاختبار/); assert.ok(findButton(tree, 'إعادة المحاولة بنفس الطلب')); });
ledgerResponse = { ok: true, data: snapshot };
findButton(tree, 'تحديث البيانات').props.onClick(); await flush(); tree = renderWorkspace();
check('read recovery preserves unresolved mutation error and retry', () => { const html = renderToStaticMarkup(tree); assert.doesNotMatch(html, /تعذر تحديث بيانات الاختبار/); assert.match(html, /تعذر حفظ قيد الاختبار/); assert.ok(findButton(tree, 'إعادة المحاولة بنفس الطلب')); });
mutationResponse = { ok: true, data: { id: documentId } };
findButton(tree, 'إعادة المحاولة بنفس الطلب').props.onClick(); await flush(); tree = renderWorkspace();
check('mutation retry preserves request identity and success clears its error', () => { assert.equal(mutationCalls.length, 2); assert.equal(mutationCalls[0].requestId, mutationCalls[1].requestId); const html = renderToStaticMarkup(tree); assert.doesNotMatch(html, /role="alert"/); assert.match(html, /تم حفظ الإجراء/); });
if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow;
const files = ['app/actions/finance-ledger.ts', 'lib/finance/ledger.ts', 'lib/finance/csv.ts', 'components/finance/ledger-workspace.tsx', 'components/finance/ledger.module.css', 'components/finance/finance-workspace.tsx', 'app/dashboard/finance/ledger/page.tsx', 'app/finance/[slug]/ledger/page.tsx', 'scripts/check-finance-ledger-pilot.mjs'];
const evidence = { executedAt: new Date().toISOString(), runtime: process.version, checks: results.length, results, sourceHashes: Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')])), scope: 'Pure money/CSV behavior, transpiled actual Server Actions with controlled context/RPC mocks, actual component markup/retry with controlled hooks; not real Auth, browser, or PostgreSQL proof' };
fs.mkdirSync('output/finance-ledger-pilot', { recursive: true });
fs.writeFileSync('output/finance-ledger-pilot/ui-actions.json', JSON.stringify(evidence, null, 2));
console.log(`PASS ${results.length} ledger pilot server-action and money checks`);
