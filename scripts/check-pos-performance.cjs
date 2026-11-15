const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'server-only') return {};
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      const resolvedFile = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find(fs.existsSync);
      assert(resolvedFile, base); return load(resolvedFile, mocks);
    }
    return require(name);
  }, exports);
  return exports;
}
const owned = load('lib/menu/standalone-menu.ts');
async function signatures() {
  let calls = 0, fail = false;
  const batches = [];
  const mod = load('lib/finance/product-media-server.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => ({ storage: { from: bucket => { assert.equal(bucket, 'menu-products'); return { createSignedUrls: async (paths, ttl) => { calls++; batches.push(paths); assert.equal(ttl, 600); if (fail) throw Error('Storage outage'); return { data: paths.map(path => ({ path, signedUrl: 'https://storage.test/' + path + '?signature=' + calls })) }; } }; } } }) },
    '@/lib/menu/standalone-menu': owned,
  });
  const cafe = { id: 'brand', slug: 'brand-test' };
  const products = Array.from({ length: 60 }, (_, i) => ({ id: String(i), imageStoragePath: `brand/${i}.webp`, imageUrl: null }));
  const first = await mod.financeProductMedia(cafe, [...products, products[0], { id: 'foreign', imageStoragePath: 'other/private.webp' }, { id: 'traversal', imageStoragePath: 'brand/../private.webp' }]);
  assert.equal(calls, 1); assert.equal(batches[0].length, 60);
  assert(first.slice(0, 61).every(product => product.imageUrl.startsWith('https://storage.test/') && product.imageFallbackUrl.startsWith('/api/finance/brand-test/media?')));
  assert(first.every(product => !('imageStoragePath' in product)));
  assert.equal(first[61].imageUrl, null); assert.equal(first[62].imageUrl, null);
  const next = await mod.financeProductMedia(cafe, products);
  assert.equal(calls, 1); assert.equal(next[0].imageUrl, first[0].imageUrl, 'Polls preserve image source identity');
  const foreign = await mod.financeProductMedia({ id: 'other', slug: 'other' }, products);
  assert(foreign.every(product => product.imageUrl === null)); assert.equal(calls, 1);
  fail = true;
  const failed = await mod.financeProductMedia(cafe, [{ id: 'new', imageStoragePath: 'brand/new.webp' }]);
  assert.equal(failed[0].imageUrl, failed[0].imageFallbackUrl);
  const now = Date.now; Date.now = () => now() + 241_000;
  try { fail = false; const refreshed = await mod.financeProductMedia(cafe, products); assert.notEqual(refreshed[0].imageUrl, first[0].imageUrl); }
  finally { Date.now = now; }
  return { products: 60, coldSigningRequests: 1, warmSigningRequests: 0 };
}

async function snapshotAndSync() {
  let auth = 0, contexts = 0, snapshots = 0, signed = 0, permitted = true;
  const cafe = { id: 'brand', slug: 'brand-test', role: 'cashier' };
  const client = { auth: { getUser: async () => { auth++; return { data: { user: permitted ? { id: 'user' } : null } }; } }, rpc: async name => {
    if (name === 'brand_finance_context') { contexts++; return { data: cafe }; }
    assert.equal(name, 'brand_finance_snapshot'); snapshots++; return { data: { cafe, canAdminister: false, products: [], items: [] } };
  } };
  const mocks = {
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/data/cafes': { requireOwnerCafeContext: async () => cafe },
    '@/lib/data/finance-cashier-maintenance': { getFinanceCashierMaintenance: async () => null },
    './finance-shifts': { getFinanceMaintenanceActor: async () => null },
    './finance-shift-alerts': {}, '@/lib/finance/pos-customer-server': {}, './finance-pos-customer-messages': {},
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) }, after() {} },
    '@/lib/finance/product-media-server': { financeProductMedia: async (_, products) => { signed++; return products; } },
  };
  const data = load('lib/data/brand-finance.ts', mocks);
  const route = load('app/api/finance/[slug]/pos-sync/route.ts', { ...mocks, '@/lib/data/brand-finance': data });
  const response = await route.GET(new Request('https://app.test/api/finance/brand-test/pos-sync'), { params: Promise.resolve({ slug: 'brand-test' }) });
  assert.equal(response.status, 200); assert.equal(auth, 1); assert.equal(contexts, 1); assert.equal(snapshots, 1); assert.equal(signed, 1);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  permitted = false;
  assert.equal((await route.GET(new Request('https://app.test/api/finance/brand-test/pos-sync'), { params: Promise.resolve({ slug: 'brand-test' }) })).status, 401);
  assert.equal(signed, 1); assert.equal(snapshots, 1, 'Unauthenticated caller never reads or signs data');
  return { authReadsPerSync: 1, contextReadsPerSync: 1, snapshotReadsPerSync: 1 };
}

