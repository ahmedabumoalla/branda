const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const sharp = require('sharp'), React = require('react');
function load(file, stubs = {}, cache = new Map()) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === 'server-only') return {};
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith('@/') || name.startsWith('.')) { const target = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name); return load(target + (fs.existsSync(target + '.tsx') ? '.tsx' : '.ts'), stubs, cache); }
    return require(name);
  }, exports); return exports;
}
async function main() {
  const { visitSchema, isGoogleMapsUrl } = load('lib/representative-visits/schema.ts');
  const data = { requestId: '00000000-0000-4000-8000-000000000011', brandName: 'Test Brand', representativeName: 'Test Rep', managerPhone: '٠٥٠١٢٣٤٥٦٧', ownerPhone: '', interest: 'interested', services: ['menu'], otherService: '', locationMode: 'link', latitude: null, longitude: null, mapsUrl: 'https://maps.app.goo.gl/example', website: '' };
  assert.equal(visitSchema.parse(data).managerPhone, '0501234567');
  for (const patch of [{ services: [] }, { services: ['other'] }, { latitude: null, locationMode: 'gps' }, { managerPhone: '123' }, { website: 'bot' }, { mapsUrl: 'https://evil.com/maps' }]) assert.equal(visitSchema.safeParse({ ...data, ...patch }).success, false);
  assert.deepEqual(visitSchema.parse({ ...data, interest: 'not_interested' }).services, []);
  for (const url of ['javascript:alert(1)', 'https://google.com.evil.com/maps', 'https://evil@google.com/maps', 'https://google.com/url?q=x']) assert.equal(isGoogleMapsUrl(url), false);
  const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#664433' } }).jpeg().toBuffer();
  let claimStatus = 'claimed', rpcCalls = [], uploads = [], removed = [], failUpload = false, finishError = false;
  const admin = { rpc: async (name, args) => { rpcCalls.push({ name, args }); return name.startsWith('claim_') ? { data: { status: claimStatus, createdAt: '2026-11-02T12:00:00Z' } } : finishError ? { error: { message: 'network' } } : { data: '2026-11-02T12:00:00Z' }; }, storage: { from: () => ({ upload: async (p, bytes, options) => { uploads.push({ p, bytes, options }); return failUpload ? { error: {} } : {}; }, remove: async paths => { removed.push(...paths); return {}; } }) }, from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({}) }) }) }) };
  const { POST } = load('app/api/visits/route.ts', { '@/lib/supabase/admin': { createAdminClient: () => admin }, '@/lib/barndaksa/env': { getSupabaseServiceRoleKey: () => 'test-only-not-a-secret' } });
  const request = (patch = {}, bytes = image, origin = 'https://barndaksa.com') => { const body = new FormData(); body.set('data', JSON.stringify({ ...data, ...patch })); body.set('photo', new File([bytes], 'photo.jpg', { type: 'image/jpeg' })); return new Request('https://barndaksa.com/api/visits', { method: 'POST', headers: { origin, 'x-forwarded-for': '192.0.2.1' }, body }); };
  assert.equal((await POST(request({}, image, 'https://evil.com'))).status, 403); assert.equal(rpcCalls.length, 0);
  assert.equal((await POST(request({ services: [] }))).status, 400); assert.equal(rpcCalls.length, 0);
  assert.equal((await POST(request())).status, 201); assert.equal(uploads.length, 1);
  assert.equal((await sharp(uploads[0].bytes).metadata()).format, 'webp');
  assert.equal(uploads[0].options.upsert, false);
  assert(!JSON.stringify(rpcCalls).includes('192.0.2.1'));
  const before = uploads.length; claimStatus = 'saved'; assert.equal((await POST(request())).status, 200); assert.equal(uploads.length, before);
  const normalized = request(); normalized.headers.set('host', '127.0.0.1:3000'); normalized.headers.set('origin', 'http://127.0.0.1:3000');
  const local = new Request('http://localhost:3000/api/visits', { method: 'POST', headers: normalized.headers, body: await normalized.blob() });
  assert.equal((await POST(local)).status, 200, 'Local host normalization preserves same-origin submissions');
  claimStatus = 'busy'; assert.equal((await POST(request())).status, 409);
  claimStatus = 'rate'; assert.equal((await POST(request())).status, 429);
  claimStatus = 'claimed'; assert.equal((await POST(request({}, Buffer.from('<svg/>')))).status, 400);
  failUpload = true; assert.equal((await POST(request())).status, 503); failUpload = false;
  finishError = true; const deleted = removed.length; assert.equal((await POST(request())).status, 503); assert.equal(removed.length, deleted, 'Ambiguous finalization never removes committed photos');
  let privileged = 0;
  const protectedData = load('lib/data/representative-visits.ts', { '@/lib/data/cafes': { requirePlatformAdmin: async () => { throw Error('Denied'); } }, '@/lib/supabase/admin': { createAdminClient: () => { privileged++; return admin; } } });
  await assert.rejects(() => protectedData.getRepresentativeVisits(), /Denied/); assert.equal(privileged, 0);
  const { renderToStaticMarkup } = require('react-dom/server');
  const ui = load('components/representative/visit-form.tsx', { 'next/navigation': { useRouter: () => ({ refresh() {} }) } });
  const html = renderToStaticMarkup(React.createElement(ui.VisitForm));
  assert.equal((html.match(/capture="environment"/g) || []).length, 2);
  for (const field of ['brandName', 'managerPhone', 'ownerPhone', 'representativeName']) assert(html.includes(`name="${field}"`));
  const links = renderToStaticMarkup(React.createElement(ui.VisitShareLinks)); assert(links.includes('href="/visits"') && links.includes('target="_blank"'));
  console.log('PASS visit validation, image transcoding, origin/body guards, idempotency/rate states, failure behavior, private admin access, public form and native camera/share controls');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
