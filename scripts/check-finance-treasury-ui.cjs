const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const path = require('node:path');

function load(file, mocks) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', compiled)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', mocks);
    }
    return require(name);
  }, exports);
  return exports;
}
function hooks() {
  const slots = []; let cursor = 0; let scheduled = [];
  const changed = (a, b) => !a || a.length !== b.length || b.some((value, index) => value !== a[index]);
  return {
    api: { ...React,
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
      useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
      useCallback(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
      useEffect(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) { const previous = slots[i]; slots[i] = { deps }; scheduled.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    },
    render(fn, props) { cursor = 0; const tree = fn(props); const effects = scheduled; scheduled = []; effects.forEach(effect => effect()); return tree; },
  };
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree);
const find = (tree, predicate) => { const value = nodes(tree).find(predicate); assert.ok(value, 'Expected control'); return value; };
const button = (tree, label) => find(tree, node => node.type === 'button' && text(node).trim() === label);
const input = (tree, name) => find(tree, node => ['input', 'select', 'textarea'].includes(node.type) && node.props.name === name);
const form = tree => find(tree, node => node.type === 'form' && node.props.className === 'form');
const settled = () => new Promise(resolve => setImmediate(resolve));
const account = (id, kind, balance = 0, extra = {}) => ({ id, kind, balance, name: id, code: id, active: true, linked_bank_id: kind === 'pos' ? 'bank' : null, opening_recorded_at: null, opening_amount: null, bank_name: '', iban: '', terminal_id: '', ...extra });
const fixture = () => ({ accounts: [account('cash', 'cash', 100), account('bank', 'bank', 200), account('pos', 'pos', 80), account('expense', 'expense'), account('revenue', 'revenue'), account('equity', 'equity')], audit: [], reconciliations: [], canCorrect: false });
function harness(options = {}) {
  const hook = hooks(); const saved = []; const corrections = []; const statements = []; const historyCalls = [];
  const state = { data: fixture(), nextError: null, refreshError: false, saveWait: null, ...options };
  const snapshot = { cafe: { slug: 'brand', id: 'brand', name: 'Brand' }, accounts: state.data.accounts, documents: [], shifts: [], canManage: true, ...options.snapshot };
  const props = { snapshot, slug: 'brand', onRefresh() {}, ...options.props };
  const actions = {
    fetchFinanceTreasuryAction: async () => state.refreshError ? { ok: false, message: 'تعذر تحديث الأرصدة' } : { ok: true, data: state.data },
    fetchFinanceTreasuryHistoryAction: async (id, kind, offset) => { historyCalls.push({ id, kind, offset }); return state.historyError ? { ok: false, message: 'تعذر تحميل السجل' } : { ok: true, data: state.history ?? { rows: [], total: 0 } }; },
    fetchFinanceAccountStatementAction: async (id, filters) => { statements.push({ id, filters }); return { ok: true, data: { opening: 0, debit: 100, credit: 0, closing: 100, total: 1, rows: [{ id: 'row', document_id: 'document', number: 7, kind: state.rowKind ?? 'receipt', actor_name: 'owner', note: 'Cash receipt', created_at: '2026-10-25T12:00:00Z', debit: 100, credit: 0, balance: 100, can_reverse: true }] } }; },
    executeFinanceTreasuryAction: async (...args) => { saved.push(args); if (state.saveWait) await state.saveWait; if (state.nextError) return { ok: false, message: state.nextError }; return { ok: true, data: state.result ?? { id: 'saved-doc', number: 8 } }; },
    executeFinanceTreasuryCorrectionAction: async (...args) => { corrections.push(args); return { ok: true, data: { id: 'correction', number: 9 } }; },
  };
  function Modal() {} function FinanceTreasuryAttachments() {} function Numeric() {}
  const { FinanceTreasury } = load('components/finance/finance-treasury.tsx', {
    react: hook.api, '@/app/actions/finance-treasury': actions,
    '@/components/dashboard/ui/modal': { Modal }, './finance-treasury-attachments': { FinanceTreasuryAttachments },
    './finance-receipt-dialog': { FinanceReceiptDialog: function FinanceReceiptDialog() {} },
    './finance-cash-handovers': { FinanceCashHandovers: function FinanceCashHandovers() {} },
    './finance-ui': { Numeric, financeDate: value => value, downloadFinanceCsv() {} },
  });
  return { state, props, saved, corrections, statements, historyCalls, render: () => hook.render(FinanceTreasury, props) };
}
async function ready(h) { h.render(); await settled(); return h.render(); }
async function main() {
  let checks = 0;
  {
    const data = fixture(); data.accounts.push(account('cash2', 'cash'), account('drawer', 'cash', 0, { is_cashier_drawer: true }));
    const h = harness({ data }); let tree = await ready(h);
    assert.equal(button(tree, 'إضافة خزينة').props.disabled, false, 'Cashier drawer does not consume ordinary treasury quota');
    assert.match(text(tree), /صندوق الكاشير/);
    assert.ok(!nodes(tree).some(node => node.type === 'button' && node.props['aria-label'] === 'تعيين drawer كرئيسي'));
    button(tree, 'سند قبض').props.onClick(); tree = h.render(); button(tree, 'استيراد تسليم وردية').props.onClick(); tree = h.render();
    assert.equal(find(tree, node => node.type?.name === 'Modal').props.open, false, 'Ordinary receipt modal hidden while handover picker owns focus');
    const picker = find(tree, node => node.type?.name === 'FinanceCashHandovers'); assert.equal(picker.props.receiptOnly, true);
    picker.props.onReceived({ id: 'receipt', number: 1 }); tree = h.render(); assert.ok(!nodes(tree).some(node => node.type === 'form'));
    assert.equal(h.saved.length, 0, 'Dedicated handover receipt never posts generic income voucher'); checks++;
  }
  for (const [label, kind] of [['إضافة خزينة', 'cash'], ['إضافة حساب بنكي', 'bank']]) {
    const h = harness(); let tree = await ready(h);
    button(tree, label).props.onClick(); tree = h.render();
    input(tree, 'name').props.onChange({ target: { value: 'New treasury account' } }); tree = h.render();
    input(tree, 'openingAmount').props.onChange({ target: { value: '1000' } }); tree = h.render();
    input(tree, 'note').props.onChange({ target: { value: 'Opening balance' } }); tree = h.render();
    await form(tree).props.onSubmit({ preventDefault() {} });
    const [operation, payload] = h.saved[0];
    assert.equal(operation, 'account_save'); assert.equal(payload.kind, kind);
    assert.equal(payload.openingAmount, 1000);
    assert.ok(!('linkedBankId' in payload), 'Cash and bank creation must not send a POS bank link');
    checks++;
  }
  {
    const h = harness(); let tree = h.render();
    assert.equal(button(tree, 'سند قبض').props.disabled, true, 'No writes before authoritative accounts load');
    await settled(); tree = h.render(); assert.equal(button(tree, 'سند قبض').props.disabled, false); checks++;
  }
  {
    const data = fixture(); data.accounts.push(account('cash2', 'cash'), account('cash3', 'cash'), account('old', 'cash', 0, { active: false }));
    const h = harness({ data }); let tree = await ready(h);
    assert.equal(button(tree, 'إضافة خزينة').props.disabled, true, 'Three active safes include default');
    assert.ok(!text(tree).includes('old'));
    find(tree, node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
    tree = h.render(); assert.match(text(tree), /old/); checks++;
  }
  {
    const h = harness({ props: { initialAccountId: 'cash', detailOnly: true } }); const tree = h.render();
    assert.ok(!text(tree).includes('الخزينة الرئيسية'));
    assert.equal(find(tree, node => node.type?.name === 'Modal').props.title, 'cash', 'Detail heading renders instantly from local snapshot');
    await settled(); assert.equal(h.statements[0].id, 'cash'); checks++;
  }
  {
    const h = harness({ props: { initialAccountId: 'revenue', detailOnly: true } }); const tree = await ready(h);
    assert.ok(!nodes(tree).some(node => node.props?.role === 'tab' && text(node) === 'إعدادات الحساب'));
    assert.ok(!nodes(tree).some(node => node.type === 'button' && text(node) === 'قبض')); checks++;
  }
  {
    const data = fixture(); data.accounts[0].opening_recorded_at = '2026-10-25T12:00:00Z'; data.accounts[0].opening_amount = 100;
    const h = harness({ data, props: { initialAccountId: 'cash' } }); let tree = await ready(h);
    button(tree, 'إعدادات الحساب').props.onClick(); tree = h.render();
    assert.equal(button(tree, 'تم التسجيل').props.disabled, true);
    assert.equal(button(tree, 'أرشفة الحساب').props.disabled, true, 'Nonzero account cannot archive');
    assert.ok(!nodes(tree).some(node => node.type === 'button' && text(node) === 'تصفير الرصيد'), 'Owner lacks admin reset'); checks++;
  }
  {
    const h = harness(); let tree = await ready(h);
    button(tree, 'إضافة نقطة شبكة').props.onClick(); tree = h.render();
    assert.equal(input(tree, 'linkedBankId').props.value, 'bank');
    input(tree, 'name').props.onChange({ target: { value: 'Terminal two' } }); tree = h.render();
    await form(tree).props.onSubmit({ preventDefault() {} });
    assert.equal(h.saved[0][0], 'account_save'); assert.equal(h.saved[0][1].openingAmount, 0); assert.equal(h.saved[0][1].linkedBankId, 'bank'); assert.ok(!('accountId' in h.saved[0][1])); checks++;
  }
  {
    const h = harness({ nextError: 'تعذر حفظ السند' }); let tree = await ready(h);
    button(tree, 'سند قبض').props.onClick(); tree = h.render();
    input(tree, 'amount').props.onChange({ target: { value: '25.50' } }); tree = h.render();
    input(tree, 'category').props.onChange({ target: { value: 'other_income' } }); tree = h.render();
    input(tree, 'note').props.onChange({ target: { value: 'Other receipt' } }); tree = h.render();
    await form(tree).props.onSubmit({ preventDefault() {} }); tree = h.render(); assert.match(text(tree), /تعذر حفظ السند/);
    h.state.nextError = null;
    await form(tree).props.onSubmit({ preventDefault() {} }); tree = h.render();
    assert.equal(h.saved[0][2], h.saved[1][2], 'Ambiguous retry preserves request identity'); assert.equal(h.saved[1][1].amount, 25.5);
    assert.equal(find(tree, node => node.type?.name === 'FinanceTreasuryAttachments').props.documentId, 'saved-doc', 'Attachments target committed document'); checks++;
  }
  {
    let resolve; const h = harness({ saveWait: new Promise(done => { resolve = done; }) }); let tree = await ready(h);
    button(tree, 'سند صرف').props.onClick(); tree = h.render();
    const a = form(tree).props.onSubmit({ preventDefault() {} }); const b = form(tree).props.onSubmit({ preventDefault() {} });
    resolve(); await Promise.all([a,b]); assert.equal(h.saved.length, 1, 'Synchronous busy guard prevents concurrent duplicate posting'); checks++;
  }
  {
    const h = harness(); let tree = await ready(h); button(tree, 'سند قبض').props.onClick(); tree = h.render();
    h.state.refreshError = true; await form(tree).props.onSubmit({ preventDefault() {} }); tree = h.render();
    assert.match(text(tree), /تم حفظ العملية لكن تعذر تحديث الأرصدة/);
    assert.equal(button(tree, 'سند قبض').props.disabled, true, 'Saved but stale balances block new posting'); checks++;
  }
  {
    const h = harness({ props: { initialAccountId: 'pos' } }); let tree = await ready(h);
    button(tree, 'تسجيل تسوية بنكية').props.onClick(); tree = h.render();
    input(tree, 'amount').props.onChange({ target: { value: '80' } }); tree = h.render();
    input(tree, 'feesDeducted').props.onChange({ target: { value: '81' } }); tree = h.render();
    assert.equal(button(tree, 'حفظ العملية').props.disabled, true, 'Fee cannot exceed gross settlement');
    input(tree, 'feesDeducted').props.onChange({ target: { value: '2' } }); tree = h.render();
    assert.equal(button(tree, 'حفظ العملية').props.disabled, false);
    await form(tree).props.onSubmit({ preventDefault() {} }); assert.equal(h.saved[0][0], 'pos_settle'); assert.equal(h.saved[0][1].amount, 80); assert.equal(h.saved[0][1].feesDeducted, 2); assert.equal(h.saved[0][1].feeTreatment, 'net'); assert.ok(!('toAccountId' in h.saved[0][1]), 'Bank comes from trusted terminal mapping'); checks++;
  }
  {
    const h = harness({ props: { initialAccountId: 'cash' } }); let tree = await ready(h);
    button(tree, 'مطابقة الرصيد').props.onClick(); tree = h.render(); button(tree, 'مطابقة جديدة').props.onClick(); tree = h.render();
    input(tree, 'countedAmount').props.onChange({ target: { value: '98' } }); tree = h.render();
    await form(tree).props.onSubmit({ preventDefault() {} }); assert.equal(h.saved[0][0], 'reconcile'); assert.equal(h.saved[0][1].expectedBalance, 100); assert.equal(h.saved[0][1].countedAmount, 98); assert.equal(h.corrections.length, 0, 'Count is recorded without automatically adjusting ledger'); checks++;
  }
  {
    const data = fixture(); data.canCorrect = true;
    const h = harness({ data, props: { initialAccountId: 'cash' } }); let tree = await ready(h);
    button(tree, 'إعدادات الحساب').props.onClick(); tree = h.render(); button(tree, 'تصفير الرصيد').props.onClick(); tree = h.render();
    assert.equal(find(form(tree), node => node.type === 'input' && node.props.type === 'checkbox').props.required, true);
    input(tree, 'note').props.onChange({ target: { value: 'Reviewed correction' } }); tree = h.render();
    await form(tree).props.onSubmit({ preventDefault() {} }); assert.equal(h.corrections[0][0], 'reset'); assert.equal(h.corrections[0][1].accountId, 'cash'); assert.equal(h.corrections[0][1].expectedBalance, 100); assert.equal(h.corrections[0][1].reason, 'Reviewed correction'); assert.equal(h.saved.length, 0); checks++;
  }
  {
    const h = harness({ props: { initialAccountId: 'cash' } }); let tree = await ready(h); await settled(); tree = h.render();
    button(tree, 'سند قبض #7').props.onClick(); tree = h.render();
    assert.equal(find(tree, node => node.type?.name === 'FinanceTreasuryAttachments').props.documentId, 'document');
    assert.ok(!nodes(tree).some(node => node.type === 'button' && text(node) === 'عكس المستند'), 'Owner cannot reverse a posted document'); checks++;
  }
  {
    const h = harness({ rowKind: 'sale', props: { initialAccountId: 'cash' }, snapshot: { documents: [{ id: 'document', number: 7, kind: 'sale' }] } }); let tree = await ready(h); await settled(); tree = h.render();
    button(tree, 'مبيعات #7').props.onClick(); tree = h.render();
    assert.ok(!nodes(tree).some(node => node.type?.name === 'FinanceTreasuryAttachments'), 'Sales documents must not request treasury-only storage');
    button(tree, 'عرض الفاتورة وطباعتها').props.onClick(); tree = h.render();
    assert.equal(find(tree, node => node.type?.name === 'FinanceReceiptDialog').props.document.id, 'document');
    assert.equal(find(tree, node => node.type?.name === 'Modal').props.open, false, 'Only one active modal focus trap'); checks++;
  }
  {
    const data = fixture(); data.canCorrect = true;
    const h = harness({ data, props: { initialAccountId: 'cash' } }); let tree = await ready(h); await settled(); tree = h.render();
    button(tree, 'سند قبض #7').props.onClick(); tree = h.render(); button(tree, 'عكس المستند').props.onClick(); tree = h.render();
    input(tree, 'note').props.onChange({ target: { value: 'Duplicate external receipt reviewed' } }); tree = h.render();
    await form(tree).props.onSubmit({ preventDefault() {} });
    assert.equal(h.corrections[0][0], 'reverse'); assert.equal(h.corrections[0][1].documentId, 'document'); assert.ok(!('accountId' in h.corrections[0][1])); checks++;
  }
  {
    const h = harness({ result: { id: 'cash-new', document_id: 'zero-opening', number: 10 } }); let tree = await ready(h);
    button(tree, 'إضافة خزينة').props.onClick(); tree = h.render();
    await form(tree).props.onSubmit({ preventDefault() {} }); tree = h.render();
    assert.equal(find(tree, node => node.type?.name === 'FinanceTreasuryAttachments').props.documentId, 'zero-opening', 'Zero opening documents remain reachable even without journal lines'); checks++;
  }
  {
    const history = { rows: Array.from({ length: 100 }, (_, index) => ({ id: `audit-${index}`, operation: 'opening', note: 'Historical record', account_id: 'cash', created_at: '2026-10-01T12:00:00Z', actor_name: 'owner' })), total: 101 };
    const h = harness({ history, props: { initialAccountId: 'cash' } }); let tree = await ready(h);
    button(tree, 'سجل الإجراءات').props.onClick(); h.render(); await settled(); tree = h.render();
    assert.deepEqual(h.historyCalls[0], { id: 'cash', kind: 'audit', offset: 0 }); assert.match(text(tree), /Historical record/);
    button(tree, 'التالي').props.onClick(); h.render(); await settled(); tree = h.render(); assert.equal(h.historyCalls.at(-1).offset, 100); checks++;
  }
  {
    const h = harness({ historyError: true, props: { initialAccountId: 'cash' } }); let tree = await ready(h);
    button(tree, 'مطابقة الرصيد').props.onClick(); h.render(); await settled(); tree = h.render(); assert.match(text(tree), /تعذر تحميل السجل/);
    h.state.historyError = false; button(tree, 'إعادة المحاولة').props.onClick(); h.render(); await settled(); tree = h.render();
    assert.match(text(tree), /لم تسجل مطابقة/); assert.equal(h.historyCalls.length, 2); checks++;
  }
  {
    const data = fixture(); data.accounts[0].code = 'T-77d2f64a9c6c448a8161e8f92727a4df';
    const h = harness({ data, props: { initialAccountId: 'cash' } }); let tree = await ready(h);
    button(tree, 'إعدادات الحساب').props.onClick(); tree = h.render();
    assert.ok(!text(tree).includes('T-77d'));
    assert.match(text(tree), /حوّل الرصيد المتبقي/);
    assert.equal(button(tree, 'أرشفة الحساب').props.disabled, true); checks++;
  }
  {
    const h = harness(); let tree = await ready(h);
    button(tree, 'سند صرف').props.onClick(); tree = h.render();
    for (const [name, value] of [['category','operating_expense'],['subcategory','rent'],['costCenter','Branch One'],['amount','15'],['note','Monthly rent']]) {
      input(tree, name).props.onChange({ target: { value } }); tree = h.render();
    }
    const files = [new File(['invoice'], 'receipt.pdf', { type: 'application/pdf' })];
    find(tree, node => node.type?.name === 'TreasuryDraftFiles').props.onChange(files); tree = h.render();
    assert.equal(nodes(tree).some(node => node.type?.name === 'FinanceTreasuryAttachments'), false, 'No upload before document commit');
    h.state.nextError = 'Temporary failure'; await form(tree).props.onSubmit({ preventDefault() {} }); tree = h.render();
    assert.deepEqual(find(tree, node => node.type?.name === 'TreasuryDraftFiles').props.files, files);
    h.state.nextError = null; await form(tree).props.onSubmit({ preventDefault() {} }); tree = h.render();
    assert.equal(h.saved[0][2], h.saved[1][2], 'Voucher retry reuses command identity');
    assert.equal(h.saved[1][1].category, 'operating_expense'); assert.equal(h.saved[1][1].subcategory, 'rent');
    assert.equal(h.saved[1][1].costCenter, 'Branch One'); assert.ok(!('counterAccountId' in h.saved[1][1]));
    const upload = find(tree, node => node.type?.name === 'FinanceTreasuryAttachments');
    assert.deepEqual(upload.props.initialFiles, files); assert.equal(upload.props.documentId, 'saved-doc'); checks++;
  }
  {
    const h = harness(); let tree = await ready(h); button(tree, 'إضافة نقطة شبكة').props.onClick(); tree = h.render();
    for (const [name, value] of [['transactionFeePercent','1'],['monthlySubscription','50'],['monthlyDueDay','28'],['feeVatRate','15']]) {
      input(tree, name).props.onChange({ target: { value } }); tree = h.render();
    }
    await form(tree).props.onSubmit({ preventDefault() {} });
    assert.equal(h.saved[0][1].transactionFeePercent, 1); assert.equal(h.saved[0][1].monthlySubscription, 50); assert.equal(h.saved[0][1].monthlyDueDay, 28); assert.equal(h.saved[0][1].feeVatRate, 15); checks++;
  }
  {
    const data = fixture(); Object.assign(data.accounts[2], { monthly_due_day: 30, monthly_subscription: 125, fee_vat_rate: 15 });
    const h = harness({ data, props: { initialAccountId: 'pos' } }); let tree = await ready(h);
    button(tree, 'إعدادات الحساب').props.onClick(); tree = h.render(); button(tree, 'تعديل البيانات').props.onClick(); tree = h.render();
    const day = input(tree, 'monthlyDueDay'); assert.equal(day.props.value, '30'); assert.equal(day.props.required, true);
    assert.equal(nodes(day).filter(node => node.type === 'option').length, 32, 'All 31 monthly days plus placeholder');
    input(tree, 'name').props.onChange({ target: { value: 'Updated terminal name' } }); tree = h.render();
    await form(tree).props.onSubmit({ preventDefault() {} });
    assert.equal(h.saved[0][1].monthlyDueDay, 30, 'Unrelated terminal edits preserve chosen due day'); checks++;
  }
  {
    const data = fixture(); data.accounts[2].fees_due = 1.15;
    const h = harness({ data, props: { initialAccountId: 'pos' } }); let tree = await ready(h);
    button(tree, 'تسجيل تسوية بنكية').props.onClick(); tree = h.render();
    input(tree, 'feeTreatment').props.onChange({ target: { value: 'gross' } }); tree = h.render();
    await form(tree).props.onSubmit({ preventDefault() {} });
    assert.equal(h.saved[0][1].feeTreatment, 'gross'); assert.equal(h.saved[0][1].feesDeducted, 0); checks++;
  }
  {
    const data = fixture(); data.accounts[2].fees_due = 1.15;
    const h = harness({ data, props: { initialAccountId: 'pos' } }); let tree = await ready(h);
    button(tree, 'سداد رسوم الشبكة من البنك').props.onClick(); tree = h.render();
    await form(tree).props.onSubmit({ preventDefault() {} });
    assert.equal(h.saved[0][0], 'pos_fee_pay'); assert.equal(h.saved[0][1].amount, 1.15); assert.equal(h.saved[0][1].accountId, 'pos'); checks++;
  }
  {
    const data = fixture(); data.accounts[0].is_primary = true;
    data.accounts.push(account('cash-secondary', 'cash'), account('cash-archived', 'cash', 0, { active: false }));
    const h = harness({ data }); let tree = h.render();
    const primaryButton = value => find(value, node => node.type === 'button' && node.props['aria-label'] === 'تعيين cash-secondary كرئيسي');
    assert.equal(primaryButton(tree).props.disabled, true, 'Primary change waits for authoritative data');
    await settled(); tree = h.render();
    assert.equal(primaryButton(tree).props.disabled, false);
    assert.ok(!nodes(tree).some(node => node.type === 'button' && node.props['aria-label'] === 'تعيين cash كرئيسي'));
    assert.match(text(find(tree, node => node.type === 'button' && node.props['aria-label'] === 'عرض حساب cash')), /رئيسي/);
    for (const node of nodes(tree).filter(node => node.type === 'button')) assert.ok(!nodes(node.props.children).some(child => child.type === 'button'), 'Account actions must not nest interactive buttons');
    find(tree, node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } }); tree = h.render();
    assert.ok(!nodes(tree).some(node => node.type === 'button' && node.props['aria-label'] === 'تعيين cash-archived كرئيسي'));
    primaryButton(tree).props.onClick(); await settled(); tree = h.render();
    assert.equal(h.saved[0][0], 'account_primary'); assert.deepEqual(h.saved[0][1], { accountId: 'cash-secondary' });
    assert.equal(find(tree, node => node.type?.name === 'Modal').props.open, false, 'Set primary must not open the account dialog');
    assert.match(text(tree), /تم تعيين الحساب الرئيسي/); checks++;
  }
  {
    const data = fixture(); data.accounts.push(account('cash-preferred', 'cash', 0, { is_primary: true }), account('bank-preferred', 'bank', 0, { is_primary: true }));
    const h = harness({ data }); let tree = await ready(h);
    button(tree, 'سند قبض').props.onClick(); tree = h.render(); assert.equal(input(tree, 'accountId').props.value, 'cash-preferred');
    button(tree, 'إلغاء').props.onClick(); tree = h.render(); button(tree, 'تحويل داخلي').props.onClick(); tree = h.render();
    assert.equal(input(tree, 'accountId').props.value, 'cash-preferred'); assert.equal(input(tree, 'toAccountId').props.value, 'bank-preferred');
    button(tree, 'إلغاء').props.onClick(); tree = h.render(); button(tree, 'إضافة نقطة شبكة').props.onClick(); tree = h.render();
    assert.equal(input(tree, 'linkedBankId').props.value, 'bank-preferred');
    const editing = harness({ data, props: { initialAccountId: 'pos' } }); tree = await ready(editing);
    button(tree, 'إعدادات الحساب').props.onClick(); tree = editing.render(); button(tree, 'تعديل البيانات').props.onClick(); tree = editing.render();
    assert.equal(input(tree, 'linkedBankId').props.value, 'bank', 'Changing primary bank does not rewrite existing terminal links');
    const selected = harness({ data, props: { initialAccountId: 'cash' } }); tree = await ready(selected);
    button(tree, 'قبض').props.onClick(); tree = selected.render(); assert.equal(input(tree, 'accountId').props.value, 'cash', 'Explicit account context wins over defaults'); checks++;
  }
  {
    const data = fixture(); Object.assign(data.accounts[0], { is_primary: true, balance: 0 });
    const h = harness({ data, props: { initialAccountId: 'cash' } }); let tree = await ready(h);
    button(tree, 'إعدادات الحساب').props.onClick(); tree = h.render();
    assert.equal(button(tree, 'أرشفة الحساب').props.disabled, true);
    assert.match(text(tree), /عيّن حسابًا آخر رئيسيًا من نفس النوع/);
    const readonly = harness({ data, snapshot: { canManage: false } }); tree = await ready(readonly);
    assert.ok(nodes(tree).filter(node => node.type === 'button' && String(node.props['aria-label']).startsWith('تعيين ')).every(node => node.props.disabled), 'Read-only viewers cannot change primary'); checks++;
  }
  {
    let release; const saveWait = new Promise(resolve => { release = resolve; });
    const h = harness({ saveWait, nextError: 'Primary change failed' }); let tree = await ready(h);
    const target = value => find(value, node => node.type === 'button' && node.props['aria-label'] === 'تعيين bank كرئيسي');
    target(tree).props.onClick(); tree = h.render();
    assert.equal(target(tree).props.disabled, true, 'Primary change locks actions during request');
    release(); await settled(); tree = h.render(); assert.match(text(tree), /Primary change failed/);
    h.state.nextError = null; target(tree).props.onClick(); await settled(); h.render();
    assert.equal(h.saved[0][2], h.saved[1][2], 'Retry preserves primary command identity'); checks++;
  }
  const css = fs.readFileSync('components/finance/finance-treasury.module.css', 'utf8');
  assert.match(css, /prefers-reduced-motion/); assert.match(css, /focus-visible/); assert.match(css, /100dvh/); assert.match(css, /\.tableWrap \{ overflow: auto/); checks++;
  process.stdout.write(`Treasury UI: ${checks} behavior groups passed\n`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