async function mediaCache() {
  const origin = 'https://app.test';
  const image = 'https://storage.test/brand/image.webp?token=one';
  const fallback = '/api/finance/brand/media?path=brand%2Fimage.webp';
  let active = { scope: 'brand:user', snapshot: { products: [{ imageUrl: image, imageFallbackUrl: fallback }] } };
  let calls = 0, fail = false, release;
  let now = 1_000_000;
  const stores = new Map(), cacheNames = [];
  const caches = { open: async name => {
    cacheNames.push(name); if (!stores.has(name)) stores.set(name, new Map()); const store = stores.get(name);
    const key = request => typeof request === 'string' ? request : request.url;
    return { match: async request => store.get(key(request))?.clone(), put: async (request, value) => store.set(key(request), value.clone()) };
  } };
  const scope = { URL, Request, Response, Date: { now: () => now }, self: { location: new URL(origin), addEventListener() {} }, caches, fetch: async () => { calls++; if (release) await new Promise(resolve => { release.resolve = resolve; }); if (fail) throw Error('offline'); return new Response('image'); } };
  vm.createContext(scope); vm.runInContext(fs.readFileSync('public/finance-pos-sw.js', 'utf8'), scope);
  scope.currentSession = async () => active;
  const run = url => scope.productImage(new Request(url), new URL(url));
  assert.equal(await (await run(image)).text(), 'image'); assert.equal(calls, 1);
  for (let i = 0; i < 20; i++) assert.equal(await (await run(image)).text(), 'image');
  assert.equal(calls, 1, 'Twenty warm requests perform zero network fetches');
  active.snapshot.products[0].imageUrl = image.replace('one', 'two');
  assert.equal(await (await run(active.snapshot.products[0].imageUrl)).text(), 'image'); assert.equal(calls, 1, 'Rotated signatures reuse the stable private cache key');
  now += 301_000; release = {};
  const one = run(active.snapshot.products[0].imageUrl), two = run(origin + fallback);
  for (let i = 0; i < 20 && !release.resolve; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2); release.resolve(); await Promise.all([one, two]); release = null;
  assert.equal(calls, 2, 'Concurrent image and fallback requests share one fetch');
  now += 301_000; fail = true;
  assert.equal(await (await run(active.snapshot.products[0].imageUrl)).text(), 'image');
  active = null; await assert.rejects(run(image), /offline/);
  active = { scope: 'other:user', snapshot: { products: [] } }; await assert.rejects(run(image), /offline/);
  assert(!cacheNames.includes('branda-pos-media-other:user'));
  return { repeatedImages: 20, warmImageNetworkRequests: 0, logoutAndTenantIsolation: true };
}
async function prefetch() {
  let running = 0, peak = 0, images = 0;
  const store = new Map();
  global.location = { origin: 'https://app.test' };
  global.window = { caches: {}, requestIdleCallback: callback => setTimeout(callback, 0) };
  global.MessageChannel = class { constructor() { this.port1 = { close() {} }; this.port2 = { postMessage: data => this.port1.onmessage({ data }) }; } };
  Object.defineProperty(global, 'navigator', { configurable: true, value: { serviceWorker: { register: async () => ({ active: { state: 'activated', postMessage: (_, ports) => ports[0].postMessage({ ok: true }) } }) } } });
  global.caches = { open: async () => ({ match: async key => store.get(typeof key === 'string' ? key : key.url)?.clone(), put: async (key, value) => store.set(typeof key === 'string' ? key : key.url, value.clone()) }) };
  global.fetch = async (url, options) => {
    if (url.includes('receipt-brand')) return Response.json({ name: 'Brand' });
    assert.equal(options.priority, 'low'); running++; images++; peak = Math.max(peak, running);
    await new Promise(resolve => setImmediate(resolve)); running--; return new Response('image');
  };
  const mod = load('lib/finance/pos-offline-assets.ts');
  const snapshot = { cafe: { id: 'brand', slug: 'brand' }, userId: 'user', products: Array.from({ length: 5 }, (_, i) => ({ imageUrl: `https://storage.test/${i}`, imageFallbackUrl: `/api/finance/brand/media?path=${i}` })) };
  assert.equal((await mod.prepareOfflineAssets(snapshot)).failedImages, 0);
  assert.equal(images, 5); assert(peak <= 2);
  await mod.prepareOfflineAssets(snapshot); assert.equal(images, 5, 'Prefetch reuses stable keys');
  return { imagePrefetches: images, maximumParallelPrefetches: peak };
}
(async () => {
  const results = { signatures: await signatures(), sync: await snapshotAndSync(), cache: await mediaCache(), prefetch: await prefetch() };
  console.log('PASS POS performance request counts and authorization/cache regressions');
  console.log(JSON.stringify(results));
})().catch(error => { console.error(error); process.exitCode = 1; });
