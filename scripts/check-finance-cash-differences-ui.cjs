const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
function hooks() {
  const slots = []; let cursor = 0, effects = [];
  return { api: { ...React,
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((value, index) => value !== slots[i].deps[index])) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  }, render(fn, props) { cursor = 0; const tree = fn(props); const scheduled = effects; effects = []; scheduled.forEach(fn => fn()); return tree; } };
}
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree);
const find = (tree, predicate) => { const found = nodes(tree).find(predicate); assert.ok(found, 'Expected UI control'); return found; };
const button = (tree, label) => find(tree, node => node.type === 'button' && text(node) === label);
const field = (tree, name) => find(tree, node => node.props?.name === name);
const tick = () => new Promise(resolve => setImmediate(resolve));
const employee = '11111111-1111-4111-8111-111111111111';
const row = { id: 'variance-uuid', shift_id: 'shift-uuid', shift_number: 42, phase: 'opening', occurred_at: '2026-10-25T10:05:37Z', drawer_id: 'cash', drawer_name: 'الصندوق', expected_cash: 100, counted_cash: 90, difference: -10, employee_id: 'current-uuid', employee_name: 'الحالي', previous_employee_id: 'previous-uuid', previous_employee_name: 'السابق', status: 'pending', resolution_employee_id: null, resolution_employee_name: null, settled_at: null, settlement_note: null, document_id: 'document-uuid', document_number: 123, resolution_document_id: null, notification_status: 'queued' };
function harness(options = {}) {
  const hook = hooks(), calls = [], saves = [];
  const state = { data: { rows: [row], total: 1, hasMore: false, employees: [{ user_id: employee, name: 'موظف مختار' }], canSettle: true }, error: null, saveError: null, wait: null, ...options };
  const props = { slug: 'brand', onSettled() { state.settled = (state.settled ?? 0) + 1; } };
  const mocks = {
    react: hook.api,
    '@/components/dashboard/ui/modal': { Modal: function Modal() {} },
    './finance-ui': { Numeric: function Numeric() {} },
    '@/app/actions/finance-cash-differences': {
      fetchFinanceCashDifferencesAction: async (...args) => { calls.push(args); return state.error ? { ok: false, message: state.error } : { ok: true, data: state.data }; },
      settleFinanceCashDifferenceAction: async (...args) => { saves.push(args); if (state.wait) await state.wait; return state.saveError ? { ok: false, message: state.saveError } : { ok: true, data: {} }; },
    },
  };
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync('components/finance/finance-cash-differences.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', compiled)(name => name in mocks ? mocks[name] : name.endsWith('.css') ? { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) } : require(name), exports);
  return { props, state, calls, saves, time: exports.cashDifferenceTime, render: () => hook.render(exports.FinanceCashDifferences, props) };
}
async function ready(h) { h.render(); await tick(); return h.render(); }
async function main() {
  let checks = 0;
  {
    const h = harness(); let tree = h.render(); assert.match(text(tree), /جارٍ تحميل/); tree = await ready(h);
    assert.deepEqual(h.calls[0], [0, 'brand']); assert.match(text(tree), /#42/); assert.match(text(tree), /#123/);
    assert.match(text(tree), /قُبل للإرسال عبر واتساب/); assert.match(text(tree), /قبول الإرسال لا يؤكد وصول الرسالة/);
    assert.match(h.time(row.occurred_at), /١٣:٠٥:٣٧/); assert.ok(!text(tree).includes('uuid'));
    assert.ok(!nodes(tree).some(node => node.type === 'button' && /تسليم/.test(text(node)))); checks++;
  }
  {
    const h = harness({ data: { rows: [row], total: 1, hasMore: false, employees: [], canSettle: false } }); const tree = await ready(h);
    assert.ok(!nodes(tree).some(node => node.type === 'button' && text(node) === 'معالجة الفرق')); assert.match(text(tree), /بانتظار قرار المالك/); checks++;
  }
  {
    const h = harness(); let tree = await ready(h); button(tree, 'معالجة الفرق').props.onClick(); tree = h.render();
    assert.equal(field(tree, 'resolution').props.value, ''); assert.equal(button(tree, 'تأكيد المعالجة').props.disabled, true);
    field(tree, 'resolution').props.onChange({ target: { value: 'charge_employee' } }); tree = h.render();
    assert.equal(field(tree, 'employeeId').props.value, '', 'Never assign blame to previous/current employee automatically');
    field(tree, 'note').props.onChange({ target: { value: '   ' } }); tree = h.render(); assert.equal(button(tree, 'تأكيد المعالجة').props.disabled, true);
    field(tree, 'employeeId').props.onChange({ target: { value: employee } }); tree = h.render();
    field(tree, 'note').props.onChange({ target: { value: '  Reviewed count  ' } }); tree = h.render();
    h.state.saveError = 'Temporary failure'; await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} }); tree = h.render();
    assert.match(text(tree), /Temporary failure/); assert.equal(field(tree, 'employeeId').props.value, employee); assert.equal(field(tree, 'note').props.value, '  Reviewed count  ');
    h.state.saveError = null; await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} }); h.render(); await tick();
    assert.equal(h.saves[0][0].requestId, h.saves[1][0].requestId); assert.equal(h.saves[1][0].employeeId, employee); assert.equal(h.saves[1][0].note, 'Reviewed count'); assert.equal(h.saves[1][0].resolution, 'charge_employee'); assert.equal(h.saves[1][1], 'brand'); assert.equal(h.state.settled, 1); checks++;
  }
  {
    let release; const wait = new Promise(resolve => { release = resolve; }); const h = harness({ wait }); let tree = await ready(h);
    button(tree, 'معالجة الفرق').props.onClick(); tree = h.render(); field(tree, 'resolution').props.onChange({ target: { value: 'charge_employee' } }); tree = h.render(); field(tree, 'employeeId').props.onChange({ target: { value: employee } }); tree = h.render();
    field(tree, 'resolution').props.onChange({ target: { value: 'waive' } }); tree = h.render(); assert.ok(!nodes(tree).some(node => node.props?.name === 'employeeId'));
    field(tree, 'note').props.onChange({ target: { value: 'Cash count reviewed without employee liability' } }); tree = h.render();
    const submit = find(tree, node => node.type === 'form').props.onSubmit; const promise = submit({ preventDefault() {} }); await submit({ preventDefault() {} }); tree = h.render();
    assert.equal(h.saves.length, 1, 'Synchronous double submit guarded'); assert.equal(button(tree, 'جارٍ تسجيل المعالجة').props.disabled, true);
    find(tree, node => node.type?.name === 'Modal').props.onClose(); tree = h.render(); assert.equal(find(tree, node => node.type?.name === 'Modal').props.open, true);
    release(); await promise; h.render(); assert.ok(!('employeeId' in h.saves[0][0])); assert.equal(h.saves[0][0].resolution, 'waive'); checks++;
  }
  {
    const statuses = ['pending', 'processing', 'queued', 'rejected', 'unknown', 'missing_owner'];
    const h = harness({ data: { rows: statuses.map((status, index) => ({ ...row, id: String(index), notification_status: status })), total: 100, hasMore: true, employees: [], canSettle: false } }); let tree = await ready(h);
    for (const label of ['بانتظار إرسال', 'جارٍ إرسال', 'قُبل للإرسال', 'رُفض إرسال', 'غير مؤكدة', 'رقم مالك العلامة غير متاح']) assert.ok(text(tree).includes(label));
    button(tree, 'التالي').props.onClick(); h.render(); await tick(); tree = h.render(); assert.equal(h.calls.at(-1)[0], 50);
    button(tree, 'السابق').props.onClick(); h.render(); await tick(); tree = h.render(); assert.equal(h.calls.at(-1)[0], 0);
    button(tree, 'تحديث السجل والإشعارات').props.onClick(); h.render(); await tick(); assert.equal(h.calls.length, 4, 'Refresh is explicit, no automatic status polling'); checks++;
  }
  {
    const h = harness({ error: 'Unavailable' }); let tree = await ready(h); assert.match(text(tree), /Unavailable/); h.state.error = null; button(tree, 'إعادة المحاولة').props.onClick(); h.render(); await tick(); tree = h.render();
    button(tree, 'معالجة الفرق').props.onClick(); tree = h.render(); h.props.slug = 'other-brand'; tree = h.render();
    assert.equal(find(tree, node => node.type?.name === 'Modal').props.open, false, 'Changing tenant hides old selection'); assert.ok(!text(tree).includes('#42'), 'Old tenant rows hidden while fetching'); checks++;
  }
  {
    const h = harness({ data: { rows: [{ ...row, status: 'waive', resolution_document_number: 124, settled_at: row.occurred_at, settlement_note: 'Approved after review' }], total: 1, hasMore: false, employees: [], canSettle: true } }); const tree = await ready(h);
    assert.match(text(tree), /#124/); assert.match(text(tree), /Approved after review/); assert.ok(!nodes(tree).some(node => node.type === 'button' && text(node) === 'معالجة الفرق')); checks++;
  }
  {
    const h = harness({ data: { rows: [{ ...row, difference: 10 }], total: 1, hasMore: false, employees: [{ user_id: employee, name: 'Employee' }], canSettle: true } }); h.props.slug = undefined;
    let tree = await ready(h); button(tree, 'معالجة الفرق').props.onClick(); tree = h.render();
    assert.equal(find(tree, node => node.type === 'option' && node.props.value === 'charge_employee').props.disabled, true);
    field(tree, 'resolution').props.onChange({ target: { value: 'charge_employee' } }); tree = h.render();
    field(tree, 'employeeId').props.onChange({ target: { value: employee } }); tree = h.render(); field(tree, 'note').props.onChange({ target: { value: 'Reviewed' } }); tree = h.render();
    await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} }); tree = h.render();
    assert.equal(h.saves.length, 0, 'Excess cannot be charged as employee debt'); assert.match(text(tree), /للعجز النقدي فقط/); checks++;
  }
  console.log(`PASS cash differences UI ${checks} groups: owner decisions, explicit employee, required reason, idempotent retries, pending lock, Riyadh seconds, truthful notifications, pagination, tenant stale guards`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
