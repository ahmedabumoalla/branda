const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
let checks = 0;
function check(condition, message) { assert(condition, message); checks++; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    return require(name);
  }, exports);
  return exports;
}
const noop = () => null;
const Details = () => null;
const image = ({ fill, unoptimized, priority, ...props }) => React.createElement('img', props);
const motion = new Proxy({}, { get: (_, tag) => {
  const MotionElement = ({ initial, animate, exit, transition, whileInView, viewport, ...props }) => React.createElement(tag, props);
  MotionElement.motionTag = tag;
  return MotionElement;
} });
const mocks = {
  'next/image': image,
  'next/link': ({ children, ...props }) => React.createElement('a', props, children),
  'motion/react': { motion, AnimatePresence: React.Fragment, useReducedMotion: () => true },
  './bistro-menu': { ProductDetails: Details },
  './menu-services': { MenuServices: noop },
  './loyalty-link-content': { LoyaltyLinkContent: ({ label }) => label },
  '@/lib/analytics/public-tracking': { trackBrandEngagement: noop },
  '@/lib/menu/menu-entry-scroll': { startMenuAtTop: noop, menuEntryUrl: (origin, slug) => `${origin}/menu/${slug}` },
};
const { signatureBrands, signatureBrand, signatureAsset } = load('lib/menu/signature-brands.ts');
const { SignatureMenu } = load('components/menu/signature-menu.tsx', mocks);
const { SignatureMenuLoading } = load('components/menu/signature-menu-loading.tsx', mocks);
const now = Date.now();
const product = { id: 'coffee', name: 'أمريكانو', description: 'قهوة صافية', categoryId: 'drinks', category: 'مشروبات', price: 20, priceOptions: [], available: true, images: [{ url: 'https://example.test/coffee.webp', alt: 'قهوة' }], videos: [], ingredients: [] };
const menu = {
  slug: 'brand-c138e578b03c', name: 'RAST', logoUrl: '/original-rast.webp', description: '', loyaltyEnabled: true,
  categories: [{ id: 'drinks', name: 'مشروبات', description: null }, { id: 'dessert', name: 'حلويات', description: null }],
  products: [product, { ...product, id: 'cake', name: 'كوكيز', categoryId: 'dessert', category: 'حلويات', price: 12 }, { ...product, id: 'hidden', name: 'UNAVAILABLE PRODUCT', available: false }],
  contacts: { feedbackEnabled: false, instagramUrl: null, location: null },
  highlights: { asOf: now, items: [
    { id: 'current', title: 'FEATURED CHOICE', description: 'اختيار من المنيو', productId: 'coffee', expiresAt: now + 60000 },
    { id: 'expired', title: 'EXPIRED CHOICE', productId: 'cake', expiresAt: now - 1 },
    { id: 'unavailable', title: 'UNAVAILABLE CHOICE', productId: 'hidden', expiresAt: null },
    { id: 'concealed', title: 'CONCEALED CHOICE', productId: 'cake', showInSpotlight: false, expiresAt: null },
  ] },
};
const loyalty = { purchasesRequired: 6, rewardName: 'خصم 10%' };
const props = { menu, brand: signatureBrand(menu.slug), loyalty };
const render = (overrides = {}) => renderToStaticMarkup(React.createElement(SignatureMenu, { ...props, ...overrides }));
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (tree.type?.motionTag) return nodes(tree.type(tree.props));
  return [tree, ...nodes(tree.props?.children)];
}
function words(tree) { return tree == null || typeof tree === 'boolean' ? '' : typeof tree !== 'object' ? String(tree) : Array.isArray(tree) ? tree.map(words).join('') : words(tree.props?.children); }
function hooks() {
  let slots = [], cursor = 0, effects = [];
  return {
    api: { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => slots[i] = typeof value === 'function' ? value(slots[i]) : value]; }, useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; }, useEffect(fn) { effects.push(fn); } },
    draw(Component, input) { cursor = 0; effects = []; return Component(input); },
    effects: () => effects,
    refs: () => slots.filter(slot => slot && typeof slot === 'object' && 'current' in slot),
    reset() { slots = []; cursor = 0; effects = []; },
  };
}

