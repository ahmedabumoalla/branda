const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
function load(file, mocks = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText;
  new Function('require', 'exports', compiled)(name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return new Proxy({}, { get: (_, key) => key });
    if (name.startsWith('@/')) {
      const base = name.slice(2); return load(fs.existsSync(base + '.ts') ? base + '.ts' : base + '.tsx', mocks);
    }
    return require(name);
  }, exports);
  return exports;
}
function hooks() {
  let slots = [], cursor = 0, effects = [];
  const effect = (fn, deps) => {
    const i = cursor++, prior = slots[i];
    if (!prior || deps?.some((value, n) => !Object.is(value, prior.deps[n]))) {
      effects.push(() => { prior?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
    }
  };
  return {
    api: { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
      useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
      useEffect: effect, useLayoutEffect: effect, useMemo: fn => fn() },
    render(fn, props) { cursor = 0; const tree = fn(props); const pending = effects; effects = []; pending.forEach(fn => fn()); return tree; },
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.footer)];
}
function label(node) {
  if (Array.isArray(node)) return node.map(label).join('');
  if (node && typeof node === 'object') return label(node.props?.children);
  return node == null || typeof node === 'boolean' ? '' : String(node);
}
const category = { id: '11111111-1111-4111-8111-111111111111', name: 'Category', sortOrder: 0 };
const product = { id: '22222222-2222-4222-8222-222222222222', name: 'Product', category: category.name, categoryId: category.id,
  description: '', price: 20, ingredients: [], available: true, imageVariant: 'latte', loyaltyPoints: 0,
  imageAssetId: 'tenant/first.webp', imageGallery: [{ imageAssetId: 'tenant/first.webp' }, { imageAssetId: 'tenant/second.webp' }],
  videoAssetId: 'tenant/video.mp4', media: [{ type: 'video', assetId: 'tenant/video.mp4' }], promo: null };
async function main() {
  global.requestAnimationFrame = fn => { fn(); return 1; };
  global.cancelAnimationFrame = () => {};
  const { orderedProductMedia, primaryMediaType } = load('lib/menu/product-media.ts');
  const { mapDbProductToMenuProduct } = load('lib/data/mappers.ts');
  for (const type of ['image', 'video']) {
    const media = orderedProductMedia(product.imageGallery, product.media[0], type);
    const mapped = mapDbProductToMenuProduct({ ...product, image_gallery: product.imageGallery,
      image_storage_path: product.imageAssetId, video_storage_path: product.videoAssetId, media });
    assert.equal(primaryMediaType(mapped), type, 'Cover survives database mapper and mixed gallery');
  }
  assert.equal(primaryMediaType(product), 'video', 'Legacy video cover is preserved');
  const { isPromoActive, productFinalPrice } = load('lib/mock/menu.ts');
  const promo = { kind: 'خصم', startDate: '2026-10-16', endDate: '2026-10-16', discountPercent: 25 };
  assert(isPromoActive(promo, Date.parse('2026-10-15T21:00:00Z')));
  assert(isPromoActive(promo, Date.parse('2026-10-16T20:59:59.999Z')));
  assert(!isPromoActive(promo, Date.parse('2026-10-16T21:00:00Z')));
  const livePromo = { ...promo, startDate: '2020-01-01', endDate: '2099-01-01' };
  assert.equal(productFinalPrice(20, livePromo), 15);
  assert.equal(productFinalPrice(20, { ...livePromo, discountMode: 'fixed_price', discountedPrice: 9 }), 9);
  assert.equal(productFinalPrice(20, null), 20);

  // Run the actual authenticated data mutation, inspect stored JSON and cache invalidation.
  let stored; const invalidations = [], filters = [];
  const query = { update(value) { stored = value; return this; }, eq(key, value) { filters.push([key, value]); return this; },
    select() { return this; }, async maybeSingle() { return { data: { ...stored, id: product.id }, error: null }; } };
  const { upsertMenuProduct } = load('lib/data/menu.ts', {
    'next/cache': { revalidatePath: path => invalidations.push(path) },
    '@/lib/supabase/server': { createClient: async () => ({ from: table => { assert.equal(table, 'menu_products'); return query; } }) },
    '@/lib/supabase/admin': {}, '@/lib/data/cafes': { requireOwnerCafeContext: async () => ({ id: 'tenant', slug: 'delicake' }) },
    '@/lib/performance/server-memory-cache': { clearServerMemoryCache() {} },
  });
  const input = { ...product, imageStoragePath: product.imageAssetId, videoStoragePath: product.videoAssetId,
    availableForPickup: true, redeemableWithPoints: false,
    media: orderedProductMedia(product.imageGallery, product.media[0], 'image') };
  await upsertMenuProduct(input);
  assert.equal(stored.description, ''); assert.equal(stored.media[0].type, 'image'); assert.equal(stored.media[0].primary, true);
  assert.equal(stored.media.filter(item => item.type === 'video').length, 1);
  assert(filters.some(([key, value]) => key === 'cafe_id' && value === 'tenant'));
  assert(invalidations.includes('/menu/delicake'));
  await assert.rejects(upsertMenuProduct({ ...input, promo: { ...livePromo, discountPercent: 101 } }));
  await assert.rejects(upsertMenuProduct({ ...input, promo: { ...livePromo, discountMode: 'fixed_price', discountedPrice: 21 } }));

  // Exercise the real editor event handlers without touching customer data.
  const h = hooks(); let closed = 0, saved, settle, saveCalls = 0;
  const alerts = []; global.alert = message => alerts.push(message);
  let downloadRequests = [], downloadReject = false, downloadedFiles = 0;
  const mocks = { react: h.api, '@/app/actions/upload': {}, '@/lib/cafe/local-asset-store': { revokeObjectUrl() {} },
    '@/lib/menu/download-product-image': { getProductImageDownload: async image => {
      downloadRequests.push(image); if (downloadReject) throw Error('offline'); return new Blob(['image']);
    }, saveProductImageDownload() { downloadedFiles++; } },
    '@/components/dashboard/ui/modal': { Modal: 'modal' },
    '@/components/cafe/product-image': { ProductImage: 'image', ProductMediaDisplay: 'media', getProductImageSources: p => p.imageGallery ?? [] },
  };
  const { MenuProductFormModal } = load('components/dashboard/menu/product-modal.tsx', mocks);
  const props = { open: true, mode: 'edit', editingProduct: product, productList: [product], categories: [category],
    onCategoriesChange: async cats => cats, onClose: () => closed++, onSave: async value => { saved = value; saveCalls++; return new Promise(resolve => { settle = resolve; }); } };
  const render = () => h.render(MenuProductFormModal(props).type, props);
  render(); let tree = render();
  const description = nodes(tree).find(n => n.type === 'textarea' && n.props.value === '');
  assert.equal(description.props.required, undefined, 'Description is optional');
  assert(!label(tree).includes('متاح للاستلام'));
  let choices = nodes(tree).filter(n => n.type === 'button' && 'aria-pressed' in n.props);
  assert.equal(choices.length, 3); choices[1].props.onClick(); tree = render();
  let downloadButton = nodes(tree).find(n => n.type === 'button' && label(n) === 'تنزيل الصورة');
  downloadButton.props.onClick(); downloadButton.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(downloadRequests.length, 1, 'Repeated click starts only one download');
  assert.equal(downloadRequests[0].imageAssetId, 'tenant/second.webp'); assert.equal(downloadedFiles, 1);
  downloadReject = true; tree = render();
  nodes(tree).find(n => n.type === 'button' && label(n) === 'تنزيل الصورة').props.onClick();
  await new Promise(resolve => setImmediate(resolve)); tree = render();
  assert(nodes(tree).some(n => n.props?.role === 'alert' && label(n).includes('تعذر تنزيل الصورة')));
  assert.equal(closed, 0, 'Download failure preserves the editor'); downloadReject = false;
  let form = nodes(tree).find(n => n.type === 'form');
  const saving = form.props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, 0, 'Editor stays open until server confirms');
  assert.equal(saved.description, '');
  assert.equal(saved.imageAssetId, 'tenant/second.webp');
  assert.equal(saved.media[0].type, 'image'); assert.equal(saved.media[0].primary, true);
  assert(saved.media.some(item => item.type === 'video'), 'Selecting image retains video');
  await form.props.onSubmit({ preventDefault() {} }); assert.equal(saveCalls, 1, 'No duplicate saves');
  settle(false); await saving; assert.equal(closed, 0, 'Failed save preserves draft');
  tree = render(); assert(nodes(tree).some(n => n.type === 'button' && n.props['aria-pressed'] && label(n).includes('الصورة الرئيسية')));
  const success = nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve)); settle(true); await success;
  assert.equal(closed, 1); assert.equal(alerts.length, 0);
  // Adding a category must not overwrite the edited name/media.
  props.categories = [...props.categories, { ...category, id: '33333333-3333-4333-8333-333333333333' }];
  tree = render(); assert.equal(nodes(tree).find(n => n.type === 'media').props.product.imageAssetId, 'tenant/second.webp');

  // Dashboard mutations update local cards only after success, including new UUID products.
  const ph = hooks(); let fail = false, mutations = 0, notifications = 0, restores = 0;
  const pageMocks = { react: ph.api, 'next/dynamic': () => 'editor',
    '@/app/actions/menu': { saveMenuProductAction: async p => { mutations++; if (fail) throw Error('failed'); return p.id; },
      deleteMenuProductAction: async () => { if (fail) throw Error('failed'); } },
    '@/components/dashboard/menu/category-manager': { CategoryManager: 'categories' },
    '@/components/dashboard/menu/product-card': { MenuProductCard: 'card' },
    '@/components/ui/design-system': { BentoCard: 'bento', DashboardPageShell: 'shell', NeumoInput: 'input', PrimaryButton: 'button' },
    '@/components/ui/app-toast': { AppToast: 'toast', useAppToast: () => ({ showToast() {} }) },
    '@/lib/menu/product-position': { captureProductPosition: () => () => { restores++; } },
    '@/lib/menu/menu-change': { notifyMenuChanged: () => notifications++ },
  };
  const { MenuPageClient } = load('components/dashboard/pages/menu-page.tsx', pageMocks);
  const pageProps = { initialProducts: [product], initialCategories: [category], cafeSlug: 'delicake' };
  const page = () => ph.render(MenuPageClient, pageProps);
  let pageTree = page(); let card = nodes(pageTree).find(n => n.type === 'card');
  card.props.onToggleAvailability(); await new Promise(resolve => setImmediate(resolve));
  pageTree = page(); card = nodes(pageTree).find(n => n.type === 'card');
  assert.equal(card.props.product.available, false); assert(restores > 0); assert.equal(notifications, 1);
  fail = true; card.props.onToggleAvailability(); await new Promise(resolve => setImmediate(resolve));
  pageTree = page(); card = nodes(pageTree).find(n => n.type === 'card'); assert.equal(card.props.product.available, false);
  card.props.onDelete(); await new Promise(resolve => setImmediate(resolve)); assert.equal(nodes(page()).filter(n => n.type === 'card').length, 1);
  fail = false; card.props.onEdit(); pageTree = page();
  // Duplicate opens a detached draft; cancel writes nothing and save uses a new identity.
  const mutationsBeforeCopy = mutations;
  card.props.onDuplicate(); pageTree = page();
  let copyEditor = nodes(pageTree).find(n => n.type === 'editor' && n.props.onSave);
  assert.equal(copyEditor.props.mode, 'duplicate');
  const copiedProduct = copyEditor.props.editingProduct;
  assert.notEqual(copiedProduct.id, product.id);
  assert.equal(copiedProduct.imageAssetId, product.imageAssetId);
  assert.equal(copiedProduct.price, product.price);
  assert.equal(mutations, mutationsBeforeCopy, 'Opening copy does not publish it');
  copyEditor.props.onClose(); pageTree = page();
  assert.equal(nodes(pageTree).filter(n => n.type === 'card').length, 1, 'Cancel leaves catalog unchanged');
  card.props.onDuplicate(); pageTree = page();
  copyEditor = nodes(pageTree).find(n => n.type === 'editor' && n.props.onSave);
  assert.notEqual(copyEditor.props.editingProduct.id, copiedProduct.id);
  // The unchanged authenticated save action handles the fresh draft.
  card.props.onEdit(); pageTree = page();
  const editor = nodes(pageTree).find(n => n.type === 'editor' && n.props.onSave);
  assert(await editor.props.onSave({ ...product, id: '44444444-4444-4444-8444-444444444444' }));
  assert.equal(nodes(page()).filter(n => n.type === 'card').length, 2, 'New UUID product appears immediately');
  card.props.onDelete(); await new Promise(resolve => setImmediate(resolve)); assert.equal(nodes(page()).filter(n => n.type === 'card').length, 1);

  const { createProductCopy } = load('lib/menu/product-copy.ts');
  const original = { ...product, ingredients: ['coffee'], promo: livePromo,
    eventTicketSettings: { venueName: 'Venue', capacity: 20 } };
  const copy = createProductCopy(original, [original, { ...original, name: `${original.name} - نسخة` }]);
  assert.equal(copy.name, `${original.name} - نسخة 2`);
  assert.deepEqual(copy.media, original.media); assert.deepEqual(copy.imageGallery, original.imageGallery);
  copy.ingredients.push('milk'); copy.imageGallery[0].alt = 'copy'; copy.promo.discountPercent = 40;
  copy.eventTicketSettings.venueName = 'Copy';
  assert.equal(original.ingredients.length, 1); assert.equal(original.imageGallery[0].alt, undefined);
  assert.equal(original.promo.discountPercent, 25); assert.equal(original.eventTicketSettings.venueName, 'Venue');

  // Original image bytes survive download; stale signatures are bypassed for stored media.
  const fullImage = new Blob([new Uint8Array([137, 80, 78, 71, 0, 255])], { type: 'image/png' });
  const { getProductImageDownload, saveProductImageDownload } = load('lib/menu/download-product-image.ts', {
    '@/lib/cafe/local-asset-store': { getLocalAssetBlob: async id => id === 'local-id' ? fullImage : null },
  });
  let fetched = [];
  global.fetch = async url => { fetched.push(url); return new Response(fullImage); };
  const downloaded = await getProductImageDownload({ imageAssetId: 'tenant/first.png', imageDataUrl: 'https://example.test/expired-thumbnail' });
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), Buffer.from(await fullImage.arrayBuffer()));
  assert.equal(fetched[0], '/api/owner/menu-media?path=tenant%2Ffirst.png');
  assert.equal(await getProductImageDownload({ imageAssetId: 'local-id' }), fullImage);
  const pendingOriginal = new File([fullImage], 'original.png', { type: fullImage.type });
  assert.equal(await getProductImageDownload({ imageDataUrl: 'blob:optimized' }, pendingOriginal), pendingOriginal);
  assert.equal(fetched.length, 1);
  global.fetch = async () => new Response('Denied', { status: 403 });
  await assert.rejects(getProductImageDownload({ imageAssetId: 'tenant/first.png' }));
  global.fetch = async () => new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } });
  await assert.rejects(getProductImageDownload({ imageDataUrl: 'https://example.test/image' }));
  await assert.rejects(getProductImageDownload({ imageDataUrl: 'javascript:alert(1)' }));
  let clicked = 0, removed = 0, released = '', scheduled;
  const realCreate = URL.createObjectURL, realRevoke = URL.revokeObjectURL, realTimeout = global.setTimeout;
  URL.createObjectURL = blob => { assert.equal(blob, fullImage); return 'blob:original'; };
  URL.revokeObjectURL = url => { released = url; };
  global.setTimeout = fn => { scheduled = fn; return 1; };
  const link = { click() { clicked++; }, remove() { removed++; } };
  global.document = { createElement: () => link, body: { appendChild(node) { assert.equal(node, link); } } };
  saveProductImageDownload(fullImage, 'قهوة/صورة');
  assert.equal(link.download, 'قهوة-صورة.png'); assert.equal(link.href, 'blob:original');
  assert.equal(clicked, 1); assert.equal(removed, 1); assert.equal(released, ''); scheduled();
  assert.equal(released, 'blob:original');
  URL.createObjectURL = realCreate; URL.revokeObjectURL = realRevoke; global.setTimeout = realTimeout;

  // Viewport anchor survives edits and falls back to next card on deletion.
  const scroller = { scrollTop: 900, parentElement: null };
  let top = 120, nextTop = 420;
  const anchor = { dataset: { menuProductId: 'a' }, parentElement: scroller, isConnected: true, getBoundingClientRect: () => ({ top }) };
  const neighbour = { dataset: { menuProductId: 'b' }, parentElement: scroller, isConnected: true, getBoundingClientRect: () => ({ top: nextTop }) };
  global.document = { querySelectorAll: () => [anchor, neighbour] };
  global.getComputedStyle = () => ({ overflowY: 'auto' });
  const { captureProductPosition } = load('lib/menu/product-position.ts');
  let restore = captureProductPosition('a'); top = 160; restore(); assert.equal(scroller.scrollTop, 940);
  restore = captureProductPosition('a'); anchor.isConnected = false; nextTop = 120; restore(); assert.equal(scroller.scrollTop, 640);
  console.log('PASS: editor/media/promo regressions; detached copy and cancel; original-byte downloads, selected image, double-click/error states and safe file cleanup; viewport anchors');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
