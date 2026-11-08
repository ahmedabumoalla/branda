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
const { BrandLoyaltyEntry } = load('components/menu/brand-loyalty-entry.tsx', mocks);
mocks['./brand-loyalty-entry'] = { BrandLoyaltyEntry };
const { signatureBrands, signatureBrand, signatureAsset, signatureBranchHref } = load('lib/menu/signature-brands.ts');
const { defaultSignatureBrand, usesDefaultSignatureMenu, DEFAULT_SIGNATURE_HERO } = load('lib/menu/default-signature.ts');
const { getContrastRatio } = load('lib/cafe/color-contrast.ts');
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
  const { hulmPhotoFraming, HULM_MENU_SLUG } = load('lib/menu/hulm-framing.ts');
  const farId = '5e17c4d7-2530-416c-883f-822bb536c9c8';
  const farUrl = 'https://example.test/media/five-restaurants-hulm-20261103-88a0bffbbeb0ee5c.webp';
  equal(hulmPhotoFraming(HULM_MENU_SLUG, farId, farUrl), { '--hulm-photo-scale': 2.4, '--hulm-photo-origin-x': '43.42%', '--hulm-photo-origin-y': '63.5%' }, 'Reviewed distant photo has its own close framing');
  equal(hulmPhotoFraming('another-brand', farId, farUrl), undefined, 'Framing cannot affect another tenant');
  equal(hulmPhotoFraming(HULM_MENU_SLUG, farId, 'https://example.test/new-owner-photo.webp'), undefined, 'New owner uploads retain their own framing');
  equal(hulmPhotoFraming(HULM_MENU_SLUG, farId, '%bad'), undefined, 'Malformed media URL safely retains default framing');
  const hulmMenu = { ...menu, slug: HULM_MENU_SLUG, products: [{...product, id: farId, images: [{url: farUrl, alt: product.name}]}] };
  const hulmRender = renderToStaticMarkup(React.createElement(SignatureMenu, { menu: hulmMenu, brand: signatureBrand(HULM_MENU_SLUG), loyalty }));
  check(hulmRender.includes('--hulm-photo-scale:2.4'), 'Actual Hulm product card receives reviewed framing');
  const replacedRender = renderToStaticMarkup(React.createElement(SignatureMenu, {menu:{...hulmMenu,products:[{...hulmMenu.products[0],images:[{url:'https://example.test/new-owner-photo.webp',alt:product.name}]}]},brand:signatureBrand(HULM_MENU_SLUG),loyalty}));
  check(!replacedRender.includes('--hulm-photo-scale'), 'Actual replacement card is not accidentally zoomed');

  await checkDefaultPresentation();
  equal(Object.keys(signatureBrands).length, 15, 'Fifteen bespoke brand identities are registered alongside the automatic new-account default');
  const dabab = signatureBrand('brand-8ad185ee82e3');
  equal(dabab.key, 'dabab', 'Dabab selects its own confirmed account');
  equal(signatureAsset(dabab.hero, true), '/menu-art/dabab/dabab-hero-mobile-v2.webp', 'Dabab has its own refreshed mobile drinks hero');
  equal(signatureAsset(dabab.hero), '/menu-art/dabab/dabab-hero-v2.webp', 'Dabab desktop uses the refreshed drinks artwork');
  equal(signatureAsset(dabab.logo), '/menu-art/dabab/dabab-logo-v2.webp', 'Dabab resolves the actual wheat identity artwork');
  const dababMenu = { ...menu, slug: 'brand-8ad185ee82e3', name: 'ضباب', logoUrl: null, highlights: undefined, products: [product, { ...product, id: 'no-photo', name: 'اختيار بلا صورة', images: [] }] };
  const dababHtml = render({ menu: dababMenu, brand: dabab, loyalty });
  equal((dababHtml.match(/src="\/menu-art\/dabab\/dabab-logo-v2.webp"/g) || []).length, 4, 'Dabab original mark appears in header, hero, compact loyalty illustration and footer');
  check(dababHtml.match(/<header[\s\S]*?<\/header>/)[0].includes(signatureAsset(dabab.logo)), 'Dabab header visibly carries its own mark');
  check(dababHtml.includes('بطعم مختلف') && dababHtml.includes('نكهات منعشة') && dababHtml.includes('اختر نكهة لحظتك'), 'Dabab copy describes its current drinks catalog');
  check(!dababHtml.includes('خالية من الكحول') && !dababHtml.includes('بدون كحول') && !dababHtml.includes('zero-proof'), 'Dabab interface adds no unrequested beverage disclaimer');
  const dababLoading = renderToStaticMarkup(React.createElement(SignatureMenuLoading, { brand: dabab }));
  check(dababLoading.includes(signatureAsset(dabab.logo)) && dababLoading.includes(dabab.welcome), 'Dabab loading uses the same real mark and drinks welcome');
  check(dababHtml.includes('data-brand-placeholder="dabab" aria-hidden="true"') && !dababHtml.includes('الصورة غير متاحة'), 'Intentionally absent Dabab photographs get a decorative branded placeholder');
  check(dababHtml.includes(product.images[0].url) && !dababHtml.includes('data-photo-disclosure'), 'Original Dabab photographs remain original and are not labeled generated');
  const dababBranches = [
    { id: 'dabab-bar', slug: 'bar', name: 'بار ضباب' },
    { id: 'dabab-coffee', slug: 'coffee', name: 'فرع الكوفي' },
    { id: 'dabab-hospital', slug: 'hospital', name: 'فرع المستشفى' },
  ];
  equal(signatureBrand(dababMenu.slug, 'bar'), dabab, 'Primary bar retains the exact approved Dabab presentation');
  equal(signatureBrand(dababMenu.slug, 'unknown'), dabab, 'Unknown branch names do not invent a presentation');
  equal(signatureBrand(menu.slug, 'hospital'), signatureBrand(menu.slug), 'A branch name cannot alter another brand identity');
  equal(signatureBranchHref(dababMenu.slug, 'coffee', 'showcase=1&q=latte&tag=hot&tag=cold&branch=bar'), `/menu/${dababMenu.slug}?showcase=1&q=latte&tag=hot&tag=cold&branch=coffee`, 'Branch links replace only the branch and preserve showcase, search and repeated query values');
  check(!dababHtml.includes('aria-label="اختر فرع ضباب"'), 'Unbranched Dabab has no empty branch navigation');
  const branchQuery = 'showcase=1&q=latte&branch=bar';
  const barHtml = render({ menu: { ...dababMenu, branch: dababBranches[0], branches: dababBranches }, brand: signatureBrand(dababMenu.slug, 'bar'), loyalty, branchQuery });
  check(!barHtml.includes('data-signature-variant') && barHtml.includes(signatureAsset(dabab.hero)), 'Branched bar retains its current hero and has no new design variant');
  for (const selectedBranch of dababBranches.slice(1)) {
    const branchBrand = signatureBrand(dababMenu.slug, selectedBranch.slug);
    const branchMenu = { ...dababMenu, branch: selectedBranch, branches: dababBranches, products: [{ ...product, description: '' }] };
    const html = render({ menu: branchMenu, brand: branchBrand, loyalty, branchQuery });
    equal(branchBrand.key, 'dabab', `${selectedBranch.slug} keeps the shared Dabab identity`);
    equal(branchBrand.variant, selectedBranch.slug, `${selectedBranch.slug} selects its scoped presentation`);
    equal(signatureAsset(branchBrand.hero), `/menu-art/dabab/dabab-${selectedBranch.slug}-hero-v1.webp`, `${selectedBranch.slug} uses its agreed desktop asset name`);
    equal(signatureAsset(branchBrand.hero, true), `/menu-art/dabab/dabab-${selectedBranch.slug}-hero-mobile-v1.webp`, `${selectedBranch.slug} uses its agreed mobile asset name`);
    check(html.includes(`data-signature-variant="${selectedBranch.slug}"`) && html.includes(branchBrand.headline) && html.includes(branchBrand.catalog), `${selectedBranch.slug} renders branch-specific heading and catalog copy`);
    check(html.includes('data-has-branches="true"') && html.includes('aria-label="اختر فرع ضباب"'), `${selectedBranch.slug} exposes branch navigation outside the services dialog`);
    const nav = html.match(/<nav class="branchNavigation"[\s\S]*?<\/nav>/)[0];
    equal((nav.match(/aria-current="page"/g) || []).length, 1, `${selectedBranch.slug} identifies exactly one selected branch`);
    check(nav.includes(`branch=${selectedBranch.slug}" aria-current="page"`) && dababBranches.every(branch => nav.includes(branch.name)), `${selectedBranch.slug} highlights its actual branch among all three choices`);
    check(nav.includes('showcase=1&amp;q=latte&amp;branch=bar') && nav.includes('branch=coffee') && nav.includes('branch=hospital'), `${selectedBranch.slug} preserves preview/search context in all branch links`);
    equal(html.match(/<section id="signature-loyalty"[\s\S]*?<\/section>/)[0], dababHtml.match(/<section id="signature-loyalty"[\s\S]*?<\/section>/)[0], `${selectedBranch.slug} preserves the exact approved compact loyalty entry and shared enrollment`);
    equal((html.match(/src="\/menu-art\/dabab\/dabab-logo-v2.webp"/g) || []).length, 4, `${selectedBranch.slug} retains the real wheat mark in all four surfaces`);
    check(!html.includes('maps.app.goo.gl/zC8ws49ka6KNMzY86'), `${selectedBranch.slug} never sends visitors to the unverified bar location`);
    check(!html.includes('data-photo-disclosure') && !html.includes('صورة توضيحية'), `${selectedBranch.slug} adds no unrequested image approximation copy to blank catalog descriptions`);
    check(!render({ menu: { ...branchMenu, loyaltyEnabled: false }, brand: branchBrand, loyalty }).includes('id="signature-loyalty"'), `${selectedBranch.slug} preserves the disabled loyalty gate`);
  }
  check(!render({ menu: { ...menu, branches: dababBranches, branch: dababBranches[1] } }).includes('aria-label="اختر فرع ضباب"'), 'Dabab branch selector never appears for another brand');
  check(dababHtml.includes('/loyalty/brand-8ad185ee82e3?source=menu'), 'Dabab keeps its own existing loyalty enrollment URL');
  const dababReward = 'كوب آيس تي & كركديه . مجاناً.';
  const dababLoyaltySection = render({ menu: dababMenu, brand: dabab, loyalty: { purchasesRequired: 6, rewardName: dababReward } }).match(/<section id="signature-loyalty"[\s\S]*?<\/section>/)[0];
  check(dababLoyaltySection.includes('data-loyalty-layout="compact"'), 'Dabab uses the requested compact reference composition');
  check(dababLoyaltySection.includes('class="cardStack" aria-hidden="true"') && dababLoyaltySection.includes('class="cardBack"') && dababLoyaltySection.includes('class="cardFront"'), 'Small stacked cards are decorative and hidden from assistive technology');
  check(dababLoyaltySection.includes(signatureAsset(dabab.logo)), 'Compact card illustration carries the actual Dabab wheat logo');
  check(!dababLoyaltySection.includes('data-logo-emphasis') && !dababLoyaltySection.includes('class="logoPlate"') && dababLoyaltySection.includes('class="cardTop"'), 'Approved Dabab banner keeps its original card composition');
  check(dababLoyaltySection.includes('بطاقتك معك في كل زيارة') && dababLoyaltySection.includes('لأنك من أهل ضباب'), 'Compact banner uses the requested reference heading and a Dabab-specific eyebrow');
  check(!dababLoyaltySection.includes('data-loyalty-stamp') && !dababLoyaltySection.includes('dabab-loyalty-reward') && !dababLoyaltySection.includes('class="loyaltyBenefits"'), 'Compact promotion has no expanded stamp grid, reward details or tall benefits list');
  check(dababLoyaltySection.includes('حمّل بطاقتك') && dababLoyaltySection.includes('aria-label="حمّل بطاقة ولاء ضباب"'), 'One clear labeled download action introduces the card');
  equal([...dababLoyaltySection.matchAll(/<a[^>]+href="([^"]+)"/g)].map(match => match[1]), ['/loyalty/brand-8ad185ee82e3?source=menu'], 'The complete compact banner is one link to the existing Dabab enrollment flow');
  for (const required of [4, 12]) {
    const changedProgram = render({ menu: dababMenu, brand: dabab, loyalty: { purchasesRequired: required, rewardName: 'مكافأة المالك الجديدة' } }).match(/<section id="signature-loyalty"[\s\S]*?<\/section>/)[0];
    equal(changedProgram, dababLoyaltySection, 'Compact introduction leaves program details on the linked card regardless of owner changes');
  }
  check(!render({ menu: { ...dababMenu, loyaltyEnabled: false }, brand: dabab, loyalty }).includes('id="signature-loyalty"'), 'Dabab compact banner stays hidden when the brand loyalty feature is disabled');
  const loyaltyEvents = [];
  const LoyaltyInteractive = load('components/menu/brand-loyalty-entry.tsx', { ...mocks, '@/lib/analytics/public-tracking': { trackBrandEngagement: (...args) => loyaltyEvents.push(args) } }).BrandLoyaltyEntry;
  const loyaltyTree = LoyaltyInteractive({ slug: dababMenu.slug, name: dababMenu.name, logoUrl: '/own-logo.webp' });
  const loyaltyEntry = nodes(loyaltyTree).find(node => node.props?.className === 'entry');
  loyaltyEntry.props.onClick();
  loyaltyEntry.props.onAuxClick({ button: 0 });
  equal(loyaltyEvents, [[dababMenu.slug, 'menu_loyalty_click']], 'Primary click tracks the current brand once without auxiliary left-click duplication');
  loyaltyEntry.props.onAuxClick({ button: 1 });
  equal(loyaltyEvents.length, 2, 'Middle-click enrollment retains brand engagement tracking');
  check(nodes(loyaltyTree).some(node => node.props?.className === 'action' && node.props?.label === 'حمّل بطاقتك'), 'Compact action reuses the existing navigation pending-state component');
  const salonEntry = renderToStaticMarkup(React.createElement(BrandLoyaltyEntry, { slug: 'salon-owner', name: 'صالون المالك', source: 'salon', logoUrl: '/salon-own.webp', palette: { background: '#123456', foreground: '#ffffff', cardBackground: '#fffaf1', cardForeground: '#123456' } }));
  check(salonEntry.includes('/loyalty/salon-owner?source=salon') && salonEntry.includes('/salon-own.webp'), 'Shared banner preserves salon source attribution and owner artwork');
  check(salonEntry.includes('--loyalty-entry-background:#123456') && salonEntry.includes('--loyalty-entry-card-background:#fffaf1'), 'Shared banner carries the caller brand palette');
  const whiteLogoEntry = renderToStaticMarkup(React.createElement(BrandLoyaltyEntry, { slug: 'white-logo', name: 'علامة بشعار أبيض', logoUrl: '/white.webp', palette: { cardBackground: '#123456', cardForeground: '#ffffff', actionBackground: '#fffaf1', actionForeground: '#241610' } }));
  check(whiteLogoEntry.includes('--loyalty-entry-card-background:#123456') && whiteLogoEntry.includes('--loyalty-entry-action-background:#fffaf1') && whiteLogoEntry.includes('--loyalty-entry-action-foreground:#241610'), 'A dark face for a white logo remains independent of the readable cream action');
  check(whiteLogoEntry.includes('class="cardTop"') && !whiteLogoEntry.includes('data-logo-emphasis'), 'Shared callers preserve the approved original card by default');
  const emphasizedEntry = renderToStaticMarkup(React.createElement(BrandLoyaltyEntry, { slug: 'wide-logo', name: 'علامة بشعار أفقي', logoUrl: '/wide-logo.webp', logoEmphasis: true, palette: { cardBackground: '#123456', actionBackground: '#fffaf1', actionForeground: '#241610' } }));
  check(emphasizedEntry.includes('data-logo-emphasis="true"') && emphasizedEntry.includes('class="logoPlate"') && !emphasizedEntry.includes('class="cardTop"'), 'Opt-in logo emphasis removes the duplicated tiny name and icon');
  check(emphasizedEntry.includes('width="94" height="88"') && emphasizedEntry.includes('/wide-logo.webp') && emphasizedEntry.includes('class="cardStack" aria-hidden="true"'), 'Framed card enlarges original artwork without changing or recropping it');
  equal((emphasizedEntry.match(/class="cardCaption"/g) || []).length, 1, 'Emphasized card keeps only one loyalty caption');
  check(emphasizedEntry.includes('/loyalty/wide-logo?source=menu') && emphasizedEntry.includes('aria-label="حمّل بطاقة ولاء علامة بشعار أفقي"') && emphasizedEntry.includes('حمّل بطاقتك'), 'Logo emphasis preserves the accessible download destination');
  const emphasizedTree = LoyaltyInteractive({ slug: 'wide-logo', name: 'علامة بشعار أفقي', logoUrl: '/wide-logo.webp', logoEmphasis: true });
  nodes(emphasizedTree).find(node => node.props?.className === 'entry').props.onClick();
  equal(loyaltyEvents.at(-1), ['wide-logo', 'menu_loyalty_click'], 'Emphasized card preserves current-brand click tracking');
  check(nodes(emphasizedTree).some(node => node.props?.className === 'action' && node.props?.label === 'حمّل بطاقتك'), 'Emphasized card preserves the existing navigation pending state');
  const noLogoEntry = renderToStaticMarkup(React.createElement(BrandLoyaltyEntry, { slug: 'new-brand', name: 'علامة جديدة' }));
  check(noLogoEntry.includes('class="monogram"') && !noLogoEntry.includes('<img') && !noLogoEntry.includes('barndaksa-logo'), 'Brand without a logo receives its own initials rather than another identity');
  check(dababHtml.includes('maps.app.goo.gl/zC8ws49ka6KNMzY86') && dababHtml.includes('موقع ضباب'), 'Dabab links only its verified official location');
  check(!render({ menu: dababMenu, brand: dabab, loyalty: null }).includes('id="signature-loyalty"'), 'Dabab never invents a server loyalty program');
  check(render({ menu: { ...dababMenu, logoUrl: '/owner-dabab.webp' }, brand: dabab }).includes('/owner-dabab.webp'), 'Dabab respects future owner logo uploads');
  const dababIllustrated = { ...dababMenu, products: [{ ...product, description: 'صورة توضيحية وقد يختلف التقديم الفعلي' }, { ...product, id: 'dabab-original', name: 'صورة أصلية' }] };
  equal((render({ menu: dababIllustrated, brand: dabab }).match(/data-photo-disclosure/g) || []).length, 1, 'Only generated Dabab photos carry the illustration disclosure');
  const et1 = signatureBrand('brand-01a9154f01bc');
  equal(et1.key, 'et1', 'ET1 selects only its existing account identity');
  equal(signatureAsset(et1.logo), '/menu-art/et1/et1-logo-v1.webp', 'ET1 uses the supplied original vector logo rendition');
  equal(signatureAsset(et1.hero, true), '/menu-art/et1/et1-hero-mobile-v1.webp', 'ET1 has its own mobile hero');
  const et1Menu = { ...menu, slug: 'brand-01a9154f01bc', name: 'ET1', logoUrl: null, products: [{ ...product, description: 'صورة توضيحية وقد يختلف التقديم الفعلي' }, { ...product, id: 'original-et1', name: 'صورة أصلية' }] };
  const et1Html = render({ menu: et1Menu, brand: et1, loyalty });
  check(et1Html.includes('data-loyalty-layout="compact"') && et1Html.includes('حمّل بطاقتك'), 'ET1 adopts the same compact loyalty composition');
  for (const slug of ['brand-01a9154f01bc', 'brand-067febfb04db']) {
    const brand = signatureBrand(slug);
    const heading = render({ brand }).match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]+>/g, '');
    equal(heading, `${brand.headline} ${brand.emphasis}`, 'Arabic headline parts retain a readable word boundary');
  }
  equal((et1Html.match(/data-photo-disclosure/g) || []).length, 1, 'ET1 discloses generated images while preserving original-photo labeling');
  check(et1Html.includes('/loyalty/brand-01a9154f01bc?source=menu') && !et1Html.includes('خصم 10%'), 'ET1 retains its enrollment destination and leaves reward rules on the linked card');
  check(!et1Html.includes('maps.app.goo.gl') && !et1Html.includes('موقع المطعم'), 'ET1 does not borrow another brand location');
  check(!render({ menu: et1Menu, brand: et1, loyalty: null }).includes('id="signature-loyalty"'), 'ET1 does not invent a loyalty program when the server returns none');
  check(!render({ menu: { ...et1Menu, loyaltyEnabled: false }, brand: et1, loyalty }).includes('id="signature-loyalty"'), 'ET1 hides loyalty when the package service is disabled');
  const et1Owner = render({ menu: { ...et1Menu, logoUrl: '/later-et1-logo.webp' }, brand: et1, loyalty: { purchasesRequired: 4, rewardName: 'مكافأة معدلة' } });
  check(et1Owner.includes('/later-et1-logo.webp') && !et1Owner.includes(signatureAsset(et1.logo)), 'ET1 preserves a later owner logo upload');
  check(et1Owner.includes('data-loyalty-layout="compact"') && !et1Owner.includes('مكافأة معدلة') && !et1Owner.includes('خصم 10%'), 'ET1 promotion remains free of hardcoded program rules');
  const damascus = signatureBrand('brand-067febfb04db');
  equal(damascus.key, 'damascus', 'Qalat Damascus selects its user-requested bespoke identity');
  equal(signatureAsset(damascus.logo), '/menu-art/damascus/damascus-logo-v1.webp', 'Corrected citadel and ribbon mark is used');
  const damascusHtml = render({ menu: { ...menu, slug: 'brand-067febfb04db', logoUrl: null, loyaltyEnabled: false, products: [{ ...product, description: 'صورة توضيحية وقد يختلف التقديم الفعلي' }] }, brand: damascus, loyalty: null });
  check(damascusHtml.includes('data-photo-disclosure') && damascusHtml.includes('صورة توضيحية'), 'Generated food images are explicitly disclosed');
  check(damascusHtml.includes('maps.app.goo.gl/Pa3L9vDccaSvSf4j9') && damascusHtml.includes('موقع المطعم'), 'User-supplied restaurant location is visible');
  check(!damascusHtml.includes('id="signature-loyalty"'), 'No loyalty program is invented for this account');
  const damascusOwner = render({ menu: { ...menu, slug: 'brand-067febfb04db', logoUrl: '/later-damascus-logo.webp' }, brand: damascus });
  check(damascusOwner.includes('/later-damascus-logo.webp') && !damascusOwner.includes(signatureAsset(damascus.logo)), 'Later owner logo upload is preserved');
  const newAccounts = { 'brand-96f3dda4f1ea': 'hulm', 'brand-6c954762020f': 'arabi', 'brand-4596b275e3d4': 'masala', 'brand-5afbbf87fa56': 'nineteen', 'brand-61c65e74315d': 'rayhan' };
  for (const [slug, key] of Object.entries(newAccounts)) {
    const brand = signatureBrand(slug);
    equal(brand.key, key, 'Each imported restaurant resolves only its verified tenant identity');
    equal(signatureAsset(brand.logo), `/menu-art/five-restaurants/${key}-logo-v1.webp`, 'Original color logo uses the imported identity assets');
    equal(signatureAsset(brand.hero, true), `/menu-art/five-restaurants/${key}-hero-mobile-v${key === 'arabi' ? 2 : 1}.webp`, 'Mobile hero resolves to dedicated artwork');
    const loading = renderToStaticMarkup(React.createElement(SignatureMenuLoading, { brand }));
    check(loading.includes(brand.welcome), 'New restaurant loading carries its own welcome');
    const html = render({ menu: { ...menu, slug, name: brand.name, logoUrl: '/owner-updated-logo.webp' }, brand });
    check(html.includes('/owner-updated-logo.webp') && !html.includes(signatureAsset(brand.logo)), 'Owner logo updates remain visible in the new menu');
  }
  for (const unknown of ['rast', 'black-drop', 'once', 'box-bbq', 'brand-871ec6e243c0', '__proto__', 'constructor']) equal(signatureBrand(unknown), null, 'Unrelated and inherited object names do not select a brand');
  for (const [slug, brand] of Object.entries(signatureBrands)) {
    const html = render({ menu: { ...menu, slug, name: brand.name, logoUrl: null }, brand });
    check(html.includes(`data-signature="${brand.key}"`), `${slug} identity is selected explicitly`);
    check(html.includes(signatureAsset(brand.hero)) && html.includes(signatureAsset(brand.hero, true)), 'Desktop and mobile artwork belong to selected brand');
    check(html.includes(signatureAsset(brand.logo)), 'Central identity uses the brand original artwork');
    check(html.includes(`/loyalty/${slug}?source=menu`), 'Loyalty destination remains tenant scoped');
    check(html.includes('data-loyalty-entry="true"') && html.includes('data-loyalty-layout="compact"'), 'Every bespoke signature brand receives the shared compact banner');
    const lightLogo = ['arabi', 'masala', 'damascus', 'hadiqa', 'box'].includes(brand.key);
    check(html.includes('--loyalty-entry-card-background:' + (lightLogo ? 'var(--brand)' : '#fffaf1')), 'Each original logo receives a contrasting card face');
    equal(html.includes('data-logo-emphasis="true"'), lightLogo || ['korma', 'rast', 'sadeem'].includes(brand.key), 'Only reviewed low-clarity signature logos receive the larger framed card');
    check(html.includes('--loyalty-entry-action-background:#fffaf1') && html.includes('--loyalty-entry-action-foreground:#241610'), 'Every signature banner keeps a cream action with contrasting dark text');
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
  const korma = signatureBrand('brand-b042ca7f1a93');
  equal(korma.key, 'korma', 'Korma presentation is scoped to the exact brand');
  const kormaHtml = render({ brand: korma, menu: { ...menu, slug: 'brand-b042ca7f1a93', name: korma.name, logoUrl: null } });
  check(kormaHtml.includes('data-loyalty-layout="compact"') && kormaHtml.includes('لأنك من أهل KORMA'), 'Korma uses the compact banner with its own name');
  check(kormaHtml.includes('نكهات من قلب الهند') && kormaHtml.includes('سفرتك تبدأ هنا'), 'Korma has restaurant-specific introduction and catalog');
  equal(signatureAsset(korma.hero, true), '/menu-art/korma/korma-hero-mobile-v1.webp', 'Korma mobile artwork is independent');
  const alpha = await require('sharp')(path.join(root, 'public', signatureAsset(korma.logo))).metadata();
  check(alpha.hasAlpha, 'Korma logo retains transparency');
  let html = render();
  const garden = signatureBrand('brand-dcf7296f722c');
  equal(garden.key, 'hadiqa', 'Alhadiqa identity is selected by its exact tenant slug');
  equal(signatureAsset(garden.logo), '/menu-art/hadiqa/hadiqa-logo-v1.webp', 'Alhadiqa retains its separate original logo asset');
  equal(signatureAsset(garden.hero, true), '/menu-art/hadiqa/hadiqa-hero-mobile-v1.webp', 'Alhadiqa supplies dedicated mobile art');
  const gardenHtml = render({ brand: garden, menu: { ...menu, slug: 'brand-dcf7296f722c', name: garden.name, logoUrl: null } });
  check(gardenHtml.includes('data-loyalty-layout="compact"') && !gardenHtml.includes('lucide-coffee'), 'Restaurant loyalty uses the compact card artwork without imaginary visit stamps');
  check(gardenHtml.includes('من مطبخ الحديقة') && gardenHtml.includes('/loyalty/brand-dcf7296f722c?source=menu'), 'Restaurant catalog and its existing loyalty destination are rendered together');
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
  check(html.includes('data-loyalty-layout="compact"') && !html.includes('خصم 10%'), 'Shared banner invites enrollment without duplicating program rules');
  equal(JSON.stringify(menu), unchanged, 'Rendering never mutates owner catalog data');
  html = render({ loyalty: { purchasesRequired: 4, rewardName: 'مكافأة مختلفة' } });
  check(html.includes('data-loyalty-layout="compact"') && !html.includes('مكافأة مختلفة') && !html.includes('خصم 10%'), 'Owner program changes do not introduce hardcoded promo rewards');
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
  disclosureTree = draw({ brand: dabab, menu: dababIllustrated });
  nodes(disclosureTree).find(n => n.props?.['aria-label'] === 'تفاصيل أمريكانو').props.onClick();
  disclosureTree = draw({ brand: dabab, menu: dababIllustrated });
  equal(nodes(disclosureTree).find(n => n.type === Details).props.imageDisclosure, 'صورة توضيحية', 'Generated Dabab image disclosure follows its product into details');
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
    const branchTree = draw({ menu: { ...menu, branch: { id: 'branch-2', name: 'Second branch', slug: 'second-branch' } } });
    await nodes(branchTree).find(n => n.props?.['aria-label'] === 'شارك المنيو').props.onClick();
    equal(shared.url, `https://barndaksa.com/menu/${menu.slug}?branch=second-branch`, 'Signature sharing retains the selected branch');
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
  const et1Tokens = Object.fromEntries([...css.match(/\.menu\[data-signature="et1"\] \{([^}]+)\}/)[1].matchAll(/--([a-z-]+):\s*(#[a-f0-9]{6})/gi)].map(match => [match[1], match[2]]));
  const dababTokens = Object.fromEntries([...css.match(/\.menu\[data-signature="dabab"\] \{([^}]+)\}/)[1].matchAll(/--([a-z-]+):\s*(#[a-f0-9]{6})/gi)].map(match => [match[1], match[2]]));
  const baseTokens = Object.fromEntries([...css.match(/^\.menu \{([^}]+)\}/)[1].matchAll(/--([a-z-]+):\s*(#[a-f0-9]{6})/gi)].map(match => [match[1], match[2]]));
  for (const brand of Object.values(signatureBrands)) {
    const block = css.match(new RegExp('\\.menu\\[data-signature="'+brand.key+'"\\] \\{([^}]+)\\}'))?.[1] || '';
    const tokens = { ...baseTokens, ...Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[a-f0-9]{6})/gi)].map(match=>[match[1],match[2]])) };
    check(getContrastRatio(tokens.white,tokens.brand) >= 4.5, `${brand.key} banner headline is readable on its original brand color`);
    check(getContrastRatio(tokens.accent,tokens.brand) >= 4.5, `${brand.key} banner supporting copy is readable on its original brand color`);
  }
  check(getContrastRatio('#241610','#fffaf1') >= 4.5, 'Shared cream action exceeds normal text contrast requirements');
  for (const [foreground, background] of [['text', 'surface'], ['muted', 'surface'], ['white', 'brand'], ['accent', 'brand']]) {
    check(getContrastRatio(dababTokens[foreground], dababTokens[background]) >= 4.5, `Dabab ${foreground} on ${background} meets readable text contrast`);
  }
  for (const foreground of ['brand', 'tone']) check(getContrastRatio(dababTokens[foreground], dababTokens.surface) >= 4.5, `Dabab ${foreground} on warm logo background remains readable`);
  equal(dababTokens.brand, '#9b3f27', 'Dabab adopts its burnt-rust identity instead of the previous green');
  equal(dababTokens.surface, '#f6efe2', 'Dabab uses the warm limestone brand background');
  const dababMarkRules = css.match(/\.mark\[data-mark="dabab"\] img \{([^}]+)\}/)[1];
  for (const variant of ['coffee', 'hospital']) {
    const block = css.match(new RegExp('\\.menu\\[data-signature="dabab"\\]\\[data-signature-variant="' + variant + '"\\] \\{([^}]+)\\}'))[1];
    const tokens = { ...dababTokens, ...Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[a-f0-9]{6})/gi)].map(match => [match[1], match[2]])) };
    for (const foreground of ['text', 'muted', 'brand']) check(getContrastRatio(tokens[foreground], tokens.surface) >= 4.5, `${variant} ${foreground} text remains readable on its branch surface`);
    equal(tokens.brand, dababTokens.brand, `${variant} retains the original terracotta loyalty banner background`);
    equal(tokens.white, dababTokens.white, `${variant} retains the approved loyalty lettering and card surface`);
  }
  const branchNavCss = css.match(/\.branchNavigation a \{([^}]+)\}/)[1];
  check(branchNavCss.includes('min-height: 44px') && branchNavCss.includes('min-width: 0') && branchNavCss.includes('overflow-wrap: anywhere'), 'Branch choices are touch-sized and wrap safely in the 320px layout');
  check(css.includes('grid-template-columns: repeat(3,minmax(0,1fr))') && css.includes('width: min(660px,calc(100% - 36px))'), 'Three branch choices stay within the available mobile and desktop width');
  check(css.includes('[data-signature-variant="hospital"] .hero { display: flex; flex-direction: column; min-height: 0; }') && css.includes('[data-signature-variant="hospital"] .backdrop { position: relative; inset: auto; order: 2;'), 'Hospital split hero stacks its separate picture below the copy on mobile without overlaying text');
  check(dababMarkRules.includes('filter: none') && dababMarkRules.includes('mix-blend-mode: normal'), 'Dabab logo retains original color without tinting or blending');
  check(css.includes('.menu[data-signature="dabab"] .footer { background: var(--surface)') && css.includes('.menu[data-signature="dabab"].loading { background: var(--surface)'), 'Footer and loading keep the colored logo on a readable warm surface');
  const entryCss = fs.readFileSync(path.join(root, 'components/menu/brand-loyalty-entry.module.css'), 'utf8');
  require('lightningcss').transform({ filename: 'brand-loyalty-entry.module.css', code: Buffer.from(entryCss), cssModules: true });
  const dababMobileRules = entryCss.match(/@media \(max-width: 540px\) \{([\s\S]*?)\n\}/)[1];
  check(dababMobileRules.includes('grid-template-columns: minmax(0,1fr) 84px') && dababMobileRules.includes('width: 80px; height: 104px'), 'Compact mobile banner matches the reference card scale and side-by-side composition');
  check(entryCss.match(/\.copy \{([^}]+)\}/)[1].includes('grid-column: 1; grid-row: 1') && entryCss.match(/\.cardStack \{([^}]+)\}/)[1].includes('grid-column: 2; grid-row: 1'), 'RTL layout places the copy on the right and small stacked cards on the left');
  const compactActionRules = entryCss.match(/\.action \{([^}]+)\}/)[1];
  check(compactActionRules.includes('grid-column: 1 / -1') && compactActionRules.includes('min-height: 48px') && compactActionRules.includes('background: var(--loyalty-entry-action-background)'), 'Cream download action spans the whole row with a comfortable touch target');
  check(entryCss.match(/\.entry \{([^}]+)\}/)[1].includes('max-width: 980px'), 'Desktop compact banner has a bounded width');
  const emphasizedFrontRules = entryCss.match(/\.section\[data-logo-emphasis="true"\] \.cardFront \{([^}]+)\}/)[1];
  const emphasizedLogoRules = entryCss.match(/\.section\[data-logo-emphasis="true"\] \.logo, [^{]+\{([^}]+)\}/)[1];
  check(emphasizedFrontRules.includes('background: var(--loyalty-entry-action-background)') && emphasizedFrontRules.includes('border: 1px') && emphasizedFrontRules.includes('box-shadow:'), 'Emphasized card has a visible cream frame and separation from dark banners');
  check(entryCss.match(/\.logoPlate \{([^}]+)\}/)[1].includes('background: var(--loyalty-entry-card-background)'), 'Original light and gold marks retain their contrasting inner logo surface');
  check(entryCss.includes('.section[data-logo-emphasis="true"] .cardStack { width: 110px; height: 128px; }') && emphasizedLogoRules.includes('width: 94px; max-width: 100%; height: 88px; margin: 0 auto'), 'Only opted-in cards gain a wider 94px logo inside the compact 110px frame');
  check(entryCss.includes('.section[data-logo-emphasis="true"] .entry { grid-template-columns: minmax(0,1fr) 112px; gap: 16px 12px; padding: 20px 18px; }') && entryCss.includes('.section[data-logo-emphasis="true"] .title { font-size: 20px; line-height: 1.6; }'), 'Emphasized mobile cards leave flexible text space and keep the compact banner composition');
  check(emphasizedFrontRules.includes('grid-template-rows: 88px 14px; gap: 6px; padding: 9px 7px') && entryCss.includes('.section[data-logo-emphasis="true"] .cardCaption { font-size: 10px; font-weight: 600; line-height: 1.4; }'), 'The emphasized logo and one readable caption fit the card without clipping');
  check(!css.includes('.cardIdentity') && !css.includes('.cardProgress') && !css.includes('.loyaltyBenefits') && !css.includes('.loyaltyHint') && !css.includes('min-height: 340px'), 'Unused expanded Dabab card styles are removed');
  for (const [foreground, background] of [['text', 'surface'], ['muted', 'surface'], ['brand', 'hero-paper'], ['white', 'brand'], ['accent', 'brand']]) {
    check(getContrastRatio(et1Tokens[foreground], et1Tokens[background]) >= 4.5, `ET1 ${foreground} on ${background} meets readable text contrast`);
  }
  check(css.includes('prefers-reduced-motion: reduce') && css.includes('animation: none !important'), 'CSS has complete reduced-motion opt out');
  check(css.includes('repeat(2,minmax(0,1fr))') && css.includes('max-width: 360px') && css.includes('max-height: 700px'), 'Compact and short mobile layouts have explicit rules');
  check(css.includes(':focus-visible') && css.includes('min-height: 44px'), 'Keyboard focus and touch target styles are present');
  console.log(`PASS ${checks} signature menu identity, SSR, interactions, motion, routing and cache authorization checks`);
}

