const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), React = require('react');
const categoryId = '11111111-2222-4333-8444-555555555555';
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', 'alert', 'requestAnimationFrame', code)(name => name in mocks ? mocks[name] : name.endsWith('.css') ? { __esModule: true, default: {} } : require(name), exports, () => {}, fn => fn());
  return exports;
}
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : String(tree ?? '');
function harness(categories = []) {
  const slots = []; let cursor = 0, categoryCalls = 0, saved, fail = false;
  const props = { open: true, mode: 'add', editingProduct: null, productList: [], categories, onClose() {},
    async onCategoriesChange(next) { categoryCalls++; if (fail) return props.categories; props.categories = next.map(item => item.id.startsWith('cat_') ? { ...item, id: categoryId } : item); return props.categories; },
    async onSave(product) { saved = product; return true; },
  };
  const hooks = { ...React, useEffect() {}, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; }, useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; } };
  const module = load('components/dashboard/menu/product-modal.tsx', {
    react: hooks,
    '@/lib/menu/product-media': { imageKey: () => '', primaryMediaType: () => 'image', orderedProductMedia: () => [] },
    '@/components/cafe/product-image': { getProductImageSources: () => [], ProductImage() {}, ProductMediaDisplay() {} },
    '@/app/actions/upload': {}, '@/lib/cafe/image-asset-pipeline': {}, '@/lib/cafe/local-asset-store': { revokeObjectUrl() {} },
    '@/components/dashboard/ui/modal': { Modal() {} }, '@/lib/format': { formatSar: String },
    '@/lib/mock/menu': load('lib/mock/menu.ts'),
    '@/lib/mock/menu-categories': { getCategoryNameById: (items, id) => items.find(item => item.id === id)?.name ?? '' },
    '@/lib/platform/business-copy': { getBusinessCopy: () => ({ kind: 'cafe' }) },
    '@/lib/menu/download-product-image': {}, '@/lib/commerce/product-details': {},
    '@/components/dashboard/menu/gift-product-fields': {}, '@/components/dashboard/menu/butcher-product-fields': {},
    '@/lib/menu/butcher-products': load('lib/menu/butcher-products.ts'),
  });
  const render = () => { cursor = 0; const editor = module.MenuProductFormModal(props); return editor.type(editor.props); };
  const find = predicate => { const node = nodes(render()).find(predicate); assert(node, 'Expected form control'); return node; };
  return { render, find, props, fail: value => { fail = value; }, categoryCalls: () => categoryCalls, saved: () => saved,
    setName: value => find(node => node.type === 'input' && node.props.placeholder === 'مثال: لاتيه فانيلا').props.onChange({ target: { value } }),
    setCategory: value => find(node => node.props?.id === 'new-product-category').props.onChange({ target: { value } }),
    submit: () => find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }),
  };
}
async function main() {
  const empty = harness();
  assert.equal(empty.find(node => node.props?.id === 'product-category').props.value, '__new__');
  assert.equal(empty.find(node => node.props?.id === 'new-product-category').props.required, true);
  empty.setName('منتج اختبار'); empty.setCategory('لحوم طازجة');
  assert.equal(empty.categoryCalls(), 0, 'No category mutation before product save');
  await empty.submit();
  assert.equal(empty.categoryCalls(), 1); assert.equal(empty.saved().categoryId, categoryId); assert.equal(empty.saved().category, 'لحوم طازجة');

  const existing = { id: '99999999-2222-4333-8444-555555555555', name: 'قديم', sortOrder: 1 };
  const add = harness([existing]); add.setName('يبقى الاسم');
  assert.equal(nodes(add.render()).some(node => node.props?.id === 'new-product-category'), false);
  add.find(node => node.type === 'button' && text(node) === 'تصنيف جديد').props.onClick();
  add.setCategory('جديد');
  add.find(node => node.props?.id === 'product-category').props.onChange({ target: { value: existing.id } });
  assert.equal(nodes(add.render()).some(node => node.props?.id === 'new-product-category'), false);
  assert.equal(add.find(node => node.type === 'input' && node.props.value === 'يبقى الاسم').props.value, 'يبقى الاسم');
  add.find(node => node.type === 'button' && text(node) === 'تصنيف جديد').props.onClick();
  assert.equal(add.find(node => node.props?.id === 'new-product-category').props.value, 'جديد');
  add.fail(true); await add.submit(); assert.equal(add.saved(), undefined, 'Failed category save never saves an uncategorized product');
  add.fail(false); await add.submit(); assert.equal(add.saved().categoryId, categoryId);
  console.log('Inline product category: empty catalog, explicit creation, preserved draft, persisted association and failure/retry PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
