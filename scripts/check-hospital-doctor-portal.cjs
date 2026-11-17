const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'server-only') return {};
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'), mocks);
    return require(name);
  }, exports);
  return exports;
}
const id = '11111111-1111-4111-8111-111111111111', doctor = '22222222-2222-4222-8222-222222222222';
const fixture = { brand: { name: 'MND', slug: 'mind-hospital', logoUrl: null }, doctor: { id: doctor, name: 'أحمد محمد', phone: '966500000001' }, invoices: [{ id: '33333333-3333-4333-8333-333333333333', number: 4, createdAt: '2026-11-14T10:00:00Z', total: 100, paid: 40, outstanding: 60, status: 'posted', items: [{ name: 'أمريكانو', quantity: 2, unitPrice: 50, total: 100 }] }], totalInvoiced: 100, totalPaid: 40, balance: 60 };
let user = { id, phone: '+966500000001', phone_confirmed_at: '2026-11-14T09:00:00Z' }, reply = { data: fixture, error: null }, calls = [], checks = 0, authFailure = false;
const { readHospitalDoctorPortal } = load('lib/data/hospital-doctor-portal.ts', {
  '@/lib/supabase/server': { getSessionUser: async () => { if (authFailure) throw Error('private auth failure'); return user; } },
  '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return reply; } }) },
});
async function main() {
  assert.equal((await readHospitalDoctorPortal('different-brand')).state, 'missing'); assert.equal(calls.length, 0); checks++;
  const verified = user; user = null; assert.equal((await readHospitalDoctorPortal('mind-hospital')).state, 'login'); assert.equal(calls.length, 0); checks++;
  user = { ...verified, phone_confirmed_at: null }; assert.equal((await readHospitalDoctorPortal('mind-hospital')).state, 'verify-phone'); assert.equal(calls.length, 0); checks++;
  user = verified; const ready = await readHospitalDoctorPortal('mind-hospital'); assert.equal(ready.state, 'ready'); assert.deepEqual(calls[0], { name: 'hospital_doctor_statement', args: { p_slug: 'mind-hospital', p_user: id } }); checks++;
  reply = { data: { ...fixture, doctor: { ...fixture.doctor, phone: '966500000002' } }, error: null }; assert.equal((await readHospitalDoctorPortal('mind-hospital')).state, 'unavailable'); checks++;
  reply = { data: { ...fixture, brand: { ...fixture.brand, slug: 'other-brand' } }, error: null }; assert.equal((await readHospitalDoctorPortal('mind-hospital')).state, 'unavailable'); checks++;
  reply = { data: null, error: { message: 'HOSPITAL_DOCTOR_NOT_FOUND' } }; assert.equal((await readHospitalDoctorPortal('mind-hospital')).state, 'unlinked'); checks++;
  reply = { data: null, error: { message: 'private database details', code: 'PGRST202' } }; assert.deepEqual(await readHospitalDoctorPortal('mind-hospital'), { state: 'unavailable' }); checks++;
  authFailure = true; assert.deepEqual(await readHospitalDoctorPortal('mind-hospital'), { state: 'unavailable' }); authFailure = false; checks++;
  const { HospitalDoctorAccount } = load('components/hospital/doctor-account.tsx', {
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/image': { __esModule: true, default: ({ unoptimized, priority, ...props }) => React.createElement('img', props) },
  });
  const render = (result, initialLanguage = 'ar') => renderToStaticMarkup(React.createElement(HospitalDoctorAccount, { result, initialLanguage, loginHref: '/c/mind-hospital/login?next=%2Fc%2Fmind-hospital%2Fhospital-account' }));
  const ar = render({ state: 'ready', data: fixture }); assert(ar.includes('أحمد محمد')); assert(ar.includes('أمريكانو')); assert(ar.includes('المتبقي عليك')); assert(ar.includes('<details')); checks++;
  const en = render({ state: 'ready', data: fixture }, 'en'); assert(en.includes('Your MND account')); assert(en.includes('Americano')); assert(!en.includes('أحمد')); assert(!en.includes('أمريكانو')); assert(en.includes('dir="ltr"')); checks++;
  const failure = render({ state: 'unavailable' }); assert(!failure.includes('100')); assert(!failure.includes('أحمد محمد')); assert(failure.includes('تعذر تحميل حسابك الآن')); checks++;
  const login = render({ state: 'login' }); assert(login.includes('next=%2Fc%2Fmind-hospital%2Fhospital-account')); assert(!login.includes('966500000001')); checks++;
  const unsafeLogo = render({ state: 'ready', data: { ...fixture, brand: { ...fixture.brand, logoUrl: 'javascript:alert(1)' } } }); assert(!unsafeLogo.includes('javascript:')); assert(unsafeLogo.includes('dabab-hospital-logo-v1.webp')); checks++;
  console.log(`PASS ${checks} doctor portal authorization, tenant/phone isolation, unavailable states and bilingual invoice checks`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