async function checkDefaultPresentation() {
  for (const category of ['cafes_coffee', 'restaurants']) {
    check(usesDefaultSignatureMenu(category, '2026-11-03T22:29:23Z'), 'Account created after approval automatically gets the new menu');
    check(usesDefaultSignatureMenu(category, '2030-01-01T00:00:00Z'), 'Future account needs no slug registration');
    check(!usesDefaultSignatureMenu(category, '2026-11-02T20:59:59Z'), 'Earlier accounts retain their established presentation');
    for (const bad of [undefined, '', 'invalid']) check(!usesDefaultSignatureMenu(category, bad), 'Missing or malformed creation time does not silently restyle an existing account');
  }
  for (const category of ['hair_salons', 'gifts_flowers', 'retail_stores', undefined]) check(!usesDefaultSignatureMenu(category, '2030-01-01'), 'Other business experiences remain separate');
  const fresh = { ...menu, slug: 'new-unregistered-brand', businessCategory: 'restaurants', presentation: 'signature', name: 'اختبار العلامة الجديدة', logoUrl: null, products: [], highlights: undefined };
  for (const palette of [{}, { primary: '#ffffff', background: '#111111', accent: '#111111', button: '#ffffff' }, { primary: '#ffff00', background: '#ffffff', accent: '#ffff00', button: '#ffff00' }, { primary: 'url(https://evil.test)', background: 'red;display:none' }]) {
    const brand = defaultSignatureBrand({ ...fresh, appearance: { palette, heroUrl: null } });
    equal(brand.hero, DEFAULT_SIGNATURE_HERO, 'Empty new account gets its own shared hospitality art, never another tenant artwork');
    const html = render({ menu: fresh, brand, loyalty: null });
    check(html.includes('data-signature="default"') && html.includes(fresh.name) && html.includes('اختياراتنا تتجهّز لك'), 'Empty account renders approved layout and its actual brand name');
    check(!html.includes('barndaksa-logo') && !html.includes('four-brands/') && !html.includes('url(https://evil.test)'), 'Empty identity never leaks a platform logo, another brand or CSS injection');
    const v = brand.cssVariables;
    for (const [fg,bg] of [['--text','--surface'],['--muted','--surface'],['--hero-detail','--hero-paper'],['--button-fg','--button-bg'],['--white','--brand']]) check(getContrastRatio(v[fg],v[bg]) >= 4.5, 'Dynamic light/dark brand palette remains readable');
  }
  const owned = { ...fresh, logoUrl: '/owner-new-logo.webp', appearance: { palette: { primary: '#123456' }, heroUrl: 'https://example.test/owner-hero.webp' }, products: [product] };
  const brand = defaultSignatureBrand(owned), html = render({ menu: owned, brand });
  check(html.includes(owned.logoUrl) && html.includes(owned.appearance.heroUrl) && html.includes('data-loyalty-layout="compact"'), 'Owner media and the compact loyalty entry reach the automatic new-brand layout');
  equal(defaultSignatureBrand({ ...fresh, presentation: undefined }), null, 'Legacy DTO cannot opt into new layout accidentally');
  equal(defaultSignatureBrand({ ...fresh, businessCategory: 'gifts_flowers' }), null, 'Gift stores do not inherit food menus');
  const h = hooks(), Dynamic = load('components/menu/signature-menu.tsx', { ...mocks, react: h.api }).SignatureMenu;
  let tree = h.draw(Dynamic, { menu: owned, brand, loyalty: null });
  nodes(tree).find(n => n.props?.src === owned.appearance.heroUrl).props.onError();
  tree = h.draw(Dynamic, { menu: owned, brand, loyalty: null });
  check(nodes(tree).some(n => n.props?.src === DEFAULT_SIGNATURE_HERO), 'Failed owner background falls back to valid decorative art');
}

