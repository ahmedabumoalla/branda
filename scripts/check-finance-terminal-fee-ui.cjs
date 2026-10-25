const assert = require('node:assert/strict');
const fs = require('node:fs');
const support = { exports: {} };
const helpers = fs.readFileSync('scripts/check-finance-treasury-ui.cjs', 'utf8').split('function harness(options')[0];
new Function('require', 'module', helpers + '\nmodule.exports={load,hooks,nodes,text,button,settled};')(require, support);
const { load, hooks, text, button, settled } = support.exports;
async function main() {
  const hook = hooks(); const calls = []; const exports = []; let failure = false;
  const { FinanceTerminalFees } = load('components/finance/finance-terminal-fees.tsx', {
    react: hook.api,
    '@/app/actions/finance-treasury': { fetchFinanceTerminalFeeHistoryAction: async (id, offset, slug) => {
      calls.push({ id, offset, slug });
      return failure ? { ok: false, message: 'Fee history unavailable' } : { ok: true, data: { total: 101, rows: Array.from({ length: offset ? 1 : 100 }, (_, index) => ({ id: String(index), terminal_name: 'Device One', bank_name: 'Bank One', kind: 'transaction', source_number: index + offset, fee: 1, tax: .15, total: 1.15, paid: 0, remaining: 1.15 })) } };
    } },
    './finance-ui': { Numeric: function Numeric() {}, financeDate: value => value, downloadFinanceCsv: (...args) => exports.push(args) },
  });
  const props = { account: { id: 'bank-one', kind: 'bank' }, charges: [], slug: 'brand' };
  const render = () => hook.render(FinanceTerminalFees, props);
  let tree = render(); assert.equal(button(tree, 'تصدير الصفحة').props.disabled, true);
  await settled(); tree = render();
  assert.deepEqual(calls[0], { id: 'bank-one', offset: 0, slug: 'brand' });
  assert.match(text(tree), /Device OneBank One/); assert.match(text(tree), /101/);
  button(tree, 'التالي').props.onClick(); render(); await settled(); tree = render();
  assert.equal(calls.at(-1).offset, 100); assert.equal(button(tree, 'التالي').props.disabled, true);
  button(tree, 'تصدير الصفحة').props.onClick(); assert.equal(exports[0][1].length, 2, 'Explicitly exports the selected page');
  failure = true; button(tree, 'السابق').props.onClick(); render(); await settled(); tree = render();
  assert.match(text(tree), /Fee history unavailable/); assert.equal(button(tree, 'تصدير الصفحة').props.disabled, true);
  failure = false; button(tree, 'إعادة المحاولة').props.onClick(); render(); await settled(); tree = render();
  assert.match(text(tree), /Device OneBank One/);
  console.log('Terminal fee UI: filtered bank history, pagination, export scope, loading and retry PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
