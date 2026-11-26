const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transform } = require('lightningcss');
const root = path.resolve(__dirname, '..');
function load(file, stubs = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => Object.hasOwn(stubs, name) ? stubs[name] : name.startsWith('@/') ? load(name.slice(2) + '.ts', stubs) : name.startsWith('.') && !name.endsWith('.css') ? load(path.join(path.dirname(file), name) + '.ts', stubs) : require(name), exports);
  return exports;
}
const { LOCO_CAFE_ID: loco, WAHED_MASOUB_CAFE_ID: wahed } = load('lib/whatsapp/brand-connection-types.ts');
const { mapAdminWhatsAppSummary: summary } = load('lib/whatsapp/admin-sender-summary.ts');
const { MERAM_CAFE_ID: meram } = load('lib/commerce/meram-profile.ts');
const row = { cafe_id: wahed, status: 'connected', requested_phone: '966500000001', verified_phone: '966500000001', instance_id: 'fixture-instance', transactional_requested_at: '2026-11-17T10:00:00Z', updated_at: '2026-11-17T10:00:00Z' };
assert.equal(summary(meram, null).source, 'branda');
assert.equal(summary(meram, { ...row, cafe_id: meram }).source, 'private');
assert.equal(summary(meram, { ...row, cafe_id: meram }).platformFallback, true);
assert.equal(summary(meram, { ...row, cafe_id: meram, transactional_requested_at: null }).source, 'branda');
assert.equal(summary(meram, { ...row, cafe_id: meram, verified_phone: '966500000002' }).source, 'branda');
assert.equal(summary(wahed, null).source, 'branda');
assert.equal(summary(wahed, undefined).source, 'unavailable');
assert.equal(summary(wahed, row).source, 'private');
assert.equal(summary(wahed, row).platformFallback, true);
for (const status of ['disconnected', 'provisioning', 'pairing', 'mismatch', 'uncertain', 'error', 'disconnecting']) assert.equal(summary(wahed, { ...row, status }).source, 'branda');
assert.equal(summary(wahed, { ...row, verified_phone: '966500000002' }).source, 'branda');
assert.equal(summary(wahed, { ...row, instance_id: null }).source, 'branda');
assert.equal(summary(wahed, { ...row, transactional_requested_at: null }).connection.purpose, 'campaigns');
assert.equal(summary(wahed, { ...row, transactional_requested_at: null }).source, 'branda');
assert.equal(summary('other', { ...row, cafe_id: 'other' }).source, 'private');
assert.equal(summary('other', { ...row, cafe_id: 'other' }).connection.purpose, 'customers');
assert.equal(summary('other', row).source, 'unavailable');
assert.equal(summary(loco, null).source, 'private');
assert.equal(summary(loco, { ...row, cafe_id: loco, status: 'uncertain' }).platformFallback, false);
assert.equal(summary(wahed, row, true).sendingPaused, true);
const safe = JSON.stringify(summary(wahed, { ...row, encrypted_credentials: 'secret-fixture', webhook_token_hash: 'secret-fixture' }));
assert.ok(!safe.includes('secret-fixture'));

const style = fs.readFileSync(path.join(root, 'components/admin/brand-directory.module.css'), 'utf8');
const compiledStyle = transform({ filename: 'brand-directory.module.css', code: Buffer.from(style), cssModules: true });
const source = fs.readFileSync(path.join(root, 'components/admin/brand-directory.tsx'), 'utf8');
for (const [, name] of source.matchAll(/\bs\.(\w+)/g)) assert.ok(compiledStyle.exports[name], name);
const { BrandDirectory } = load('components/admin/brand-directory.tsx', { '@/components/admin/brand-country-options': { BrandCountryOptions: () => null }, './brand-directory.module.css': { __esModule: true, default: new Proxy({}, { get: (_, name) => name }) } });
function render(sender) {
  return renderToStaticMarkup(React.createElement(BrandDirectory, { cafes: [{ id: wahed, name: 'علامة اختبار', slug: 'fixture-brand', status: 'نشط', planId: '', totalRevenue: 0, whatsappSender: sender }], plans: [], onManage() {} }));
}
const privateHtml = render(summary(wahed, row));
assert.ok(privateHtml.includes('رقمهم الخاص') && privateHtml.includes('fixture-instance') && privateHtml.includes('+966500000001'));
assert.ok(privateHtml.includes('<details') && privateHtml.includes('برندة بديل عند تعذر الاتصال'));
assert.ok(render(summary(wahed, null)).includes('رقم برندة'));
assert.ok(render(undefined).includes('تعذر قراءة حالة الربط'));
assert.ok(render(summary(wahed, row, true)).includes('إرسال العلامة متوقف'));
assert.ok(render(summary('other', { ...row, cafe_id: 'other', transactional_requested_at: null })).includes('رقم خاص للحملات'));

(async () => {
  const adminSource = fs.readFileSync(path.join(root, 'lib/data/admin.ts'), 'utf8');
  const start = adminSource.indexOf('async function getBrandDirectoryWhatsApp(');
  const end = adminSource.indexOf('\nconst featureOverrideSchema', start);
  const fnSource = adminSource.slice(start, end) + '\nexports.read = getBrandDirectoryWhatsApp';
  const code = ts.transpileModule(fnSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const ids = Array.from({ length: 101 }, (_, i) => 'cafe-' + i), queries = [];
  const db = { from(table) { assert.equal(table, 'brand_marketing_connections'); return { select(columns) { assert.ok(!/\*|credentials|webhook|token/.test(columns)); return { async in(key, selected) { assert.equal(key, 'cafe_id'); queries.push(selected); return selected.length === 100 ? { data: [{ ...row, cafe_id: selected[0] }, { ...row, cafe_id: 'foreign-brand' }], error: null } : { data: null, error: { message: 'read failed' } }; } }; } }; } };
  const exports = {};
  new Function('createAdminClient', 'exports', code)(() => db, exports);
  const result = await exports.read(ids);
  assert.equal(queries.length, 2);
  assert.equal(result.get(ids[0]).instance_id, 'fixture-instance');
  assert.equal(result.get(ids[1]), null);
  assert.equal(result.get(ids[100]), undefined);
  assert.equal(result.has('foreign-brand'), false);
  const ownerGuard = adminSource.indexOf('await requirePlatformAdmin();', adminSource.indexOf('export async function getAdminCafes'));
  assert.ok(ownerGuard > 0 && ownerGuard < adminSource.indexOf('getBrandDirectoryWhatsApp(cafeIds)', ownerGuard));
  console.log('Admin WhatsApp summary: sender policy, failed reads, safe bounded metadata, responsive markup and CSS checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