async function checkRouteIsolation() {
  const Signature = noop, Bistro = () => null, Loco = () => null, Together = () => null, French = () => null, Branded = () => null;
  let slug = menu.slug, program = { enabled: true, purchasesRequired: 6, rewardName: 'خصم 10%' }, gate = true, menuReads = 0, extraMenu = {};
  const route = load('app/menu/[slug]/page.tsx', {
    react: { ...React, cache: fn => fn },
    'next/navigation': { notFound() { throw Error('NOT_FOUND'); }, redirect(url) { throw Error('REDIRECT:' + url); } },
    '@/lib/data/standalone-menu': { getStandaloneMenu: async () => { menuReads++; return { ...menu, slug, ...extraMenu }; } },
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
  slug = 'brand-8ad185ee82e3';
  extraMenu = { branch: { id: 'validated-hospital', name: 'فرع المستشفى', slug: 'hospital' } };
  let branchTree = await route.default({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({ branch: 'coffee', showcase: '1', q: 'latte', tag: ['hot', 'cold'] }) });
  let branchView = nodes(branchTree).find(n => n.type === Signature && n.props.menu);
  equal(branchView.props.brand.variant, 'hospital', 'Route chooses the server-validated branch rather than trusting the raw requested branch');
  equal(branchView.key, `${slug}:validated-hospital`, 'Validated branch ID keys the menu so changing branches resets catalog filters');
  equal(branchView.props.branchQuery, 'branch=coffee&showcase=1&q=latte&tag=hot&tag=cold', 'Route forwards query context for replacement by branch links');
  extraMenu = { branch: { id: 'validated-bar', name: 'بار ضباب', slug: 'bar' } };
  branchTree = await route.default({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({ branch: 'hospital' }) });
  branchView = nodes(branchTree).find(n => n.type === Signature && n.props.menu);
  equal(branchView.props.brand.variant, undefined, 'An unvalidated hospital query cannot change the approved bar design');
  equal(branchView.key, `${slug}:validated-bar`, 'Bar route has its own stable state boundary');
  extraMenu = {};
  slug = 'rast'; let tree = await route.default({ params: Promise.resolve({ slug }) }); check(nodes(tree).some(n => n.type === Bistro), 'Legacy RAST route retains original presentation');
  slug = 'brand-not-in-any-registry'; extraMenu = { presentation: 'signature', businessCategory: 'cafes_coffee' }; tree = await route.default({ params: Promise.resolve({ slug }) });
  const defaultView = nodes(tree).find(n => n.type === Signature && n.props.menu);
  equal(defaultView.props.brand.key, 'default', 'New account routes to the approved layout without hardcoded registration');
  equal(defaultView.props.loyalty, { purchasesRequired: 6, rewardName: 'خصم 10%' }, 'Automatic presentation receives the actual enabled loyalty program');
  extraMenu = {};
  slug = menu.slug; program = { ...program, enabled: false }; tree = await route.default({ params: Promise.resolve({ slug }) }); equal(nodes(tree).find(n => n.type === Signature && n.props.menu).props.loyalty, null, 'Disabled public program does not render reward promise');
  gate = false; const before = menuReads; await assert.rejects(route.default({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({ showcase: '1' }) }), /NOT_FOUND/); equal(menuReads, before, 'Unpublished showcase denies before catalog data access');
  let currentSlug = slug;
  const Loading = load('app/menu/[slug]/loading.tsx', { 'next/navigation': { useParams: () => ({ slug: currentSlug }) }, '@/components/menu/signature-menu-loading': { SignatureMenuLoading: Signature }, '@/components/menu/loco-menu-loading': { LocoMenuLoading: Loco }, '@/components/store/together-store-loading': { TogetherStoreLoading: Together }, '@/components/menu/branded-menu-loading': { BrandedMenuLoading: Branded } }).default;
  for (currentSlug of Object.keys(signatureBrands)) equal(Loading().props.brand.key, signatureBrand(currentSlug).key, 'Loading route follows exact same explicit identity');
  currentSlug = 'rast'; check(Loading().type !== Signature, 'Legacy RAST does not inherit new loading');
}

async function checkMediaCacheBoundary() {
  const cafeId = 'tenant-current', imagePath = `${cafeId}/product/photo.webp`;
  const fixture = { id: 'product', cafe_id: cafeId, category_id: 'category', name: 'Dish', description: '', price: 18, price_options: [], ingredients: [], available: true, image_storage_path: imagePath, image_url: null, image_gallery: [], gallery_storage_paths: [], media: [], promo: null, deleted_at: null };
  for (const slug of [...Object.keys(signatureBrands), 'brand-not-in-any-registry']) {
    for (const test of ['allowed', 'no-feature', 'paused-brand', 'hidden-category', 'unavailable', 'foreign-image', ...(slug === 'brand-not-in-any-registry' ? ['owned-identity', 'foreign-identity', 'background-error'] : [])]) {
      const signed = [], queries = [], identityMedia = [];
      const identityOwner = test === 'foreign-identity' ? 'another-tenant' : cafeId;
      const tables = {
        cafes: [{ id: cafeId, slug, name: 'Brand', status: test === 'paused-brand' ? 'paused' : 'active', business_category: 'cafes_coffee', created_at: '2026-11-04T00:00:00Z', deleted_at: null }],
        cafe_custom_identity: test.endsWith('-identity') || test === 'background-error' ? [{ cafe_id: cafeId, palette: { primary: '#123456', background: 'url(https://evil.test)' }, logo_storage_path: `${identityOwner}/logo.webp`, background_storage_path: `${identityOwner}/hero.webp` }] : [],
        branches: [], cafe_settings: [{ cafe_id: cafeId, logo_url: null }],
        menu_categories: [{ id: 'category', cafe_id: cafeId, visible: test !== 'hidden-category', deleted_at: null, name: 'Food' }],
        menu_products: [{ ...fixture, available: test !== 'unavailable', image_storage_path: test === 'foreign-image' ? 'other-tenant/private.webp' : imagePath }],
      };
      const client = { from(table) { queries.push(table); let rows = [...tables[table]]; const q = { select() { return q; }, eq(key, value) { rows = rows.filter(r => r[key] === value); return q; }, is(key, value) { rows = rows.filter(r => (r[key] ?? null) === value); return q; }, not(key, _op, value) { rows = rows.filter(r => (r[key] ?? null) !== value); return q; }, order() { return q; }, range(start, end) { rows = rows.slice(start, end + 1); return q; }, maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); }, then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); } }; return q; } };
      client.storage = { from(bucket) { return { async createSignedUrl(path) { identityMedia.push({bucket,path}); return test === 'background-error' ? {data:null,error:{message:'Missing object'}} : {data:{signedUrl:'https://test.example/'+path},error:null}; } }; } };
      const read = load('lib/data/standalone-menu.ts', {
        'server-only': {}, react: { cache: fn => fn }, 'next/cache': { unstable_cache: fn => fn },
        '@/lib/supabase/admin': { createAdminClient: () => client },
        '@/lib/data/feature-entitlements': { getCafeFeatureCodes: async () => test === 'no-feature' ? [] : ['menu'] },
        '@/lib/data/kath-menu-assets': { getKathMenuAssets: async paths => { signed.push(...paths); return paths.map(path => ({ path, signedUrl: `https://test.example/${path}` })); } },
        '@/lib/data/standalone-highlights': { getStandaloneHighlights: async () => ({ asOf: now, items: [] }) },
        '@/lib/cafe/published-logo': { publishedMenuLogo: async (_admin, _cafeId, path) => { identityMedia.push({bucket:'cafe-logos',path}); return 'https://test.example/'+path; } },
        '@/lib/menu/contacts': { menuContacts: () => ({ instagramUrl: null, location: null }) },
        '@/lib/whatsapp/green-api': { isGreenApiConfigured: () => false },
      }).getStandaloneMenu;
      const result = await read(slug);
      if (test === 'allowed' && slug === 'brand-not-in-any-registry') { equal(result.presentation, 'signature', 'Server marks a newly created generic account automatically'); equal(result.logoUrl, null, 'No uploaded logo produces the account name, not Branda logo'); }
      if (test === 'allowed' || test.endsWith('-identity') || test === 'background-error') equal(signed, [imagePath], 'Authorized published tenant uses stable signing');
      else equal(signed, [], `${test} never reaches cached private media signing`);
      if (test.endsWith('-identity')) {
        equal(result.appearance.palette, {primary:'#123456'}, 'Only valid hex colors leave the server identity reader');
        equal(identityMedia.map(m=>m.path).sort(), test === 'owned-identity' ? [`${cafeId}/hero.webp`,`${cafeId}/logo.webp`] : [], 'Logo and background signing enforce tenant ownership independently');
        equal(result.appearance.heroUrl, test === 'owned-identity' ? `https://test.example/${cafeId}/hero.webp` : null, 'Foreign background paths never become public URLs');
      }
      if (test === 'background-error') { equal(result.appearance.heroUrl, null, 'Missing optional background falls back without breaking the menu'); equal(result.products.length, 1, 'Catalog remains available after background signing error'); }
      if (test === 'no-feature' || test === 'paused-brand') { equal(result, null, 'Current package/status gate denies catalog'); check(!queries.includes('menu_products') && !queries.includes('cafe_custom_identity'), 'Denied brand never reads products or custom identity'); }
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
