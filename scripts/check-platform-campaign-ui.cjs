const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transform } = require('lightningcss');
const root = path.resolve(__dirname, '..');
const component = 'components/admin/platform-campaign-console.tsx';
const source = fs.readFileSync(path.join(root, component), 'utf8');
const css = transform({ filename: 'platform-campaign-console.module.css', code: fs.readFileSync(path.join(root, 'components/admin/platform-campaign-console.module.css')), cssModules: true });
for (const [, name] of source.matchAll(/\bs\.(\w+)/g)) assert(css.exports[name], `CSS class ${name}`);
function load(file, overrides = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', compiled)(name => {
    if (name in overrides) return overrides[name];
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', overrides);
    return require(name);
  }, exports);
  return exports;
}
const storage = { createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: async () => ({ error: null }) }) } }) };
const base = { sender: { phone: '966508333556', ready: true, status: 'authorized' }, brands: [{ id: 'brand-1', name: 'ديلي كيك' }, { id: 'brand-2', name: 'توقذر بلانتس' }], campaigns: [] };
const people = { items: [{ id: '966511111111', name: 'عميل أول', phone: '966511111111', brands: base.brands }, { id: '966522222222', name: 'عميل ثان', phone: '966522222222', brands: [base.brands[0]] }], page: 1, pageSize: 25, total: 67 };
function nodes(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(item => nodes(item, predicate));
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
}
function text(node) { return node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node.props?.children); }
function field(tree, id) { const found = nodes(tree, n => n.props?.id === id)[0]; assert(found, id); return found; }
function button(tree, label) { const found = nodes(tree, n => n.type === 'button' && text(n) === label)[0]; assert(found, `Button ${label}`); return found; }
function harness(initial = base) {
  const states = [], effects = [], cleanups = new Map(); let cursor = 0;
  const hooks = { ...React, useState(value) { const i = cursor++; if (!(i in states)) states[i] = value; return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; }, useRef(value) { const i = cursor++; if (!(i in states)) states[i] = { current: value }; return states[i]; }, useEffect(fn, deps) { const i = cursor++; const before = states[i]; if (!before || !deps || before.length !== deps.length || deps.some((d, j) => !Object.is(d, before[j]))) { states[i] = deps; effects.push(() => { cleanups.get(i)?.(); cleanups.set(i, fn()); }); } } };
  const { PlatformCampaignConsole } = load(component, { react: hooks, '@/lib/supabase/client': storage });
  return { render() { cursor = 0; return PlatformCampaignConsole({ initialDashboard: initial }); }, flush() { effects.splice(0).forEach(fn => fn()); }, cleanup() { cleanups.forEach(fn => fn?.()); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const actualFetch = globalThis.fetch, actualWindow = globalThis.window;
const requests = [];
let failFirstLaunch = false, launchCount = 0;
globalThis.window = { setTimeout, clearTimeout, setInterval, clearInterval };
globalThis.fetch = async (url, options = {}) => {
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ url, body });
  if (body?.action === 'createCampaign') { launchCount++; if (failFirstLaunch && launchCount === 1) throw new Error('network uncertain'); return { ok: true, status: 200, json: async () => ({ ok: true, data: { campaignId: 'created-1', total: body.audience.mode === 'filtered' ? 67 : body.audience.phones.length } }) }; }
  return { ok: true, status: 200, json: async () => ({ ok: true, data: String(url).includes('/audience?') ? people : base }) };
};
async function main() {
  const { PlatformCampaignConsole, platformCampaignDraftError, platformCampaignSchedule, platformCampaignSaudiInput } = load(component, { '@/lib/supabase/client': storage });
  const html = renderToStaticMarkup(React.createElement(PlatformCampaignConsole, { initialDashboard: base }));
  assert(html.includes('الحملات التسويقية') && html.includes('واتساب برندة'));
  assert(html.includes('966508333556') && html.includes('كل العلامات التجارية'));
  assert(!html.includes('لإيقاف الرسائل') && !source.includes('MARKETING_STOP_FOOTER'), 'No injected stop footer');
  assert(!source.includes('/api/marketing"'), 'Admin composer never calls tenant campaign endpoint');
  assert(html.includes('image/jpeg,image/png,image/webp,video/mp4'));
  assert(html.includes('<dialog') && html.includes('aria-labelledby="campaign-review-heading"'));
  assert.equal(platformCampaignDraftError('الحملة', 'ن'.repeat(1024), 1, { status: 'ready', media: { id: 'm' } }), null);
  assert(platformCampaignDraftError('الحملة', 'ن'.repeat(1025), 1, { status: 'ready', media: { id: 'm' } }));
  assert(platformCampaignDraftError('الحملة', 'نص', 1, { status: 'uploading' }));
  assert(platformCampaignDraftError('الحملة', 'نص', 0));
  console.log('PASS server render, Branda sender, footer-free message and media limits');

  const h = harness(); let tree = h.render(); h.flush(); await tick(); tree = h.render();
  field(tree, 'platform-campaign-name').props.onChange({ target: { value: 'عنوان داخلي' } });
  tree = h.render(); field(tree, 'platform-campaign-body').props.onChange({ target: { value: 'رسالة الحملة كما كُتبت' } });
  tree = h.render(); button(tree, 'تحديد كل نتائج الفلتر').props.onClick();
  tree = h.render(); assert(text(tree).includes('67 محدد'), 'All matching uses server total, not loaded page length');
  button(tree, 'مراجعة الحملة والإرسال').props.onClick();
  tree = h.render(); assert.equal(requests.filter(r => r.body?.action === 'createCampaign').length, 0, 'Review never sends');
  const reviewText = nodes(tree, n => n.props?.className === 'reviewMessage')[0];
  assert.equal(text(reviewText), 'رسالة الحملة كما كُتبت', 'Exact body only in final preview');
  failFirstLaunch = true;
  await button(tree, 'إطلاق الحملة الآن').props.onClick(); await tick(); tree = h.render();
  assert.equal(field(tree, 'platform-campaign-name').props.disabled, true, 'Ambiguous attempt locks composition');
  assert.equal(button(tree, 'العودة للتعديل').props.disabled, true);
  button(tree, 'تحقق من الحملة وأكمل').props.onClick(); await tick(); await tick(); tree = h.render();
  const sent = requests.filter(r => r.body?.action === 'createCampaign');
  assert.equal(sent.length, 2); assert.equal(sent[0].body.idempotencyKey, sent[1].body.idempotencyKey, 'Retry uses same idempotency key');
  assert.equal(sent[0].body.body, 'رسالة الحملة كما كُتبت');
  assert.equal(sent[0].body.title, 'عنوان داخلي');
  assert.equal(sent[0].body.audience.mode, 'filtered');
  assert.equal(field(tree, 'platform-campaign-name').props.value, '', 'Successful request resets draft');
  assert(text(tree).includes('بدأت الحملة إلى 67 عميل'));
  console.log('PASS explicit review, cross-page selection, exact payload, ambiguous retry deduplication');
  h.cleanup();

  const selection = harness(); tree = selection.render(); selection.flush(); await tick(); tree = selection.render();
  nodes(tree, n => n.type === 'input' && n.props['aria-label']?.startsWith('اختيار عميل أول'))[0].props.onChange({ target: { checked: true } });
  tree = selection.render(); assert(text(tree).includes('1 محدد'));
  field(tree, 'platform-campaign-brand').props.onChange({ target: { value: 'brand-1' } });
  tree = selection.render(); assert(text(tree).includes('0 محدد'), 'Changing brand clears selection');
  nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  tree = selection.render(); selection.flush(); await tick();
  assert(requests.some(r => r.url.includes('/audience?') && r.url.includes('brandId=brand-1')), 'Brand search goes to server');
  selection.cleanup();
  console.log('PASS filter changes reset selection and server brand filter is applied');
  const fixedNow = Date.parse('2026-11-02T10:00:00Z');
  const oldTimezone = process.env.TZ;
  try {
    for (const tz of ['America/Los_Angeles', 'Asia/Tokyo', 'UTC']) {
      process.env.TZ = tz;
      assert.equal(platformCampaignSchedule('2026-11-02T15:20', fixedNow).scheduledAt, '2026-11-02T12:20:00.000Z', `Saudi conversion independent of ${tz}`);
      assert.equal(platformCampaignSaudiInput(fixedNow), '2026-11-02T13:00');
    }
  } finally { if (oldTimezone === undefined) delete process.env.TZ; else process.env.TZ = oldTimezone; }
  assert(platformCampaignSchedule('2026-02-30T15:20', fixedNow).error, 'Reject calendar overflow');
  assert(platformCampaignSchedule('2026-11-02T12:00', fixedNow).error, 'Reject elapsed Saudi time');
  assert(platformCampaignSchedule('2027-11-03T13:00', fixedNow).error, 'Reject beyond 365 days');
  const futureLocal = platformCampaignSaudiInput(Date.now() + 2 * 86400_000);
  const futureIso = platformCampaignSchedule(futureLocal).scheduledAt;
  const scheduled = harness(); tree = scheduled.render(); scheduled.flush(); await tick(); tree = scheduled.render();
  field(tree, 'platform-campaign-name').props.onChange({ target: { value: 'حملة مجدولة' } });
  tree = scheduled.render(); field(tree, 'platform-campaign-body').props.onChange({ target: { value: 'رسالة الموعد المحدد' } });
  tree = scheduled.render(); button(tree, 'تحديد كل نتائج الفلتر').props.onClick();
  tree = scheduled.render(); button(tree, 'جدولة الحملة').props.onClick();
  tree = scheduled.render(); assert.equal(field(tree, 'platform-campaign-scheduled').props.type, 'datetime-local');
  field(tree, 'platform-campaign-scheduled').props.onChange({ target: { value: futureLocal } });
  tree = scheduled.render(); const beforeScheduledRequests = requests.filter(r => r.body?.action === 'createCampaign').length;
  button(tree, 'مراجعة الحملة والإرسال').props.onClick();
  tree = scheduled.render(); assert(text(tree).includes('موعد المعالجة') && text(tree).includes('بتوقيت السعودية'));
  assert.equal(requests.filter(r => r.body?.action === 'createCampaign').length, beforeScheduledRequests, 'Scheduling review does not launch early');
  launchCount = 0; failFirstLaunch = true;
  button(tree, 'تأكيد جدولة الحملة').props.onClick(); await tick(); tree = scheduled.render();
  assert.equal(field(tree, 'platform-campaign-scheduled').props.disabled, true, 'Uncertain request locks scheduled date');
  button(tree, 'تحقق من الحملة وأكمل').props.onClick(); await tick(); await tick(); tree = scheduled.render();
  const scheduledRequests = requests.filter(r => r.body?.action === 'createCampaign').slice(-2);
  assert.equal(scheduledRequests[0].body.scheduledAt, futureIso);
  assert.equal(scheduledRequests[1].body.scheduledAt, futureIso);
  assert.equal(scheduledRequests[0].body.idempotencyKey, scheduledRequests[1].body.idempotencyKey, 'Scheduling retry keeps exact key and time');
  assert(text(tree).includes('تمت جدولة الحملة') && text(tree).includes('تبدأ المعالجة'));
  scheduled.cleanup();
  const scheduledHistory = renderToStaticMarkup(React.createElement(PlatformCampaignConsole, { initialDashboard: { ...base, campaigns: [{ id: 'future', title: 'حملة المستقبل', body: 'رسالة', status: 'queued', createdAt: new Date().toISOString(), scheduledAt: futureIso, mediaKind: null, total: 1, pending: 1, accepted: 0, failed: 0, uncertain: 0, cancelled: 0, suppressed: 0 }] } }));
  assert(scheduledHistory.includes('مجدولة') && scheduledHistory.includes('موعد الإرسال') && scheduledHistory.includes('إلغاء الرسائل المتبقية'));
  console.log('PASS Saudi scheduling across host timezones, date limits, review, locked retries and future history');
  const disconnected = renderToStaticMarkup(React.createElement(PlatformCampaignConsole, { initialDashboard: { ...base, sender: { ...base.sender, ready: false } } }));
  assert(disconnected.includes('يحتاج إلى ربط'));
  const sidebar = fs.readFileSync(path.join(root, 'components/admin/AdminSidebar.tsx'), 'utf8');
  assert(sidebar.includes('["الحملات التسويقية", "/admin/marketing-campaigns", Megaphone]'));
  console.log('PASS unavailable sender, navigation, compiled CSS and reduced-motion rule');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { globalThis.fetch = actualFetch; globalThis.window = actualWindow; });
