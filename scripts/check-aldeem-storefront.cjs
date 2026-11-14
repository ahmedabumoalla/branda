'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const ts = require('typescript'), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const inputs = new Set(), cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  inputs.add(file); const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name.endsWith('.css')) { inputs.add(path.join(path.dirname(file), name)); return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }; }
    if (name === 'next/navigation') return { useRouter: () => ({ refresh() {} }) };
    if (name === '@/app/actions/gift-orders') return { submitGiftOrderAction() { throw Error('No live orders in render checks'); }, trackGiftOrderAction() { throw Error('No live tracking in render checks'); } };
    if (name.startsWith('@/') || name.startsWith('./')) { const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name); return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx'); }
    return require(name);
  }, exports); return exports;
}
let assertions = 0;
function check(value, label) { assert.ok(value, label); assertions++; }
const { AldeemStore } = load('components/store/aldeem-store.tsx');
const { AldeemLoading } = load('components/store/aldeem-loading.tsx');
const { isAldeemStore } = load('lib/commerce/aldeem-profile.ts');
const { isCommerceBusinessCategory } = load('lib/commerce/business-category.ts');
const { GiftProductFields } = load('components/dashboard/menu/gift-product-fields.tsx');
const product = { id: '00000000-0000-4000-8000-000000000001', name: 'كيك الفستق', category: 'الكيك', categoryId: 'cakes', description: 'تشكيلة خيال الديم', price: 0, ingredients: [], available: true, images: [{ url: '/aldeem/right-1.webp', alt: 'كيك الفستق' }], videos: [], commerceDetails: { quoteOnly: true } };
const menu = { name: 'سلسلة خيال الديم للحلويات', slug: 'khayal-aldeem', businessCategory: 'retail_stores', logoUrl: '/aldeem/logo.webp', description: null, loyaltyEnabled: false, categories: [{ id: 'cakes', name: 'الكيك', description: null }], products: [product], contacts: { feedbackEnabled: false, instagramUrl: null, location: null } };
function render(overrides = {}, props = {}) { return renderToStaticMarkup(React.createElement(AldeemStore, { menu: { ...menu, ...overrides }, settings: null, loyalty: null, ...props })); }
const html = render();
for (const value of ['حلا يكمّل', 'حلو أيامك', 'كيك الفستق', 'السعر عند تأكيد الطلب', '/aldeem/hero.webp', '/aldeem/logo.webp', 'ابحث في منتجات الديم', 'سلة التسوق 0 منتج']) check(html.includes(value), `SSR ${value}`);
check(!html.includes('<bdi>0</bdi>'), 'Unpriced catalog does not advertise zero-priced products');
check(!html.includes('مصمّم لمساحتك') && !html.includes('غرسَتك'), 'No unrelated plant-store copy');
check(!html.includes('/loyalty/khayal-aldeem'), 'Disabled loyalty is absent');
const priced = render({ products: [{ ...product, price: 125.5, commerceDetails: {} }] });
check(priced.includes('<bdi>125.5</bdi>'), 'Configured actual price is displayed');
check(!priced.includes('السعر عند تأكيد الطلب'), 'Quote state clears with configured product');
const variant = render({ products: [{ ...product, price: 100, commerceDetails: { options: [{ id: 'small', label: 'صغير', price: 110, available: false, stock: 0 }, { id: 'large', label: 'كبير', price: 160, available: true, stock: null }] } }] });
check(variant.includes('<bdi>160</bdi>') && !variant.includes('<bdi>110</bdi>'), 'Price uses only available variants');
const empty = render({ products: [], categories: [] });
check(empty.includes('جرّب اسمًا ثانيًا') && !empty.includes('collectionRail'), 'Empty catalog renders useful state without invented collections');
const loyalty = render({ loyaltyEnabled: true }, { loyalty: { purchasesRequired: 5, rewardName: 'مكافأة الديم' } });
check(loyalty.includes('/loyalty/khayal-aldeem') && loyalty.includes('اجمع 5 أختام') && loyalty.includes('مكافأة الديم'), 'Loyalty uses actual enabled program');
const escaped = render({ products: [{ ...product, name: '<script>bad()</script>' }] });
check(!escaped.includes('<script>bad()') && escaped.includes('&lt;script&gt;'), 'Catalog text is escaped');
check(isAldeemStore('khayal-aldeem') && !isAldeemStore('brand-1c2b6f7e028f'), 'Dedicated profile does not affect another brand');
check(isCommerceBusinessCategory('retail_stores') && isCommerceBusinessCategory('gifts_flowers') && isCommerceBusinessCategory('clothing_stores') && !isCommerceBusinessCategory('cafes_coffee'), 'Retail commerce capability retains existing category boundaries');
const fields = renderToStaticMarkup(React.createElement(GiftProductFields, { value: { quoteOnly: true, attributes: [{ label: 'الحفظ', value: 'يحددها المسؤول' }] }, onChange() {}, service: false, retail: true }));
check(fields.includes('الأحجام والأصناف') && fields.includes('إضافة حجم أو نوع'), 'Retail owner can create variant sizes and prices without fashion labels');
check(fields.includes('السعر يحتاج اعتماد المتجر') && fields.includes('checked=""'), 'Unpriced retail items expose explicit owner pricing approval');
check(fields.includes('المكونات أو مسببات الحساسية') && !fields.includes('ضوء ساطع'), 'Retail specifications are food/product appropriate');
const giftFields = renderToStaticMarkup(React.createElement(GiftProductFields, { value: { quoteOnly: true }, onChange() {}, service: true }));
check(giftFields.includes('الخدمة تتطلب عرض سعر') && !giftFields.includes('السعر يحتاج اعتماد المتجر'), 'Existing gift service editing behavior retained');
const loading = renderToStaticMarkup(React.createElement(AldeemLoading));
check(loading.includes('aria-busy="true"') && loading.includes('نجهّز لك لحظة حلوة'), 'Branded accessible loading state');
const css = fs.readFileSync('components/store/aldeem-store.module.css', 'utf8');
check(css.includes('prefers-reduced-motion:reduce') && css.includes(':focus-visible'), 'Reduced motion and visible focus');
check(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))') && css.includes('env(safe-area-inset-bottom)'), 'Mobile two-column and safe-area layout');
check(css.includes('font-size:16px;color:var(--ink)'), 'Search input prevents iOS focus zoom');
const source = fs.readFileSync('components/store/aldeem-store.tsx', 'utf8');
check(source.includes('if (product.commerceDetails?.quoteOnly) return') && source.includes('settings && ordering'), 'Unconfirmed prices and disabled checkout guarded');
inputs.add('app/menu/[slug]/page.tsx'); inputs.add('app/menu/[slug]/loading.tsx'); inputs.add('package.json'); inputs.add('package-lock.json');
const evidence = { finishedAt: new Date().toISOString(), runtime: process.version, command: 'node scripts/check-aldeem-storefront.cjs', assertions, passed: true, inputs: Object.fromEntries([...inputs].sort().map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])), limits: ['SSR and source checks only', 'No browser, real orders or payment writes'] };
fs.mkdirSync('output/aldeem-20261114', { recursive: true }); fs.writeFileSync('output/aldeem-20261114/storefront-check.json', JSON.stringify(evidence, null, 2)); console.log(JSON.stringify({ assertions, passed: true }));
