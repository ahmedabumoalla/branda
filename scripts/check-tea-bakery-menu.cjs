const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
let checks = 0;
const check = (value, message) => { assert(value, message); checks++; };
const equal = (value, expected, message) => { assert.deepEqual(value, expected, message); checks++; };
function load(file, mocks = {}) {
  const filename = path.resolve(root, file);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', source)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      return load(['.ts', '.tsx', '.js', ''].map(ext => base + ext).find(item => fs.existsSync(item)), mocks);
    }
    return require(name);
  }, exports);
  return exports;
}
const noop = () => null;
const image = ({ unoptimized, priority, fill, ...props }) => React.createElement('img', props);
const motion = new Proxy({}, { get: (_, tag) => ({ initial, animate, exit, transition, ...props }) => React.createElement(tag, props) });
const mocks = { './loyalty-link-content': { LoyaltyLinkContent: ({label}) => label }, 'next/image': image, 'next/link': ({ children, ...props }) => React.createElement('a', props, children), 'motion/react': { motion, AnimatePresence: React.Fragment, LayoutGroup: React.Fragment, useReducedMotion: () => true, useInView: () => false }, './bistro-menu': { ProductDetails: noop }, './menu-services': { MenuServices: noop }, '@/lib/analytics/public-tracking': { trackBrandEngagement: noop }, '@/lib/menu/menu-entry-scroll': { startMenuAtTop: noop, menuEntryUrl: (origin, slug) => `${origin}/menu/${slug}` } };
function nodes(tree) { return !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]; }
function words(tree) { return tree == null || typeof tree === 'boolean' ? '' : typeof tree !== 'object' ? String(tree) : Array.isArray(tree) ? tree.map(words).join('') : words(tree.props?.children); }
function hooks() {
  let slots = [], cursor = 0, effects = [];
  return { api: { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => slots[i] = typeof next === 'function' ? next(slots[i]) : next]; }, useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; }, useEffect(effect) { effects.push(effect); } }, draw(Component, props) { cursor = 0; effects = []; return Component(props); }, reset() { slots = []; cursor = 0; effects = []; }, effects: () => effects, refs: () => slots.filter(item => item && typeof item === 'object' && 'current' in item) };
}
const categoryNames = ['المشروبات', 'V60', 'الحلا', 'المخبوزات'];
const product = { id: 'coffee', categoryId: 'drinks', category: categoryNames[0], name: 'قهوة اليوم حار', description: 'صغير 8 ريال | وسط 10 ريال', price: 8, priceOptions: [8, 10], available: true, images: [], videos: [], ingredients: [] };
const categories = categoryNames.map((name, i) => ({ id: ['drinks', 'v60', 'desserts', 'bakery'][i], name, description: null }));
const menu = { slug: 'brand-9010051467ed', name: 'Tea & Bakery', logoUrl: null, description: '', loyaltyEnabled: true, categories, contacts: { feedbackEnabled: false, instagramUrl: null, location: null }, products: [product, { ...product, id: 'v60', categoryId: 'v60', category: 'V60', name: 'V60 عنب فاخر', price: 20, priceOptions: [20, 22], description: 'حار 20 ريال | بارد 22 ريال' }, { ...product, id: 'cake', categoryId: 'desserts', category: 'الحلا', name: 'كيكة مدريد', price: 24, priceOptions: [], description: 'كيكة تحت الطلب' }, { ...product, id: 'bread', categoryId: 'bakery', category: 'المخبوزات', name: 'كرواسون زعتر', price: 12, priceOptions: [], description: '' }, { ...product, id: 'hidden', name: 'Unavailable item', available: false }] };
const loyalty = { purchasesRequired: 6, rewardName: 'خصم 10%' };
const { TeaBakeryMenu } = load('components/menu/tea-bakery-menu.tsx', mocks);
const { TeaBakeryMenuLoading } = load('components/menu/tea-bakery-menu-loading.tsx', mocks);
const render = (data = menu, program = loyalty) => renderToStaticMarkup(React.createElement(TeaBakeryMenu, { menu: data, loyalty: program }));
async function main() {
  const html = render();
  check(html.includes('data-tea-bakery="true"'), 'Bespoke presentation is explicitly scoped');
  check(html.includes('/menu-art/tea-bakery/logo-v1.png'), 'Original identity is visible');
  check(html.includes('/menu-art/tea-bakery/hero-v1.webp'), 'Identity hero is preserved');
  for (const kind of ['drinks', 'v60', 'desserts', 'bakery']) check(!html.includes(`/menu-art/tea-bakery/${kind}-v1.webp`), `Large ${kind} category scene is absent from card catalog`);
  equal((html.match(/aria-haspopup="dialog"/g) || []).length, 4, 'Only available products are interactive');
  check(!html.includes('Unavailable item'), 'Unavailable catalog rows stay hidden');
  check(html.includes('8 / 10') && html.includes(product.description) && html.includes('حار 20 ريال | بارد 22 ريال'), 'Exact native variants and explicit labels survive rendering');
  check(!html.includes('placeholder-food'), 'Unknown future products never borrow an unrelated dish photo');
  checkProductImages();
  check(html.includes('اجمع 6 أختام واحصل على خصم 10%') && html.includes(`/loyalty/${menu.slug}?source=menu`), 'Actual loyalty terms and enrollment entry render');
  check(!render(menu, null).includes(`/loyalty/${menu.slug}`) && !render({ ...menu, loyaltyEnabled: false }).includes(`/loyalty/${menu.slug}`), 'Missing or disabled program hides loyalty entry');
  check(render(menu, { purchasesRequired: 3, rewardName: 'مكافأة أخرى' }).includes('اجمع 3 أختام واحصل على مكافأة أخرى'), 'Program copy follows live data instead of hardcoded six stamps');
  check(html.includes('tel:+966552220972') && html.includes('https://wa.me/966552220972'), 'Custom cake contact links use the confirmed phone');
  const loading = renderToStaticMarkup(React.createElement(TeaBakeryMenuLoading));
  check(loading.includes('/menu-art/tea-bakery/logo-v1.png') && loading.includes('role="status"') && loading.includes('aria-busy="true"'), 'Loading renders exact identity and accessible status');
  check(render({ ...menu, products: [] }).includes('القائمة قيد التجهيز'), 'Empty publication has a genuine empty state');
  const unknown = render({ ...menu, categories: [], products: [product] });
  check(unknown.includes('اختيارات أخرى') && unknown.includes(product.name), 'Uncategorized products remain accessible');
  const now = Date.now();
  const offered = render({ ...menu, highlights: { asOf: now, items: [{ id: 'sale', productId: product.id, title: 'عرض', discountPercent: 50, expiresAt: now + 60000 }] } });
  check(offered.includes('4 / 5') && offered.includes('<del>'), 'Published offer applies to every price option and shows original price');
  check(!render({ ...menu, highlights: { asOf: now, items: [{ id: 'sale', productId: product.id, title: 'عرض', discountPercent: 50, expiresAt: now - 1 }] } }).includes('4 / 5'), 'Expired offers cannot discount products');
  check(render({ ...menu, products: [{ ...product, price: 8.75, priceOptions: [] }] }).includes('8.75'), 'Price precision survives display');
  const h = hooks(), Dynamic = load('components/menu/tea-bakery-menu.tsx', { ...mocks, react: h.api }).TeaBakeryMenu;
  const props = { menu, loyalty };
  let tree = h.draw(Dynamic, props);
  const draw = () => tree = h.draw(Dynamic, props);
  const find = predicate => nodes(tree).find(predicate);
  const rows = () => nodes(tree).filter(node => node.props?.['aria-haspopup'] === 'dialog');
  equal(rows()[0].props['aria-describedby'], 'tea-description-coffee tea-price-coffee', 'Product action exposes both variant labels and price to assistive technology');
  check(nodes(tree).some(n => n.props?.id === 'tea-description-coffee') && nodes(tree).some(n => n.props?.id === 'tea-price-coffee'), 'Accessible product description targets exist');
  find(n => n.type === 'button' && words(n) === 'V60').props.onClick(); draw();
  equal(rows().map(n => n.props['aria-label']), ['تفاصيل V60 عنب فاخر'], 'Category click narrows the actual rendered products');
  check(find(n => n.type === 'button' && words(n) === 'V60').props['aria-pressed'], 'Selected category is announced');
  find(n => n.type === 'button' && words(n) === 'القائمة كاملة').props.onClick(); draw();
  find(n => n.type === 'input').props.onChange({ target: { value: 'قَهْوَة' } }); draw();
  equal(rows().length, 1, 'Normalized Arabic search works');
  find(n => n.type === 'input').props.onChange({ target: { value: 'missing' } }); draw();
  check(words(tree).includes('لم نجد ما يطابق بحثك'), 'Search empty state explains no results');
  find(n => n.type === 'button' && words(n) === 'عرض القائمة كاملة').props.onClick(); draw();
  equal(rows().length, 4, 'Reset restores all products and category state');
  find(n => n.type === 'select').props.onChange({ target: { value: 'high' } }); draw();
  equal(rows().map(n => n.props['aria-label']), ['تفاصيل كيكة مدريد', 'تفاصيل V60 عنب فاخر', 'تفاصيل كرواسون زعتر', 'تفاصيل قهوة اليوم حار'], 'Price sorting controls actual visible ordering');
  rows()[0].props.onClick(); draw();
  let details = find(n => n.props?.hideEmptyMedia);
  equal(details.props.product.id, 'cake', 'Native product button opens the selected details');
  details.props.browse(1); draw();
  details = find(n => n.props?.hideEmptyMedia);
  equal(details.props.product.id, 'v60', 'Detail navigation follows the current sorted ordering');
  details.props.close(); draw();
  check(!find(n => n.props?.hideEmptyMedia), 'Detail close clears selection');
  let copied;
  global.window = { location: { origin: 'https://barndaksa.com' }, setInterval: () => 12, clearInterval: noop };
  Object.defineProperty(global, 'navigator', { configurable: true, value: { clipboard: { writeText: async value => { copied = value; } } } });
  await find(n => n.props?.['aria-label'] === 'شارك القائمة').props.onClick(); draw();
  equal(copied, 'https://barndaksa.com/menu/brand-9010051467ed', 'Share copies the public menu URL');
  check(words(tree).includes('تم نسخ رابط القائمة'), 'Clipboard completion is announced');
  const branchTree = h.draw(Dynamic, { ...props, menu: { ...menu, branch: { id: 'branch', slug: 'annex', name: 'Annex' } } });
  await nodes(branchTree).find(n => n.props?.['aria-label'] === 'شارك القائمة').props.onClick();
  check(copied.endsWith('?branch=annex'), 'Share preserves a server-authorized branch');
  const cleanup = h.effects()[1](); check(typeof cleanup === 'function', 'Offer refresh interval cleans up on unmount'); cleanup();
  delete global.window;
  await checkRoute();
  checkDetails();
  const css = fs.readFileSync(path.join(root, 'components/menu/tea-bakery-menu.module.css'), 'utf8');
  const lightning = require('lightningcss');
  const compiled = lightning.transform({ filename: 'tea-bakery-menu.module.css', code: Buffer.from(css), minify: true, cssModules: true });
  check(compiled.code.length > 0, 'Scoped CSS compiles successfully');
  check(css.includes('(max-width: 380px)') && css.includes('(max-width: 760px)') && css.includes('prefers-reduced-motion'), 'Narrow screen layouts and reduced motion are explicit');
  const parsed = require('postcss').parse(css);
  function gridAt(width) {
    let result;
    parsed.walkRules(rule => {
      if (rule.selector !== '.productList') return;
      if (rule.parent.type === 'atrule') {
        const media = rule.parent.params;
        const min = /min-width:\s*(\d+)px/.exec(media), max = /max-width:\s*(\d+)px/.exec(media);
        if (min && width < Number(min[1]) || max && width > Number(max[1])) return;
      }
      rule.walkDecls('grid-template-columns', decl => { result = decl.value; });
    });
    return result;
  }
  for (const width of [360, 375, 390, 430, 760]) equal(gridAt(width), 'repeat(2, minmax(0, 1fr))', `${width}px keeps two readable product columns`);
  equal(gridAt(320), 'minmax(0, 1fr)', 'Very narrow phones get one product column');
  equal(gridAt(1024), 'repeat(3, minmax(0, 1fr))', 'Tablet/desktop uses three product columns');
  equal(gridAt(1440), 'repeat(4, minmax(0, 1fr))', 'Wide desktop uses four product columns');
  check(/\.price > bdi \{[^}]*font-family: var\(--tea-body\)/.test(css), 'Prices use readable body numerals');
  check(css.includes('height: 180px') && css.includes('container-type: inline-size') && css.includes('14cqw'), 'Compact mobile cover and single-line title sizing are preserved');
  const { getContrastRatio } = load('lib/cafe/color-contrast.ts');
  check(getContrastRatio('#756454', '#f8f1e4') >= 4.5, 'Muted menu text meets normal text contrast');
  check(getContrastRatio('#5b2230', '#f8f1e4') >= 7, 'Wine labels/buttons have strong contrast');
  for (const file of ['logo-v1.png', 'hero-v1.webp', 'drinks-v1.webp', 'v60-v1.webp', 'desserts-v1.webp', 'bakery-v1.webp']) check(fs.statSync(path.join(root, 'public/menu-art/tea-bakery', file)).size > 1000, `${file} exists locally`);
  check(fs.statSync(path.join(root, 'public/fonts/cormorant-garamond-latin.woff2')).size < 50000, 'Editorial font stays a small self-hosted asset');
  console.log(`Tea & Bakery menu: ${checks} assertions passed`);
}
function checkProductImages() {
  const { teaBakeryProductImages: images, teaBakeryProductMedia } = load('lib/menu/tea-bakery-products.ts');
  equal(Object.keys(images).length, 40, 'All forty imported products have individual art');
  equal(new Set(Object.values(images)).size, 40, 'No two product IDs reuse the same image');
  const crypto = require('node:crypto');
  for (const [id, url] of Object.entries(images)) {
    const sourceId = url.match(/^\/menu-art\/tea-bakery\/products\/([a-z0-9-]+)-v1\.webp$/)?.[1];
    check(sourceId, 'Product asset is a safe versioned static URL');
    let hex = crypto.createHash('sha256').update('tea-bakery-20261109/product/' + sourceId).digest('hex').slice(0, 32);
    hex = hex.slice(0, 12) + '4' + hex.slice(13, 16) + '8' + hex.slice(17);
    equal(id, [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-'), 'Artwork key matches canonical deterministic product UUID');
  }
  const id = '8cf4f555-cd52-429a-870f-0b8dbb72611a', mapped = { ...product, id };
  equal(teaBakeryProductMedia(mapped).images, [{ url: images[id], alt: product.name }], 'Missing catalog image gets its own mapped photo');
  equal(mapped.images, [], 'Client artwork enrichment never mutates source data');
  const uploaded = { ...mapped, images: [{ url: '/owner-upload.webp', alt: 'Owner photo' }] };
  equal(teaBakeryProductMedia(uploaded), uploaded, 'Future owner photograph wins over generated art');
  const video = { ...mapped, videos: [{ url: '/owner-video.mp4', alt: 'Owner video' }] };
  equal(teaBakeryProductMedia(video), video, 'Owner video remains primary when no image is uploaded');
  equal(teaBakeryProductMedia(product), product, 'Unknown products are never assigned another product photo');
  const all = render({ ...menu, products: Object.keys(images).map((key, index) => ({ ...product, id: key, name: `Product ${index}` })) });
  for (const url of Object.values(images)) check(all.includes(`src="${url}"`), 'Actual card markup includes its mapped product image');
  equal((all.match(/class="productPhoto"/g) || []).length, 40, 'All forty cards have their own image frame');
  const ownerHtml = render({ ...menu, products: [uploaded] });
  check(ownerHtml.includes('/owner-upload.webp') && !ownerHtml.includes(`src="${images[id]}"`), 'Rendered card actually prioritizes owner media');
  check(render({ ...menu, products: [video] }).includes('src="/owner-video.mp4"'), 'Owner video renders without autoplay');
  const h = hooks(), Dynamic = load('components/menu/tea-bakery-menu.tsx', { ...mocks, react: h.api }).TeaBakeryMenu;
  let tree = h.draw(Dynamic, { menu: { ...menu, products: [mapped] }, loyalty });
  nodes(tree).find(n => n.props?.['aria-haspopup'] === 'dialog').props.onClick();
  tree = h.draw(Dynamic, { menu: { ...menu, products: [mapped] }, loyalty });
  equal(nodes(tree).find(n => n.props?.hideEmptyMedia).props.product.images[0].url, images[id], 'Opening details receives the exact card photo');
  const Photo = nodes(tree).find(n => typeof n.type === 'function' && n.type.name === 'ProductPhoto').type;
  h.reset();
  let photo = h.draw(Photo, { product: uploaded });
  equal(nodes(photo).find(n => n.props?.src).props.src, '/owner-upload.webp', 'Photo initially displays owner upload');
  nodes(photo).find(n => n.props?.src).props.onError();
  photo = h.draw(Photo, { product: uploaded });
  equal(nodes(photo).find(n => n.props?.src).props.src, images[id], 'Failed owner upload falls back to matching original artwork');
  nodes(photo).find(n => n.props?.src).props.onError();
  photo = h.draw(Photo, { product: uploaded });
  check(nodes(photo).some(n => n.props?.src === '/menu-art/tea-bakery/logo-v1.png'), 'Failed art gets a neutral identity mark instead of another food');

}
async function checkRoute() {
  let current = menu, enabled = true, showcase = true;
  const Tea = () => null, Generic = () => null;
  const routeMocks = { react: { ...React, cache: fn => fn }, 'next/navigation': { notFound() { throw Error('NOT_FOUND'); }, redirect(url) { throw Error('REDIRECT:' + url); } }, '@/lib/data/standalone-menu': { getStandaloneMenu: async () => current }, '@/lib/data/loyalty-cards': { getPublicLoyaltyProgramBySlug: async () => ({ ...loyalty, enabled }) }, '@/lib/data/loyalty-landing': { getPublicLoyaltyLanding: async () => null }, '@/lib/data/public-home-catalog': { isPublicHomeMenuSlug: async () => showcase }, '@/lib/data/gift-orders': { getGiftStoreSettings: async () => null }, '@/components/menu/tea-bakery-menu': { TeaBakeryMenu: Tea }, '@/components/menu/signature-menu': { SignatureMenu: Generic }, '@/components/menu/bistro-menu': { BistroMenu: Generic }, '@/components/menu/loco-menu': { LocoMenu: Generic }, '@/components/menu/french-corner-menu': { FrenchCornerMenu: Generic }, '@/components/store/together-store': { TogetherStore: Generic }, '@/components/analytics/public-page-analytics': { PublicPageAnalytics: noop }, '@/components/menu/menu-auto-refresh': { MenuAutoRefresh: noop } };
  const route = load('app/menu/[slug]/page.tsx', routeMocks).default;
  const props = { params: Promise.resolve({ slug: menu.slug }) };
  let tree = await route(props);
  equal(nodes(tree).find(n => n.type === Tea).props.loyalty, loyalty, 'Exact server slug dispatches bespoke menu and live program');
  enabled = false; tree = await route(props);
  equal(nodes(tree).find(n => n.type === Tea).props.loyalty, null, 'Server disables inactive loyalty program');
  current = { ...menu, slug: 'other-brand' }; tree = await route(props);
  check(!nodes(tree).some(n => n.type === Tea), 'No other tenant gets Tea presentation');
  current = menu; tree = await route({ ...props, searchParams: Promise.resolve({ showcase: '1' }) });
  equal(tree.props.inert, true, 'Showcase remains inert');
  showcase = false;
  await assert.rejects(route({ ...props, searchParams: Promise.resolve({ showcase: '1' }) }), /NOT_FOUND/); checks++;
  current = null;
  await assert.rejects(route(props), /NOT_FOUND/); checks++;
  const Loading = load('app/menu/[slug]/loading.tsx', { ...mocks, 'next/navigation': { useParams: () => ({ slug: menu.slug }), useSearchParams: () => new URLSearchParams() }, '@/components/menu/tea-bakery-menu-loading': { TeaBakeryMenuLoading } }).default;
  check(renderToStaticMarkup(React.createElement(Loading)).includes('/menu-art/tea-bakery/logo-v1.png'), 'Actual route loading dispatches matching Tea logo');
}
function checkDetails() {
  const detailMocks = { ...mocks };
  for (const [file, exports] of Object.entries({ './menu-motion': ['DishMotion'], './rast-connect': ['RastConnect'], './rast-loyalty-entry': ['RastLoyaltyEntry'], './kath-loyalty-entry': ['KathLoyaltyEntry'], './product-offer-details': ['ProductOfferBadge', 'ProductOfferDetails'], './shahi-menu-scenes': ['ShahiHero', 'ShahiLoyalty', 'ShahiClosing'], './taza-menu-scenes': ['TazaHero', 'TazaLoyalty', 'TazaClosing'], './deli-menu-scenes': ['DeliBackground', 'DeliHero', 'DeliLoyalty', 'DeliOffers', 'DeliOrigins', 'DeliClosing', 'DeliProductImage'] })) detailMocks[file] = Object.fromEntries(exports.map(key => [key, noop]));
  const { ProductDetails } = load('components/menu/bistro-menu.tsx', detailMocks);
  const props = { product, products: [product], close: noop, browse: noop, position: 0, total: 1, hideEmptyMedia: true };
  const html = renderToStaticMarkup(React.createElement(ProductDetails, props));
  check(html.includes('data-no-media="true"') && !html.includes('detailMedia'), 'Tea imageless dialog omits media column entirely');
  check(html.includes(product.description) && html.includes('8 / 10'), 'Imageless dialog retains exact variant labels and all prices');
  check(renderToStaticMarkup(React.createElement(ProductDetails, { ...props, hideEmptyMedia: false })).includes('detailMedia'), 'Existing menu default media behavior is unchanged');
  check(renderToStaticMarkup(React.createElement(ProductDetails, { ...props, product: { ...product, images: [{ url: '/real-product.webp', alt: product.name }] } })).includes('/real-product.webp'), 'Future real owner product media remains visible');
  const h = hooks(), Dynamic = load('components/menu/bistro-menu.tsx', { ...detailMocks, react: h.api }).ProductDetails;
  let closes = 0, restored = 0, shown = 0, cancelled = 0;
  const tree = h.draw(Dynamic, { ...props, close: () => closes++ });
  h.refs()[0].current = { showModal() { shown++; }, close() { cancelled++; } };
  global.document = { activeElement: { focus() { restored++; } }, body: { style: { overflow: 'auto' } } };
  const cleanup = h.effects()[0]();
  equal(shown, 1, 'Details uses native modal focus containment');
  let prevented = false; tree.props.onCancel({ preventDefault() { prevented = true; } });
  check(prevented && closes === 1, 'Escape closes via React selection state');
  cleanup();
  check(cancelled === 1 && restored === 1 && global.document.body.style.overflow === 'auto', 'Closing restores original focus and scrolling');
  delete global.document;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
