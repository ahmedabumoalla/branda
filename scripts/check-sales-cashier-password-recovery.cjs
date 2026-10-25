const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');

function load(file, mocks = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', compiled)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'server-only') return {};
    if (name.endsWith('.css')) return new Proxy({}, { get: (_, key) => key });
    if (name.startsWith('@/') || name.startsWith('./')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`, mocks);
    }
    return require(name);
  }, exports);
  return exports;
}
function hooks() {
  const slots = []; let cursor = 0;
  return {
    api: { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; }, useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); } },
    render(fn) { cursor = 0; return fn(); },
  };
}
function nodes(tree) { return Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : []; }
function text(tree) { return Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : typeof tree === 'string' ? tree : ''; }
function find(tree, predicate) { const result = nodes(tree).find(predicate); assert(result, 'Expected UI control'); return result; }
const button = (tree, label) => find(tree, n => n.type === 'button' && text(n) === label);

async function main() {
  let scenario = 'success', clientCount = 0, ephemeralCount = 0; const events = [];
  const user = { id: 'actor', phone: '966500000000' };
  const client = {
    auth: {
      verifyOtp: async input => {
        events.push('verify'); assert.deepEqual(input, { phone: '+966500000000', token: '123456', type: 'sms' });
        if (scenario === 'verifyThrows') throw Error('private auth details');
        return { error: scenario === 'badCode' ? { message: 'private auth details' } : null, data: {
          user: scenario === 'wrongPhone' ? { ...user, phone: '966500000001' } : user,
          session: scenario === 'noSession' ? null : { access_token: 'test-only-session', refresh_token: 'test-only-refresh', user: scenario === 'wrongSession' ? { id: 'someone-else' } : user },
        } };
      },
      updateUser: async input => { events.push('update'); assert.deepEqual(input, { password: 'Test!Pass9' }); if (scenario === 'updateThrows') throw Error('private update details'); return { error: scenario === 'updateFails' ? { message: 'private update details' } : null, data: { user: scenario === 'wrongUpdatedUser' ? { id: 'someone-else' } : user } }; },
      signOut: async opts => { assert.deepEqual(opts, { scope: 'local' }); events.push('signOut'); return {}; },
    },
    rpc: async (name, args) => {
      events.push('destinations'); assert.equal(name, 'brand_finance_sales_cashier_destinations'); assert.equal(args, undefined);
      const brands = [{ id: '00000000-0000-4000-8000-000000000001', slug: 'brand-one', name: 'One' }];
      if (scenario === 'multi') brands.push({ id: '00000000-0000-4000-8000-000000000002', slug: 'brand-two', name: 'Two' });
      if (scenario === 'unsafeSlug') brands[0].slug = 'https://other.test';
      return { error: scenario === 'lookupFails' ? { message: 'private database details' } : null, data: scenario === 'revoked' ? [] : brands };
    },
  };
  const mocks = {
    '@supabase/supabase-js': { createClient: (url, key, options) => { ephemeralCount++; assert.equal(url, 'https://test.invalid'); assert.equal(key, 'test-anon'); assert.deepEqual(options.auth, { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }); return client; } },
    '@/lib/supabase/server': { createClient: async () => { clientCount++; return { auth: { setSession: async session => { events.push('persist'); assert.deepEqual(session, { access_token: 'test-only-session', refresh_token: 'test-only-refresh' }); if (scenario === 'persistThrows') throw Error('private persistence'); return { error: scenario === 'persistFails' ? {} : null }; } } }; } },
    '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async (name, args) => { events.push('eligible'); assert.equal(name, 'brand_finance_sales_cashier_phone_enabled'); assert.deepEqual(args, { p_phone: '966500000000' }); return { data: scenario !== 'ineligible', error: scenario === 'eligibilityFails' ? {} : null }; } }) },
    'next/headers': {}, '@/lib/data/cafes': {}, '@/lib/data/feature-entitlements': {}, '@/lib/data/brand-finance': {}, '@/lib/whatsapp/green-api': {}, '@/lib/barndaksa/env': { requireSupabaseUrl: () => 'https://test.invalid', requireSupabaseAnonKey: () => 'test-anon' },
  };
  const access = load('lib/data/finance-access.ts', mocks);
  const action = load('app/actions/finance-access.ts', { ...mocks, '@/lib/data/finance-access': access }).resetSalesCashierPasswordAction;
  const reset = (password = 'Test!Pass9', confirmation = password, phone = '٠٥٠٠٠٠٠٠٠٠', code = '١٢٣٤٥٦') => action(phone, code, password, confirmation);
  for (const password of ['short', 'test!pass9', 'TestPass9', 'Test!\nPass9', 'A!'.repeat(65)]) assert.equal((await reset(password)).ok, false);
  assert.equal((await reset('Test!Pass9', 'Different!9')).ok, false);
  assert.equal((await reset('Test!Pass9', 'Test!Pass9', 'bad-phone')).ok, false);
  assert.equal((await reset('Test!Pass9', 'Test!Pass9', '0500000000', '12345')).ok, false);
  assert.equal(clientCount, 0, 'Validation never authenticates or modifies a password');
  assert.equal(ephemeralCount, 0);
  for (scenario of ['ineligible', 'eligibilityFails', 'badCode', 'verifyThrows', 'wrongPhone', 'noSession', 'wrongSession', 'revoked', 'lookupFails', 'unsafeSlug', 'updateFails', 'updateThrows', 'wrongUpdatedUser']) {
    events.length = 0;
    const result = await reset(); assert.equal(result.ok, false, scenario); assert(!JSON.stringify(result).includes('private')); assert(!('redirectTo' in result)); assert(events.includes('signOut'));
    if (!scenario.startsWith('update') && scenario !== 'wrongUpdatedUser') assert(!events.includes('update'), `${scenario} must not update passwords`);
    assert(!events.includes('persist'), 'Failed checks never write authenticated cookies');
    if (scenario === 'ineligible' || scenario === 'eligibilityFails') assert(!events.includes('verify'));
  }
  for (scenario of ['persistFails', 'persistThrows']) { events.length = 0; const result = await reset(); assert.equal(result.ok, false); assert.match(result.message, /تم حفظ كلمة المرور/); assert(events.includes('signOut')); }
  scenario = 'success'; events.length = 0; clientCount = 0; ephemeralCount = 0;
  assert.deepEqual(await reset(), { ok: true, redirectTo: '/finance/brand-one/pos' });
  assert.equal(ephemeralCount, 1, 'OTP, membership and password update share one isolated client');
  assert.equal(clientCount, 1, 'SSR client is used only to persist the completed session');
  assert.deepEqual(events, ['eligible', 'verify', 'destinations', 'update', 'persist']);
  scenario = 'multi'; events.length = 0;
  assert.deepEqual((await reset()).brands, [{ slug: 'brand-one', name: 'One' }, { slug: 'brand-two', name: 'Two' }]);
  assert(!events.includes('signOut'));

  const state = hooks(), requests = [], resetCalls = [], navigated = []; let locale = 'ar', result = { ok: false, message: 'الرمز غير صحيح أو منتهي اطلب رمزًا جديدًا' };
  const { cashierText, cashierError } = load('lib/cashier/language.ts');
  const { SalesCashierLogin } = load('components/finance/sales-cashier-login.tsx', {
    react: state.api, 'next/link': { __esModule: true, default: function Link() {} },
    'next/navigation': { useRouter: () => ({ replace: target => navigated.push(target), refresh() {} }) },
    '@/components/ui/barndaksa-logo': { BarndaksaLogo: function Logo() {} },
    '@/components/cashier/cashier-system-switch': { CashierSystemSwitch: function Switch() {} },
    '@/components/cashier/cashier-language': { CashierLanguageSwitch: function Language() {}, useCashierLanguage: () => ({ locale, dir: locale === 'ar' ? 'rtl' : 'ltr', t: value => cashierText(locale, value), errorText: value => cashierError(locale, value) }) },
    '@/app/actions/finance-access': { requestSalesCashierOtpAction: async phone => { requests.push(phone); return { ok: true, message: 'إذا كان الرقم مرتبطًا بكاشير مبيعات نشط فسيصلك رمز الدخول على واتساب' }; }, resetSalesCashierPasswordAction: async (...args) => { resetCalls.push(args); return result; } },
  });
  const render = () => state.render(SalesCashierLogin), fields = { phone: '0500000000', code: '123456', newPassword: 'Test!Pass9', confirmation: 'Mismatch!9' };
  const oldFormData = global.FormData; let formResets = 0;
  global.FormData = class { get(name) { return fields[name] ?? ''; } };
  const submit = () => find(render(), n => n.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: { reset() { formResets++; } } });
  try {
    button(render(), 'نسيت كلمة المرور أو تريد تعيينها؟').props.onClick();
    assert.equal(requests.length, 0, 'Choosing password setup does not send automatically');
    assert(!nodes(render()).some(n => n.type === 'input' && n.props.name === 'password'));
    const first = submit(); await submit(); await first; assert.deepEqual(requests, ['0500000000']);
    for (const name of ['code', 'newPassword', 'confirmation']) assert(find(render(), n => n.type === 'input' && n.props.name === name).props.required);
    assert.equal(find(render(), n => n.type === 'input' && n.props.name === 'newPassword').props.autoComplete, 'new-password');
    await submit(); assert.equal(resetCalls.length, 0); assert.match(text(render()), /لا يطابق/);
    locale = 'en'; assert.equal(render().props.dir, 'ltr'); assert.match(text(render()), /Set your cashier password/); assert.match(text(render()), /confirmation does not match/);
    fields.confirmation = fields.newPassword; await submit(); assert.equal(resetCalls.length, 1); assert.match(text(render()), /incorrect or expired/); assert.equal(navigated.length, 0); assert.equal(formResets, 0);
    assert.deepEqual(resetCalls[0], ['0500000000', '123456', 'Test!Pass9', 'Test!Pass9']);
    result = { ok: true, redirectTo: '/finance/brand-one/pos' }; await submit(); assert.deepEqual(navigated, ['/finance/brand-one/pos']); assert.equal(formResets, 1);
  } finally { global.FormData = oldFormData; }
  console.log('Sales cashier password recovery: validation, phone/session identity, live access, same-client update, failure cleanup and bilingual UI PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