async function main() {
  equal(Object.keys(signatureBrands).length, 6, 'Only the six requested identities receive this presentation');
  for (const unknown of ['rast', 'black-drop', 'once', 'box-bbq', 'brand-871ec6e243c0', '__proto__', 'constructor']) equal(signatureBrand(unknown), null, 'Unrelated and inherited object names do not select a brand');
  for (const [slug, brand] of Object.entries(signatureBrands)) {
    const html = render({ menu: { ...menu, slug, name: brand.name, logoUrl: null }, brand });
    check(html.includes(`data-signature="${brand.key}"`), `${slug} identity is selected explicitly`);
    check(html.includes(signatureAsset(brand.hero)) && html.includes(signatureAsset(brand.hero, true)), 'Desktop and mobile artwork belong to selected brand');
    check(html.includes(signatureAsset(brand.logo)), 'Central identity uses the brand original artwork');
    check(html.includes(`/loyalty/${slug}?source=menu`), 'Loyalty destination remains tenant scoped');
    const loading = renderToStaticMarkup(React.createElement(SignatureMenuLoading, { brand }));
    check(loading.includes(signatureAsset(brand.logo)) && loading.includes('aria-busy="true"') && loading.includes('role="status"'), 'Loading has correct logo and accessible status');
    if (brand.key === 'once' || brand.key === 'black') {
      check(loading.includes('data-cutout="true"') && html.includes('data-cutout="true"'), 'Transparent loading and fallback marks use uncropped normal compositing');
      const actual = render({ menu: { ...menu, slug, name: brand.name, logoUrl: signatureAsset(brand.logo) }, brand });
      check(actual.includes('data-cutout="true"'), 'Reviewed menu logo uses the same alpha layout');
      const owner = render({ menu: { ...menu, slug, name: brand.name, logoUrl: '/new-owner-logo.webp' }, brand });
      check(owner.includes('/new-owner-logo.webp') && !owner.includes('data-cutout="true"'), 'Future owner logo retains its own layout');
      const sharp = require('sharp');
      const { data, info } = await sharp(path.join(root, 'public', signatureAsset(brand.logo))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let transparent = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] < 10) transparent++;
      check(transparent > info.width * info.height * .3, 'Deployed logo has genuine alpha, not a painted square');
      const id = brand.key === 'once' ? 'a3c65c66-d5de-41e2-a2c7-0cc451a92bf3' : '6d01bd09-c7e0-4307-8cfb-93171d69d9db';
      const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261101231912_four_brand_catalog_identity.sql'), 'utf8');
      const originalPath = sql.match(new RegExp(id + '/identity/four-brands-20261102-logo-[a-f0-9]+\\.webp'))[0];
      const { standaloneLogoVariant } = load('lib/menu/logo-variants.ts');
      equal(standaloneLogoVariant(id, originalPath), signatureAsset(brand.logo), 'Exact reviewed owner source resolves to the alpha asset');
      equal(standaloneLogoVariant(id, id + '/new-logo.webp'), null, 'New owner upload is never overridden');
      equal(standaloneLogoVariant('another-brand', originalPath), null, 'Other brands cannot inherit this logo');
    }
  }
  let html = render();
  const garden = signatureBrand('brand-dcf7296f722c');
  equal(garden.key, 'hadiqa', 'Alhadiqa identity is selected by its exact tenant slug');
  equal(signatureAsset(garden.logo), '/menu-art/hadiqa/hadiqa-logo-v1.webp', 'Alhadiqa retains its separate original logo asset');
  equal(signatureAsset(garden.hero, true), '/menu-art/hadiqa/hadiqa-hero-mobile-v1.webp', 'Alhadiqa supplies dedicated mobile art');
  const gardenHtml = render({ brand: garden, menu: { ...menu, slug: 'brand-dcf7296f722c', name: garden.name, logoUrl: null } });
  check(gardenHtml.includes('lucide-utensils-crossed') && !gardenHtml.includes('lucide-coffee'), 'Restaurant loyalty uses dining stamps instead of cafe cups');
  check(gardenHtml.includes('من مطبخ الحديقة') && gardenHtml.includes('٦ أختام'), 'Restaurant catalog and actual configured loyalty are rendered together');
  check(!render({ brand: garden, loyalty: null }).includes('id="signature-loyalty"'), 'Alhadiqa does not invent a program when server loyalty is disabled');
  const illustratedProduct = { ...product, description: 'صورة توضيحية للصنف' };
  const illustratedMenu = { ...menu, slug: 'brand-dcf7296f722c', products: [illustratedProduct, { ...product, id: 'original', name: 'صورة أصلية' }] };
  const illustratedHtml = render({ brand: garden, menu: illustratedMenu });
  equal((illustratedHtml.match(/data-photo-disclosure/g) || []).length, 1, 'Only the labelled generated Alhadiqa photo receives a disclosure badge');
  check(!gardenHtml.includes('data-photo-disclosure'), 'Original Alhadiqa product photos stay unlabelled');
  check(!render({ menu: illustratedMenu }).includes('data-photo-disclosure'), 'Disclosure handling does not alter other signature brands');
  check(!render({ brand: garden, menu: { ...illustratedMenu, products: [{ ...illustratedProduct, images: [] }] } }).includes('data-photo-disclosure'), 'Missing images do not receive a photo badge');
  const unchanged = JSON.stringify(menu);
  check(html.includes('/original-rast.webp'), 'Uploaded owner logo is respected');
  check(!html.includes('UNAVAILABLE PRODUCT') && !html.includes('UNAVAILABLE CHOICE') && !html.includes('EXPIRED CHOICE') && !html.includes('CONCEALED CHOICE'), 'Unavailable and expired content stays out of public menu');
  check(html.includes('FEATURED CHOICE'), 'Current featured item is visible');
  const catalog = html.slice(html.indexOf('id="signature-catalog"'), html.indexOf('<footer'));
  check(!catalog.includes('FEATURED CHOICE'), 'Promotional presentation is separate from the product grid');
  check(html.indexOf('id="signature-loyalty"') < html.indexOf('id="signature-offers"') && html.indexOf('id="signature-offers"') < html.indexOf('id="signature-catalog"'), 'Compact loyalty and spotlight precede catalog');
  check(html.includes('٦ أختام') && html.includes('خصم 10%'), 'Six-stamp ten-percent configured program is explained');
  equal(JSON.stringify(menu), unchanged, 'Rendering never mutates owner catalog data');
  html = render({ loyalty: { purchasesRequired: 4, rewardName: 'مكافأة مختلفة' } });
  check(html.includes('٤ أختام') && html.includes('مكافأة مختلفة') && !html.includes('خصم 10%'), 'Rewards are taken from actual program props rather than hardcoded');
  for (const state of [{ loyalty: null }, { menu: { ...menu, loyaltyEnabled: false } }]) check(!render(state).includes('id="signature-loyalty"'), 'Disabled loyalty never advertises enrollment');
  html = render({ menu: { ...menu, products: [], highlights: { asOf: now, items: [] } } });
  check(html.includes('اختياراتنا تتجهّز لك'), 'Empty catalog has a clear state');
  check(!html.includes('href="#signature-offers"'), 'No dead spotlight anchor when featured content is empty');

  const h = hooks();
  const Interactive = load('components/menu/signature-menu.tsx', { ...mocks, react: h.api }).SignatureMenu;
  const draw = input => h.draw(Interactive, { ...props, ...input });
  let disclosureTree = draw({ brand: garden, menu: illustratedMenu });
  nodes(disclosureTree).find(n => n.props?.['aria-label'] === 'تفاصيل أمريكانو').props.onClick();
  disclosureTree = draw({ brand: garden, menu: illustratedMenu });
  equal(nodes(disclosureTree).find(n => n.type === Details).props.imageDisclosure, 'صورة توضيحية', 'Generated image disclosure follows the selected product into its dialog');
  nodes(disclosureTree).find(n => n.props?.['aria-label'] === 'تفاصيل صورة أصلية').props.onClick();
  disclosureTree = draw({ brand: garden, menu: illustratedMenu });
  equal(nodes(disclosureTree).find(n => n.type === Details).props.imageDisclosure, undefined, 'Switching to an original image clears the dialog disclosure');
  h.reset();
  let tree = draw();
  const articles = tree => nodes(tree).filter(n => n.type === 'article' && n.props.className === 'product');
  equal(articles(tree).length, 2, 'Only available product cards rendered');
  nodes(tree).find(n => n.type === 'input').props.onChange({ target: { value: 'امريكانو' } });
  tree = draw(); equal(articles(tree).length, 1, 'Arabic normalized search matches accents');
  nodes(tree).find(n => n.type === 'input').props.onChange({ target: { value: '' } });
  tree = draw(); nodes(tree).find(n => n.type === 'button' && words(n) === 'حلويات').props.onClick();
  tree = draw(); equal(articles(tree).length, 1, 'Category filtering isolates products'); check(words(articles(tree)[0]).includes('كوكيز'), 'Correct category item');
  nodes(tree).find(n => n.type === 'input').props.onChange({ target: { value: 'لا يوجد' } });
  tree = draw(); equal(articles(tree).length, 0, 'Search combines with category');
  nodes(tree).find(n => n.type === 'button' && words(n) === 'عرض كل المنتجات').props.onClick();
  tree = draw(); equal(articles(tree).length, 2, 'Reset restores category and search');
  nodes(tree).find(n => n.type === 'select').props.onChange({ target: { value: 'low' } });
  tree = draw(); check(words(articles(tree)[0]).includes('كوكيز'), 'Ascending price orders across categories');
  nodes(tree).find(n => n.type === 'select').props.onChange({ target: { value: 'high' } });
  tree = draw(); check(words(articles(tree)[0]).includes('أمريكانو'), 'Descending price orders across categories');
  nodes(tree).find(n => n.props?.['aria-label'] === 'تفاصيل أمريكانو').props.onClick();
  tree = draw(); let detail = nodes(tree).find(n => n.type === Details);
  equal(detail.props.product.id, 'coffee', 'Product selection opens correct detail'); equal(detail.props.total, 2, 'Detail navigation includes visible products');
  equal(detail.props.product.images[0].url, product.images[0].url, 'Opening details reuses the catalog image URL for browser cache');
  for (const [slug, brand] of Object.entries(signatureBrands)) {
    const brandedDetail = nodes(draw({ menu: { ...menu, slug }, brand })).find(n => n.type === Details);
    equal(brandedDetail.props.brandCaption, brand.signature, 'Product modal receives the current brand caption');
    equal(brandedDetail.props.brandSlug, slug, 'Modal brand identity remains scoped to the displayed menu');
  }
  tree = draw(); detail = nodes(tree).find(n => n.type === Details);
  detail.props.browse(1); tree = draw(); detail = nodes(tree).find(n => n.type === Details); equal(detail.props.product.id, 'cake', 'Detail navigation moves to next filtered product');
  detail.props.close(); tree = draw(); check(!nodes(tree).some(n => n.type === Details), 'Closing detail returns to current catalog');
  const spotlightNode = nodes(tree).find(n => n.type?.name === 'Spotlight');
  spotlightNode.props.onSelect('coffee'); tree = draw(); check(nodes(tree).some(n => n.type === Details), 'Spotlight uses actual product detail route');
  const promoHooks = hooks(), PromoMenu = load('components/menu/signature-menu.tsx', { ...mocks, react: promoHooks.api }).SignatureMenu;
  const promotionalMenu = { ...menu, highlights: { asOf: now, items: [{ ...menu.highlights.items[0], discountPercent: 50 }] } };
  let promoTree = promoHooks.draw(PromoMenu, { ...props, menu: promotionalMenu });
  nodes(promoTree).find(n => n.type === 'select').props.onChange({ target: { value: 'low' } });
  promoTree = promoHooks.draw(PromoMenu, { ...props, menu: promotionalMenu });
  check(words(articles(promoTree)[0]).includes('أمريكانو'), 'Price sorting reflects the currently published discount');

  const globals = Object.fromEntries(['window', 'document', 'navigator', 'IntersectionObserver'].map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  const timeout = global.setTimeout, clearTimeoutOriginal = global.clearTimeout;
  let interval, intervals = 0, cleared = 0, observe, disconnected = 0, copied, shared, toasts = 0, clearedToast = 0;
  Object.defineProperty(global, 'window', { configurable: true, value: { location: { origin: 'https://barndaksa.com' }, setInterval(fn) { interval = fn; intervals++; return intervals; }, clearInterval() { cleared++; } } });
  Object.defineProperty(global, 'document', { configurable: true, value: { hidden: false, getElementById: () => ({ scrollIntoView: noop }) } });
  Object.defineProperty(global, 'navigator', { configurable: true, value: { clipboard: { writeText: async url => { copied = url; } } } });
  global.IntersectionObserver = class { constructor(cb) { observe = cb; } observe() {} disconnect() { disconnected++; } };
  global.setTimeout = () => { toasts++; return 5; }; global.clearTimeout = () => { clearedToast++; };
  try {
    tree = draw(); await nodes(tree).find(n => n.props?.['aria-label'] === 'شارك المنيو').props.onClick();
    equal(copied, `https://barndaksa.com/menu/${menu.slug}`, 'Clipboard fallback shares the correct independent brand URL');
    check(words(draw()).includes('تم نسخ رابط المنيو'), 'Copy feedback is visible');
    global.navigator.share = async payload => { shared = payload; };
    await nodes(draw()).find(n => n.props?.['aria-label'] === 'شارك المنيو').props.onClick();
    equal(shared.url, copied, 'Native sharing has the same canonical brand destination');
    const oldToasts = toasts; global.navigator.share = async () => { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; };
    await nodes(draw()).find(n => n.props?.['aria-label'] === 'شارك المنيو').props.onClick(); equal(toasts, oldToasts, 'Cancelled native share is not shown as a failure');
    global.navigator.share = async () => { throw Error('unavailable'); };
    await nodes(draw()).find(n => n.props?.['aria-label'] === 'شارك المنيو').props.onClick(); check(words(draw()).includes('يمكنك مشاركة رابط المنيو من شريط العنوان'), 'Sharing failure offers a usable manual alternative');
    let focused = false, scrolled = false;
    nodes(draw()).find(n => n.type === 'input').props.ref.current = { focus() { focused = true; } };
    global.document.getElementById = () => ({ scrollIntoView(options) { scrolled = options.behavior === 'instant'; } });
    nodes(draw()).find(n => n.props?.['aria-label'] === 'ابحث في المنيو').props.onClick(); check(focused && scrolled, 'Search shortcut moves focus and honors reduced motion');
    const menuCleanups = h.effects().map(fn => fn()).filter(fn => typeof fn === 'function'); menuCleanups.forEach(fn => fn()); check(cleared > 0 && clearedToast > 0, 'Public refresh and share timeout clean up on unmount');

    const ch = hooks(); let reduced = false, selected;
    const Owner = load('components/menu/signature-menu.tsx', { ...mocks, react: ch.api, 'motion/react': { ...mocks['motion/react'], useReducedMotion: () => reduced } }).SignatureMenu;
    const Content = nodes(ch.draw(Owner, props)).find(n => n.type?.name === 'Spotlight').type;
    ch.reset();
    const offers = [{ id: 'a', title: 'FIRST', productId: 'coffee' }, { id: 'b', title: 'SECOND', productId: 'cake' }];
    const drawSpot = () => ch.draw(Content, { offers, menu, onSelect: id => { selected = id; } });
    let ct = drawSpot(); ch.refs()[0].current = {}; const disconnect = ch.effects()[0](); observe([{ isIntersecting: true }]);
    ct = drawSpot(); const stop = ch.effects()[1](); check(typeof interval === 'function', 'Visible carousel starts an interval'); interval();
    ct = drawSpot(); check(words(ct).includes('SECOND'), 'Carousel automatically advances');
    global.document.hidden = true; interval(); ct = drawSpot(); check(words(ct).includes('SECOND'), 'Hidden tab does not advance slides'); global.document.hidden = false;
    nodes(ct).find(n => n.props?.['aria-label'] === 'الاختيار السابق').props.onClick(); ct = drawSpot(); check(words(ct).includes('FIRST'), 'Previous control changes slide'); equal(ch.effects()[1](), undefined, 'Manual navigation pauses autoplay');
    nodes(ct).find(n => n.props?.['aria-label'] === 'اكتشف أمريكانو').props.onClick(); equal(selected, 'coffee', 'Featured CTA selects actual product');
    nodes(ct).find(n => n.props?.['aria-label'] === 'تشغيل تبديل الاختيارات').props.onClick(); ct = drawSpot(); ct.props.onFocusCapture(); ct = drawSpot(); equal(ch.effects()[1](), undefined, 'Keyboard focus pauses autoplay');
    ct.props.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: null }); ct = drawSpot(); ct.props.onMouseEnter(); ct = drawSpot(); equal(ch.effects()[1](), undefined, 'Hover pauses autoplay');
    ct.props.onMouseLeave(); reduced = true; ct = drawSpot(); equal(ch.effects()[1](), undefined, 'Reduced motion prevents automatic slide changes');
    check(!nodes(ct).some(n => n.props?.['aria-label'] === 'إيقاف تبديل الاختيارات'), 'Reduced motion removes unnecessary pause control');
    stop(); disconnect(); check(disconnected && cleared, 'Carousel observer and interval are released');
  } finally {
    global.setTimeout = timeout; global.clearTimeout = clearTimeoutOriginal;
    for (const [key, descriptor] of Object.entries(globals)) { if (descriptor) Object.defineProperty(global, key, descriptor); else delete global[key]; }
  }

  await checkRouteIsolation();
  await checkMediaCacheBoundary();
  const css = fs.readFileSync(path.join(root, 'components/menu/signature-menu.module.css'), 'utf8');
  require('lightningcss').transform({ filename: 'signature-menu.module.css', code: Buffer.from(css), cssModules: true });
  check(css.includes('prefers-reduced-motion: reduce') && css.includes('animation: none !important'), 'CSS has complete reduced-motion opt out');
  check(css.includes('repeat(2,minmax(0,1fr))') && css.includes('max-width: 360px') && css.includes('max-height: 700px'), 'Compact and short mobile layouts have explicit rules');
  check(css.includes(':focus-visible') && css.includes('min-height: 44px'), 'Keyboard focus and touch target styles are present');
  console.log(`PASS ${checks} signature menu identity, SSR, interactions, motion, routing and cache authorization checks`);
}

