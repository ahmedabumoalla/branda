const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/finance-pos-sw.js', 'utf8');
function harness(origin, path, old, response = new Response('new')) {
  const handlers = {}, entries = new Map(); let calls = 0;
  const request = new Request(origin + path);
  if (old) entries.set(request.url, new Response(old));
  const cache = { match: async r => entries.get(r.url)?.clone(), put: async (r, v) => entries.set(r.url, v.clone()) };
  vm.runInNewContext(source, { URL, Request, Response, self: { location: new URL(origin), addEventListener: (name, fn) => { handlers[name] = fn; } }, caches: { open: async () => cache }, fetch: async () => { calls++; if (response instanceof Error) throw response; return response.clone(); } });
  return { async run() { let promise; handlers.fetch({ request, respondWith: p => { promise = p; } }); return promise; }, calls: () => calls, cached: async () => (await cache.match(request))?.text() };
}
(async () => {
  for (const host of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
    const h = harness(host, '/_next/static/chunks/finance.js', 'old');
    assert.equal(await (await h.run()).text(), 'new'); assert.equal(await h.cached(), 'new'); assert.equal(h.calls(), 1);
  }
  const offline = harness('http://localhost:3000', '/_next/static/chunks/finance.js', 'saved', new Error('offline'));
  assert.equal(await (await offline.run()).text(), 'saved');
  const missing = harness('http://localhost:3000', '/_next/static/chunks/missing.js', null, new Error('offline'));
  await assert.rejects(missing.run(), /offline/);
  const production = harness('https://barndaksa.com', '/_next/static/chunks/hash.js', 'cached');
  assert.equal(await (await production.run()).text(), 'cached'); assert.equal(production.calls(), 0);
  const font = harness('http://localhost:3000', '/fonts/tajawal.ttf', 'font');
  assert.equal(await (await font.run()).text(), 'font'); assert.equal(font.calls(), 0);
  const failed = harness('http://localhost:3000', '/_next/static/chunks/finance.js', 'saved', new Response('error', { status: 500 }));
  assert.equal((await failed.run()).status, 500); assert.equal(await failed.cached(), 'saved');
  console.log('POS service worker: 8 cache behavior checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
