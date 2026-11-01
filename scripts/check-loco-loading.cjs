const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const { PathParamsContext } = require('next/dist/shared/lib/hooks-client-context.shared-runtime');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', output)(name => {
    if (name.endsWith('.module.css')) return new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
    if (name.startsWith('@/')) { const base = name.slice(2); return load(fs.existsSync(base + '.tsx') ? base + '.tsx' : base + '.ts'); }
    return require(name);
  }, exports);
  return exports;
}
const Loading = load('app/menu/[slug]/loading.tsx').default;
const render = url => renderToStaticMarkup(React.createElement(PathParamsContext.Provider, { value: { slug: new URL(url, 'https://barndaksa.com').pathname.split('/').at(-1) } }, React.createElement(Loading)));
for (const branch of ['loco-murooj', 'loco-drive-thru']) {
  const html = render(`/menu/brand-9a8c97305195?branch=${branch}`);
  assert(html.includes('/loco/logo.svg'));
  assert(html.includes('كل مزاج وله لوكو'));
  assert(html.includes('role="progressbar"'));
  assert(html.includes('aria-busy="true"'));
  assert(html.includes('role="status"'));
  assert(!html.includes('aria-valuenow'));
  assert(!html.includes('نحضّر لك المنيو'));
}
const together = render('/menu/brand-871ec6e243c0');
for (const expected of ['/together/logo.webp', 'botanical-opening', 'نفتح لك عالم الغراس والهدايا', 'role="progressbar"', 'role="status"', 'aria-busy="true"']) assert(together.includes(expected));
assert(!together.includes('المنيو'));
assert(!together.includes('aria-valuenow'));
const togetherCss = fs.readFileSync('components/store/together-store-loading.module.css', 'utf8');
const compiled = require('lightningcss').transform({ filename: 'together-store-loading.module.css', code: Buffer.from(togetherCss), cssModules: true });
for (const [, key] of fs.readFileSync('components/store/together-store-loading.tsx', 'utf8').matchAll(/styles\.(\w+)/g)) assert(compiled.exports[key]);
assert.match(togetherCss, /prefers-reduced-motion:\s*reduce/);
assert.doesNotMatch(fs.readFileSync('components/store/together-store-loading.tsx', 'utf8'), /setTimeout|setInterval|aria-valuenow/);
for (const slug of ['brand-10620d3a586c', 'another-cafe']) {
  const html = render(`/menu/${slug}`);
  assert(html.includes('نحضّر لك المنيو'));
  assert(!html.includes('/loco/logo.svg'));
}
const css = fs.readFileSync('components/menu/loco-menu-loading.module.css', 'utf8');
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /\.logo,\s*\.sweep\s*\{\s*animation:\s*none;/);
assert.match(css, /animation:\s*loco-mark-enter[^;]+both;/);
assert.doesNotMatch(css.match(/animation:\s*loco-mark-enter[^;]+;/)[0], /infinite/);
assert.doesNotMatch(fs.readFileSync('components/menu/loco-menu-loading.tsx', 'utf8'), /setTimeout|setInterval|aria-valuenow/);
assert(fs.existsSync('public/loco/logo.svg'));
console.log('PASS Together store loading without menu copy, original logo/CSS/accessibility, both LOCO branches and other menus preserved, reduced motion and no artificial wait');