async function checkRouteIsolation() {
  const Signature = noop, Bistro = () => null, Loco = () => null, Together = () => null, French = () => null;
  let slug = menu.slug, program = { enabled: true, purchasesRequired: 6, rewardName: 'خصم 10%' }, gate = true, menuReads = 0;
  const route = load('app/menu/[slug]/page.tsx', {
    react: { ...React, cache: fn => fn },
    'next/navigation': { notFound() { throw Error('NOT_FOUND'); }, redirect(url) { throw Error('REDIRECT:' + url); } },
    '@/lib/data/standalone-menu': { getStandaloneMenu: async () => { menuReads++; return { ...menu, slug }; } },
    '@/lib/data/loyalty-cards': { getPublicLoyaltyProgramBySlug: async () => program },
    '@/lib/data/loyalty-landing': { getPublicLoyaltyLanding: async () => null },
    '@/lib/data/public-home-catalog': { isPublicHomeMenuSlug: async () => gate },
    '@/lib/data/gift-orders': { getGiftStoreSettings: async () => null },
    '@/components/menu/signature-menu': { SignatureMenu: Signature }, '@/components/menu/bistro-menu': { BistroMenu: Bistro },
    '@/components/menu/loco-menu': { LocoMenu: Loco }, '@/components/store/together-store': { TogetherStore: Together },
    '@/components/menu/french-corner-menu': { FrenchCornerMenu: French },
    '@/components/analytics/public-page-analytics': { PublicPageAnalytics: noop }, '@/components/menu/menu-auto-refresh': { MenuAutoRefresh: noop },
  });
  for (slug of Object.keys(signatureBrands)) {
    const tree = await route.default({ params: Promise.resolve({ slug }) });
    const view = nodes(tree).find(n => n.type === Signature && n.props.menu);
    equal(view.props.brand.key, signatureBrand(slug).key, 'Route chooses only the current identity');
    equal(view.props.loyalty, { purchasesRequired: 6, rewardName: 'خصم 10%' }, 'Route forwards enabled server program');
  }
  slug = 'rast'; let tree = await route.default({ params: Promise.resolve({ slug }) }); check(nodes(tree).some(n => n.type === Bistro), 'Legacy RAST route retains original presentation');
  slug = menu.slug; program = { ...program, enabled: false }; tree = await route.default({ params: Promise.resolve({ slug }) }); equal(nodes(tree).find(n => n.type === Signature && n.props.menu).props.loyalty, null, 'Disabled public program does not render reward promise');
  gate = false; const before = menuReads; await assert.rejects(route.default({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({ showcase: '1' }) }), /NOT_FOUND/); equal(menuReads, before, 'Unpublished showcase denies before catalog data access');
  let currentSlug = slug;
  const Loading = load('app/menu/[slug]/loading.tsx', { 'next/navigation': { useParams: () => ({ slug: currentSlug }) }, '@/components/menu/signature-menu-loading': { SignatureMenuLoading: Signature }, '@/components/menu/loco-menu-loading': { LocoMenuLoading: Loco }, '@/components/store/together-store-loading': { TogetherStoreLoading: Together } }).default;
  for (currentSlug of Object.keys(signatureBrands)) equal(Loading().props.brand.key, signatureBrand(currentSlug).key, 'Loading route follows exact same explicit identity');
  currentSlug = 'rast'; check(Loading().type !== Signature, 'Legacy RAST does not inherit new loading');
}

