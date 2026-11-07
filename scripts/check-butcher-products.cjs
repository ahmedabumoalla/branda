const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let checks = 0;
function check(test, message) { assert.ok(test, message); checks++; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function load(file, mocks = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', compiled)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), exports);
  return exports;
}
const helpers = load('lib/menu/butcher-products.ts');
const commerce = load('lib/commerce/product-details.ts');
const details = { meatType: 'sheep', origin: null, units: [{ id: 'kg', label: 'كيلو', price: 65 }, { id: 'g', label: 'جرام', price: 0.065 }, { id: 'half', label: 'نصف ذبيحة', price: 450 }] };
const parse = value => helpers.butcherProductDetailsSchema.safeParse(value);
equal(parse(details).data, details, 'Gram prices retain all digits');
for (const meatType of ['calf', 'sheep', 'camel', 'goat']) check(parse({ ...details, meatType }).success, 'Every supported meat type accepted');
equal(parse({ ...details, origin: '  ' }).data.origin, null, 'Blank origin is optional');
equal(parse({ ...details, origin: ' سواكن ' }).data.origin, 'سواكن', 'Origin is trimmed');
for (const price of [0, -1, NaN, Infinity, 1_000_001, 0.0000001]) check(!parse({ ...details, units: [{ ...details.units[0], price }] }).success, 'Reject invalid price');
check(parse({ ...details, units: [{ ...details.units[0], price: 1_000_000 }] }).success, 'Maximum price accepted');
check(parse({ ...details, units: [{ ...details.units[1], price: 0.000001 }] }).success, 'Minimum precision accepted');
check(!parse({ ...details, units: [] }).success, 'At least one unit');
check(!parse({ ...details, meatType: 'unknown' }).success, 'Unknown meat type rejected');
check(!parse({ ...details, units: [details.units[0], details.units[0]] }).success, 'Duplicate units rejected');
check(!parse({ ...details, units: [{ id: 'kg', label: 'جرام', price: 1 }] }).success, 'Standard unit label cannot misrepresent its identity');
const custom = { id: 'custom_11111111-2222-4333-8444-555555555555', label: 'عبوة', price: 80 };
check(parse({ ...details, units: [custom] }).success, 'Named custom units accepted');
check(!parse({ ...details, units: [{ ...custom, label: ' ' }] }).success, 'Custom unit label required');
check(!parse({ ...details, units: [{ ...custom, id: 'custom_untrusted' }] }).success, 'Custom unit ID validated');
check(!parse({ ...details, units: [custom, { ...custom, id: 'custom_66666666-2222-4333-8444-555555555555' }] }).success, 'Duplicate labels rejected');
equal(helpers.parseButcherProductDraft(helpers.createButcherProductDraft(details)).data, details, 'Editing round trip preserves values');
check(!helpers.parseButcherProductDraft(helpers.createButcherProductDraft()).success, 'New item starts with explicit empty selection and price');
check(!helpers.parseButcherProductDraft({ ...helpers.createButcherProductDraft(details), units: [{ id: 'kg', label: 'كيلو', price: '' }] }).success, 'Empty price never means zero');
equal(helpers.readButcherDetails({ wrong: true }), undefined, 'Malformed stored data fails closed');
equal(helpers.readButcherDetails(null), undefined, 'Legacy products remain supported');

const field = load('components/dashboard/menu/butcher-product-fields.tsx', { '@/lib/menu/butcher-products': helpers });
let draft = helpers.createButcherProductDraft(details);
const render = () => field.ButcherProductFields({ value: draft, onChange: next => { draft = next; }, disabled: false });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const find = predicate => { const result = nodes(render()).find(predicate); assert.ok(result); return result; };
find(node => node.type === 'input' && node.props.id === 'butcher-price-1').props.onChange({ target: { value: '0.075' } });
equal(draft.units[1].price, '0.075', 'Editing unit price keeps precision');
find(node => node.type === 'button' && !node.props['aria-label']).props.onClick();
equal(draft.units.at(-1).id, 'carcass', 'Add selects next unused standard unit');
find(node => node.type === 'select' && node.props.id === 'butcher-unit-3').props.onChange({ target: { value: 'custom' } });
check(/^custom_[a-f0-9-]{36}$/.test(draft.units[3].id), 'Custom unit identity is generated once');
find(node => node.type === 'input' && node.props.id === 'butcher-label-3').props.onChange({ target: { value: 'قطعة' } });
equal(draft.units[3].label, 'قطعة', 'Custom unit name is editable');
const markup = renderToStaticMarkup(React.createElement(field.ButcherProductFields, { value: draft, onChange() {}, disabled: false, error: 'تحقق من السعر' }));
check(markup.includes('step="0.000001"'), 'Browser price validation permits six decimal places');
check(markup.includes('role="alert"') && markup.includes('tabindex="-1"'), 'Validation error is announced and focusable');
check(markup.includes('id="butcher-origin"') && !/id="butcher-origin"[^>]*required/.test(markup), 'Origin remains optional');

async function main() {
  let category = 'butcher_shops', saved, writes = 0, exists = true;
  const chain = { eq() { return this; }, is() { return this; }, maybeSingle: async () => ({ data: exists ? { id: '11111111-2222-4333-8444-555555555555', ...saved } : null, error: null }) };
  const client = { from(table) { assert.equal(table, 'menu_products'); return {
    select() { return chain; },
    update(payload) { saved = payload; writes++; return { ...chain, select() { return chain; } }; },
    insert(payload) { saved = payload; writes++; return { select() { return { single: async () => ({ data: { id: 'saved', ...payload }, error: null }) }; } }; },
  }; } };
  const dal = load('lib/data/menu.ts', {
    '@/lib/menu/butcher-products': helpers,
    '@/lib/commerce/product-details': commerce,
    'next/cache': { revalidatePath() {} },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/supabase/admin': {},
    '@/lib/data/cafes': { requireOwnerCafeContext: async () => ({ id: 'cafe', slug: 'butcher', businessCategory: category }) },
    '@/lib/performance/server-memory-cache': { clearServerMemoryCache() {} },
    '@/lib/menu/standalone-menu': {},
    '@/lib/data/mappers': {},
  });
  const product = { name: 'لحم خروف', price: 999, loyaltyPoints: 0, redeemableWithPoints: false, availableForPickup: true, ingredients: [], available: true, imageVariant: 'latte', butcherDetails: details };
  await dal.upsertMenuProduct(product);
  equal(saved.butcher_details, details, 'DAL writes exact structured details');
  equal(saved.price, 65, 'DAL derives base price from first unit instead of trusting generic price');
  category = 'coffee_shops';
  const before = writes;
  await assert.rejects(() => dal.upsertMenuProduct(product), /الملحمة فقط/); checks++;
  equal(writes, before, 'Non-butcher metadata rejected before write');
  await dal.upsertMenuProduct({ ...product, butcherDetails: undefined });
  equal(saved.price, 999, 'Ordinary product price unchanged');
  check(!Object.hasOwn(saved, 'butcher_details'), 'Ordinary save does not write butcher column');
  category = 'butcher_shops';
  await assert.rejects(() => dal.upsertMenuProduct({ ...product, butcherDetails: undefined }), /نوع اللحم/); checks++;
  exists = false;
  await assert.rejects(() => dal.upsertMenuProduct({ ...product, id: '11111111-2222-4333-8444-555555555555', butcherDetails: undefined }), /نوع اللحم/); checks++;
  exists = true;
  await dal.upsertMenuProduct({ ...product, id: '11111111-2222-4333-8444-555555555555', butcherDetails: undefined });
  check(!Object.hasOwn(saved, 'butcher_details'), 'Legacy item save preserves existing metadata when not supplied');
  const mapper = load('lib/data/mappers.ts', { '@/lib/menu/butcher-products': helpers, '@/lib/commerce/product-details': commerce });
  equal(mapper.mapDbProductToMenuProduct({ ...saved, butcher_details: details }).butcherDetails, details, 'Owner readback retains unit prices and meat fields');
  let actionInput, authorized = false;
  const action = load('app/actions/menu.ts', {
    '@/lib/data/menu': { upsertMenuProduct: async input => { check(authorized, 'Service access is checked before product write'); actionInput = input; return { id: 'saved' }; } },
    '@/lib/data/owner-service-access': { assertOwnerServiceEnabled: async service => { equal(service, 'menu'); authorized = true; } },
  });
  await action.saveMenuProductAction({ ...product, id: '11111111-2222-4333-8444-555555555555' });
  equal(actionInput.butcherDetails, details, 'Server action forwards structured unit data');
  console.log(`Butcher products: ${checks} checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
