const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return {};
    if (name.startsWith('@/')) return {};
    return require(name);
  }, exports);
  return exports;
}
(async () => {
  const Sales = () => null, Management = () => null;
  const page = load('app/finance/[slug]/login/page.tsx', {
    'next/navigation': { notFound() { throw new Error('NOT_FOUND'); } },
    '@/components/finance/finance-login': { FinanceLogin: Management },
    '@/components/finance/sales-cashier-login': { SalesCashierLogin: Sales },
  }).default;
  const render = (slug, access) => page({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({ access }) });
  const sales = await render('test-cafe');
  assert.equal(sales.type, Sales); assert.equal(sales.props.slug, 'test-cafe');
  assert.equal((await render('test-cafe', 'management')).type, Management);
  assert.equal((await render('test-cafe', 'unknown')).type, Sales);
  await assert.rejects(render('../other'), /NOT_FOUND/);
  const { salesCashierBrandDestination: destination } = load('components/finance/sales-cashier-login.tsx', {});
  assert.equal(destination('test-cafe', { redirectTo: '/finance/test-cafe/pos' }), '/finance/test-cafe/pos');
  assert.equal(destination('test-cafe', { redirectTo: '/finance/another/pos' }), null);
  assert.equal(destination('test-cafe', { redirectTo: 'https://example.com' }), null);
  assert.equal(destination('test-cafe', { brands: [{ slug: 'another', name: 'Other' }, { slug: 'test-cafe', name: 'Target' }] }), '/finance/test-cafe/pos');
  assert.equal(destination('test-cafe', { brands: [{ slug: 'another', name: 'Other' }] }), null);
  assert.equal(destination('test-cafe', {}), null);
  console.log('PASS finance login entry: shared WhatsApp/password UI, management fallback, slug validation and authorized target-brand routing');
})().catch(error => { console.error(error); process.exitCode = 1; });