async function checkMediaCacheBoundary() {
  const cafeId = 'tenant-current', imagePath = `${cafeId}/product/photo.webp`;
  const fixture = { id: 'product', cafe_id: cafeId, category_id: 'category', name: 'Dish', description: '', price: 18, price_options: [], ingredients: [], available: true, image_storage_path: imagePath, image_url: null, image_gallery: [], gallery_storage_paths: [], media: [], promo: null, deleted_at: null };
  for (const slug of Object.keys(signatureBrands)) {
    for (const test of ['allowed', 'no-feature', 'paused-brand', 'hidden-category', 'unavailable', 'foreign-image']) {
      const signed = [], queries = [];
      const tables = {
        cafes: [{ id: cafeId, slug, name: 'Brand', status: test === 'paused-brand' ? 'paused' : 'active', business_category: 'cafes_coffee', deleted_at: null }],
        branches: [], cafe_settings: [{ cafe_id: cafeId, logo_url: null }],
        menu_categories: [{ id: 'category', cafe_id: cafeId, visible: test !== 'hidden-category', deleted_at: null, name: 'Food' }],
        menu_products: [{ ...fixture, available: test !== 'unavailable', image_storage_path: test === 'foreign-image' ? 'other-tenant/private.webp' : imagePath }],
      };
      const client = { from(table) { queries.push(table); let rows = [...tables[table]]; const q = { select() { return q; }, eq(key, value) { rows = rows.filter(r => r[key] === value); return q; }, is(key, value) { rows = rows.filter(r => (r[key] ?? null) === value); return q; }, not(key, _op, value) { rows = rows.filter(r => (r[key] ?? null) !== value); return q; }, order() { return q; }, range(start, end) { rows = rows.slice(start, end + 1); return q; }, maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); }, then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); } }; return q; } };
      const read = load('lib/data/standalone-menu.ts', {
        'server-only': {}, react: { cache: fn => fn }, 'next/cache': { unstable_cache: fn => fn },
        '@/lib/supabase/admin': { createAdminClient: () => client },
        '@/lib/data/feature-entitlements': { getCafeFeatureCodes: async () => test === 'no-feature' ? [] : ['menu'] },
        '@/lib/data/kath-menu-assets': { getKathMenuAssets: async paths => { signed.push(...paths); return paths.map(path => ({ path, signedUrl: `https://test.example/${path}` })); } },
        '@/lib/data/standalone-highlights': { getStandaloneHighlights: async () => ({ asOf: now, items: [] }) },
        '@/lib/cafe/published-logo': { publishedMenuLogo: async () => null },
        '@/lib/menu/contacts': { menuContacts: () => ({ instagramUrl: null, location: null }) },
        '@/lib/whatsapp/green-api': { isGreenApiConfigured: () => false },
      }).getStandaloneMenu;
      const result = await read(slug);
      if (test === 'allowed') equal(signed, [imagePath], 'Authorized published tenant uses stable signing');
      else equal(signed, [], `${test} never reaches cached private media signing`);
      if (test === 'no-feature' || test === 'paused-brand') { equal(result, null, 'Current package/status gate denies catalog'); check(!queries.includes('menu_products'), 'Denied brand never reads products'); }
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
