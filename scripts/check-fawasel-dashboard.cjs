const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const inputs = new Set();
function load(file) {
  inputs.add(file);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx');
    }
    return require(name);
  }, exports);
  return exports;
}
let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks++; }
const { FAWASEL_SLUG } = load('lib/commerce/fawasel-profile.ts');
const { integratedSystemGroups, integratedSystemGroupsForBrand, systemItemHref } = load('components/dashboard/integrated-system-navigation.ts');
const context = { cafeSlug: FAWASEL_SLUG, enabledFeatures: ['menu', 'loyalty', 'finance'], isSalon: false, isGifts: false };
const groups = integratedSystemGroupsForBrand(FAWASEL_SLUG);
for (const id of ['sales', 'store', 'customers', 'inventory', 'purchases', 'finance', 'accounting', 'branches', 'templates', 'settings']) check(groups.some(group => group.id === id), `Preserve ${id}`);
for (const id of ['manufacturing', 'contracting', 'rentals', 'employees', 'attendance', 'payroll', 'time']) check(!groups.some(group => group.id === id), `Hide unrelated ${id}`);
check(integratedSystemGroupsForBrand('another-brand') === integratedSystemGroups, 'Other accounts retain exact original navigation');
const store = groups.find(group => group.id === 'store');
check(store.label === 'المتجر والمنتجات', 'Store label');
for (const route of ['/dashboard/menu', '/dashboard/orders', `/menu/${FAWASEL_SLUG}`]) check(store.items.some(item => systemItemHref(item, context) === route), `Commerce route ${route}`);
check(systemItemHref(store.items[0], { ...context, enabledFeatures: [] }) === null, 'Menu entitlement still enforced');
check(groups.find(group => group.id === 'settings').items.some(item => item.view === 'sales-settings'), 'Shipping settings remain reachable');
check(!groups.find(group => group.id === 'reports').items.some(item => /manufacturing|employees|rentals/.test(item.href ?? '')), 'Unrelated reports removed');
const { getBusinessCopy } = load('lib/platform/business-copy.ts');
check(getBusinessCopy('clothing_stores').kind === 'clothing', 'Clothing does not fall back to cafe copy');
check(getBusinessCopy('cafes_coffee').kind === 'cafe', 'Cafe copy preserved');
const { GiftProductFields } = load('components/dashboard/menu/gift-product-fields.tsx');
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
let changed;
const original = { options: [{ id: 'small-black', label: 'S / أسود', price: 89, available: true, stock: 4 }] };
const rendered = nodes(GiftProductFields({ value: original, onChange: next => { changed = next; }, service: false, fashion: true }));
rendered.find(node => node.type === 'input' && node.props.value === 89).props.onChange({ target: { value: '99' } });
check(changed.options[0].price === 99 && changed.options[0].id === 'small-black' && original.options[0].price === 89, 'Variant edit preserves stable id and original object');
rendered.find(node => node.type === 'input' && node.props.value === 4).props.onChange({ target: { value: '0' } });
check(changed.options[0].stock === 0, 'Explicit zero stock retained');
rendered.find(node => node.type === 'button' && node.props['aria-label'] === 'حذف الخيار 1').props.onClick();
check(changed.options.length === 0, 'Variant removal');
const report = { at: new Date().toISOString(), runtime: process.version, checks, passed: true, inputs: Object.fromEntries([...inputs].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])) };
fs.mkdirSync('output/fawasel-import-20261114', { recursive: true });
fs.writeFileSync('output/fawasel-import-20261114/dashboard-checks.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ checks, passed: true }));
