const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const css = require('lightningcss').transform({ filename: 'together-store.module.css', code: fs.readFileSync('components/store/together-store.module.css'), cssModules: true });
for (const file of ['components/store/together-store.tsx', 'components/store/gift-store-dialogs.tsx']) for (const [, key] of fs.readFileSync(file, 'utf8').matchAll(/\bs\.(\w+)/g)) assert(css.exports[key], `Missing CSS module ${key}`);
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, k) => String(k) }) };
    if (name.startsWith('@/') || name.startsWith('./')) { const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name); if (base.endsWith('.json')) return JSON.parse(fs.readFileSync(base, 'utf8')); return load(base + (fs.existsSync(base + '.ts') ? '.ts' : '.tsx'), mocks); }
    return require(name);
  }, exports);
  return exports;
}
const { productMinimumPrice, selectedProductPrice, selectionError, giftProductAvailable } = load('lib/commerce/storefront-cart.ts');
const { previewGiftOrderTotal } = load('lib/commerce/gift-orders.ts');
const product = { id: '11111111-1111-4111-8111-111111111111', name: 'غرسة', category: 'أصدقاء الظل', categoryId: 'plants', description: 'تفاصيل الغرسة الأصلية', price: 20, available: true, ingredients: [], images: [{ url: 'https://example.test/one.webp', alt: 'غرسة' }], videos: [], commerceDetails: { optionGroups: [{ id: 'pot', label: 'الحوض', required: true, type: 'select', choices: [{ id: 'plastic', label: 'بلاستيك', priceDelta: 0 }, { id: 'glass', label: 'زجاج', priceDelta: 15 }] }, { id: 'extras', label: 'إضافات', required: false, type: 'multi', choices: [{ id: 'soil', label: 'تربة', priceDelta: 7 }] }] } };
assert.equal(productMinimumPrice(product), 20);
assert(selectionError(product, []));
const selections = [{ groupId: 'pot', choiceIds: ['glass'] }, { groupId: 'extras', choiceIds: ['soil'] }];
assert.equal(selectedProductPrice(product, selections), 42);
assert.equal(selectionError(product, selections), null);
assert(selectionError(product, [{ groupId: 'pot', choiceIds: ['removed'] }]));
assert(selectionError(product, [{ groupId: 'pot', choiceIds: ['glass', 'glass'] }]));
assert(selectionError({ ...product, available: false }, selections));
assert(selectionError({ ...product, commerceDetails:{...product.commerceDetails,stock:0} }, selections));
assert.equal(giftProductAvailable({...product,commerceDetails:{stock:0}}),false);
assert.equal(giftProductAvailable({...product,commerceDetails:{stock:null}}),true);
assert.equal(giftProductAvailable({...product,commerceDetails:{options:[{id:'one',available:true,price:20,stock:0}]}}),false);
assert.equal(giftProductAvailable({...product,commerceDetails:{options:[{id:'one',available:true,price:20,stock:1}]}}),true);
const pottery = { ...product, price: 0, commerceDetails: { optionGroups: [{ id: 'age', type: 'select', required: true, choices: [{ id: 'child', priceDelta: 25 }, { id: 'adult', priceDelta: 45 }] }] } };
assert.equal(productMinimumPrice(pottery), 25, 'Required workshop choices must never appear free');
const settings = { enabled: true, deliveryEnabled: true, pickupEnabled: true, deliveryFee: 25, paymentMethods: ['cod', 'bank_transfer'], pickupLocation: 'المحل', deliveryNotes: 'داخل المدينة', bankInstructions: '', vatRate: 0, taxInclusive: true };
assert.equal(previewGiftOrderTotal(84, 'delivery', settings).total, 109);
assert.equal(previewGiftOrderTotal(84, 'pickup', settings).total, 84);
assert.deepEqual(previewGiftOrderTotal(115, 'pickup', { ...settings, vatRate: 15 }), { subtotal: 115, deliveryFee: 0, tax: 15, total: 115 });
const noop = () => {};
const mocks = { 'next/link': ({ children, ...props }) => React.createElement('a', props, children), 'next/navigation': { useRouter: () => ({ refresh: noop }) }, '@/app/actions/gift-orders': { submitGiftOrderAction: noop, trackGiftOrderAction: async () => ({ ok: false, error: 'غير موجود' }) }, '@/lib/analytics/public-tracking': { trackBrandEngagement: noop } };
const { TogetherStore } = load('components/store/together-store.tsx', mocks);
const menu = { name: 'Together Plants', slug: 'brand-871ec6e243c0', businessCategory: 'gifts_flowers', products: [product, { ...product, id: '22222222-2222-4222-8222-222222222222', name: 'ورشة الفخار', available: false, catalogKind: 'service' }], categories: [{ id: 'plants', name: 'أصدقاء الظل' }], contacts: {}, logoUrl: null, loyaltyEnabled: true };
const html = renderToStaticMarkup(React.createElement(TogetherStore, { menu, settings, loyalty: { purchasesRequired: 4, rewardName: 'خصم 10%' } }));
for (const token of ['botanical-atelier-v3', 'لأن بعض الهدايا', 'أهدِ حبًّا', 'نفد حاليًا', 'ورشة الفخار', 'الخدمات والورش', 'خصم 10%', '/loyalty/brand-871ec6e243c0', 'hero-mobile.webp', 'تفاصيل غرسة', 'https://linktr.ee/together2000', 'id="together-partners"']) assert(html.includes(token), token);
const partners = JSON.parse(fs.readFileSync('data/together-partners.json', 'utf8')).partners;
assert.equal(partners.length, 6);
for (const partner of partners) { assert(html.includes(partner.path)); assert(fs.existsSync('public' + partner.path)); }
assert(html.indexOf('id="together-top"') < html.indexOf('id="together-loyalty"'));
assert(html.indexOf('id="together-loyalty"') < html.indexOf('id="together-products"'), 'Loyalty must follow the hero before the catalog');
assert(!html.includes('6000'));
// Exercise real form handlers, including validation and server retry idempotency.
function hooks() { let slots = [], cursor = 0; return { api: { ...React, useEffect: noop, useRef(value) { const i = cursor++; return slots[i] ?? (slots[i] = { current: value }); }, useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value; return [slots[i], next => slots[i] = typeof next === 'function' ? next(slots[i]) : next]; } }, draw(fn, props) { cursor = 0; return fn(props); } }; }
const nodes = t => !t || typeof t !== 'object' ? [] : Array.isArray(t) ? t.flatMap(nodes) : [t, ...nodes(t.props?.children)];
const text = t => Array.isArray(t) ? t.map(text).join('') : t && typeof t === 'object' ? text(t.props?.children) : t == null || typeof t === 'boolean' ? '' : String(t);
async function main() {
  const partnerHooks = hooks(); let reducedGallery = false, moved;
  const { TogetherPartners } = load('components/store/together-store.tsx', { ...mocks, react: partnerHooks.api, 'motion/react': { useReducedMotion: () => reducedGallery, motion: { li: 'li' } } });
  let galleryTree = partnerHooks.draw(TogetherPartners, {});
  nodes(galleryTree).find(n => n.type === 'ul').props.ref.current = { clientWidth: 400, scrollBy: options => moved = options };
  nodes(galleryTree).find(n => n.props?.['aria-label'] === 'الشعارات التالية').props.onClick();
  assert.deepEqual(moved, { left: -320, behavior: 'smooth' }, 'Next moves forward in the RTL gallery');
  reducedGallery = true; galleryTree = partnerHooks.draw(TogetherPartners, {});
  nodes(galleryTree).find(n => n.props?.['aria-label'] === 'الشعارات السابقة').props.onClick();
  assert.deepEqual(moved, { left: 320, behavior: 'instant' }, 'Reduced motion disables smooth scrolling');
  const heroHooks = hooks(); let effects = [], interval, observe, selectedPlant, cleared = 0, disconnected = 0, reduced = false;
  const oldWindow = global.window, oldDocument = global.document, oldObserver = global.IntersectionObserver;
  global.window = { setInterval(fn, ms) { assert.equal(ms, 6000); interval = fn; return 1; }, clearInterval() { cleared++; } };
  global.document = { hidden: false };
  global.IntersectionObserver = class { constructor(callback) { observe = callback; } observe() {} disconnect() { disconnected++; } };
  const { TogetherHero } = load('components/store/together-store.tsx', { ...mocks, react: { ...heroHooks.api, useRef: () => ({ current: {} }), useEffect(fn) { effects.push(fn); }, useSyncExternalStore: (_subscribe, snapshot) => snapshot() }, 'motion/react': { useReducedMotion: () => reduced, AnimatePresence: React.Fragment, motion: { button: 'button', span: 'span', em: 'em' } } });
  const plants = [product, { ...product, id: 'second', name: 'غابة مصغرة' }];
  const drawHero = () => { effects = []; return heroHooks.draw(TogetherHero, { products: plants, onSelect: p => selectedPlant = p }); };
  try {
    let hero = drawHero(); const disconnect = effects[0](); observe([{ isIntersecting: true }]); hero = drawHero(); const stop = effects[1](); assert.equal(typeof interval, 'function'); interval(); hero = drawHero(); assert(text(hero).includes('غابة مصغرة'));
    nodes(hero).find(n => n.props?.['aria-label'] === 'اكتشف غابة مصغرة').props.onClick(); assert.equal(selectedPlant.id, 'second');
    nodes(hero).find(n => n.props?.['aria-label'] === 'عرض غرسة').props.onClick(); hero = drawHero(); assert.equal(effects[1](), undefined, 'Manual image selection pauses autoplay');
    nodes(hero).find(n => n.props?.['aria-label'] === 'تشغيل تبديل الغراس').props.onClick(); hero = drawHero(); hero.props.onFocusCapture(); hero = drawHero(); assert.equal(effects[1](), undefined, 'Keyboard focus pauses autoplay');
    hero.props.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: null }); global.document.hidden = true; hero = drawHero(); assert.equal(effects[1](), undefined, 'Background tabs do not rotate');
    global.document.hidden = false; reduced = true; hero = drawHero(); assert.equal(effects[1](), undefined); assert(!nodes(hero).some(n => n.props?.className === 'gardenPause'));
    stop(); disconnect(); assert(cleared && disconnected);
  } finally { global.window = oldWindow; global.document = oldDocument; global.IntersectionObserver = oldObserver; }
  const persistence = new Map();
  const storage = { getItem: key => persistence.get(key) ?? null, setItem: (key, value) => persistence.set(key, value), removeItem: key => persistence.delete(key) };
  const firstClient = load('lib/commerce/checkout-request.ts');
  const pending = await firstClient.pendingGiftRequest('store', { customerName: 'Private Name', phone: '0500000000', items: ['one'] }, storage);
  const restartedClient = load('lib/commerce/checkout-request.ts');
  assert.equal(await restartedClient.pendingGiftRequest('store', { customerName: 'Private Name', phone: '0500000000', items: ['one'] }, storage), pending, 'Lost-response retry survives a complete application reload');
  assert(![...persistence.values()].join('').includes('Private Name') && ![...persistence.values()].join('').includes('0500000000'), 'Retry persistence must not store customer data');
  restartedClient.clearPendingGiftRequest('store', pending, storage);
  assert.notEqual(await restartedClient.pendingGiftRequest('store', { customerName: 'Private Name', phone: '0500000000', items: ['one'] }, storage), pending, 'A confirmed order allows a later intentional repeat purchase');
  const quotaStorage = { ...storage, setItem() { throw new Error('Quota exceeded'); } };
  const changedPending = await restartedClient.pendingGiftRequest('store', { items: ['changed'] }, quotaStorage);
  assert.equal(await restartedClient.pendingGiftRequest('store', { items: ['changed'] }, quotaStorage), changedPending, 'A stale persisted record must not replace the live retry identifier after quota failure');
  const h = hooks(); let additions = 0;
  const { GiftProductDialog } = load('components/store/gift-store-dialogs.tsx', { ...mocks, react: h.api });
  const props = { product: { ...product, images: [...product.images, { url: 'https://example.test/two.webp', alt: 'الصورة الثانية' }] }, close: noop, orderingEnabled: true, add: () => { additions++; return 'أكمل طلبك الحالي'; } };
  let tree = h.draw(GiftProductDialog, props);
  const imageFrame = nodes(tree).find(n => n.props?.className === 'detailImage');
  assert(!nodes(imageFrame).some(n => n.type === 'button'), 'Gallery controls must not overlay the product image');
  nodes(tree).find(n => n.props?.['aria-label'] === 'الصورة التالية').props.onClick(); tree = h.draw(GiftProductDialog, props);
  assert(text(nodes(tree).find(n => n.props?.className === 'imageCounter')).includes('2 / 2'));
  assert(nodes(tree).some(n => n.props?.src === 'https://example.test/two.webp' && n.props?.eager));
  nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault: noop });
  assert.equal(additions, 0, 'Required choices block submission');
  tree = h.draw(GiftProductDialog, props);
  const choice = nodes(tree).find(n => n.type === 'input' && n.props.name === 'pot'); choice.props.onChange({ target: { checked: true } });
  tree = h.draw(GiftProductDialog, props); nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault: noop });
  assert.equal(additions, 1); assert(text(h.draw(GiftProductDialog, props)).includes('أكمل طلبك الحالي'), 'Cart errors stay inside the open dialog');
  const c = hooks(), requests = []; let receipt, clears = 0;
  const { GiftCheckoutDialog } = load('components/store/gift-store-dialogs.tsx', { ...mocks, react: c.api, '@/app/actions/gift-orders': { submitGiftOrderAction: async input => { requests.push(input); return requests.length < 2 ? { ok: false, error: 'أعد المحاولة' } : { ok: true, order: { number: 7, trackingToken: 'token' } }; } } });
  const checkout = { slug: menu.slug, lines: [{ key: 'one', productId: product.id, quantity: 2, selections }], products: [product], settings, setLines: value => { assert.deepEqual(value, []); clears++; }, close: noop, onReceipt: value => receipt = value };
  const oldFormData = global.FormData; global.FormData = class { get(key) { return { name: 'عميل تجربة', phone: '0500000000', city: 'خميس مشيط', address: 'عنوان تجريبي' }[key] ?? ''; } };
  try {
    tree = c.draw(GiftCheckoutDialog, checkout); await nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault: noop, currentTarget: {} });
    tree = c.draw(GiftCheckoutDialog, checkout); assert(text(tree).includes('أعد المحاولة')); await nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault: noop, currentTarget: {} });
    assert.equal(requests[0].requestId, requests[1].requestId); assert.equal(requests[0].expectedTotal, 109); assert.equal(clears, 1); assert.equal(receipt.number, 7);
    tree = c.draw(GiftCheckoutDialog, { ...checkout, settings: { ...settings, deliveryEnabled: false, paymentMethods: ['bank_transfer'] } });
    const radios = nodes(tree).filter(n => n.type === 'input' && n.props.type === 'radio'); assert.equal(radios.length, 2); assert(radios.every(n => n.props.checked), 'Changed owner settings select only supported fulfillment/payment');
  } finally { global.FormData = oldFormData; }
  console.log('PASS Together SSR, original pricing/options, unavailable items, required choices, dialog validation, owner-setting refresh and idempotent checkout retry');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
