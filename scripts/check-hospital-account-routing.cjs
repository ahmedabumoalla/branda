const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
const inputs = new Set();
let assertions = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions++; };
function load(file, mocks = {}) {
  inputs.add(file);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'server-only') return {};
    if (name.startsWith('@/')) throw Error('UNMOCKED ' + name);
    return require(name);
  }, exports);
  return exports;
}

async function main() {
  const originalFlag = process.env.STOREFRONT_ENABLED;
  delete process.env.STOREFRONT_ENABLED;
  try {
    const routing = load('lib/commerce/hospital-account-routing.ts');
    const availability = load('lib/platform/storefront-availability.ts');
    let sessionCalls = [];
    const proxy = load('proxy.ts', {
      '@/lib/commerce/hospital-account-routing': routing,
      '@/lib/platform/storefront-availability': availability,
      '@/lib/cashier/session-recovery': { recoverExpiredCashierAction: async () => null },
      '@/lib/cashier/persistent-session': { refreshCashierCookie: async (_, response) => { response.cookies.set('cashier', 'preserved'); return response; } },
      '@/lib/supabase/middleware': { updateSession: async request => {
        sessionCalls.push({ marker: request.headers.get(routing.hospitalAccountRouteHeader), cookie: request.cookies.get('test')?.value, body: request.method === 'POST' ? await request.clone().text() : null });
        const response = NextResponse.next({ request });
        response.cookies.set('auth', 'refreshed');
        return response;
      } },
      '@/lib/supabase/admin': { createAdminClient: () => { throw Error('No database in test'); } },
    }).proxy;
    function request(pathname, method = 'GET', marker = 'spoofed', body) {
      return new NextRequest('https://barndaksa.com' + pathname, { method, headers: { host: 'barndaksa.com', cookie: 'test=original', [routing.hospitalAccountRouteHeader]: marker }, ...(body ? { body } : {}) });
    }
    const rows = [];
    const printedPath = '/loyalty/brand-8ad185ee82e3';
    const printedQr = printedPath + '?source=qr';
    for (const method of ['GET', 'HEAD']) {
      const result = await proxy(request(printedQr, method));
      check(result.status, 307, 'Printed QR redirects immediately');
      check(result.headers.get('location'), 'https://barndaksa.com/loyalty/mind-hospital?source=qr', 'MIND enrollment');
      check(result.headers.get('cache-control'), 'no-store', 'QR redirect is not cached');
    }
    for (const path of [printedPath, printedPath + '?source=menu', printedQr + '&branch=branch-id', printedPath + '/access?token=test', '/loyalty/mind-hospital?source=qr']) {
      check((await proxy(request(path))).headers.get('location'), null, 'Separate enrollment and member routes');
    }
    check((await proxy(request(printedQr, 'POST'))).headers.get('location'), null, 'Do not forward submissions');
    for (const route of [routing.hospitalAccountPath, routing.hospitalAccountLoginPath, routing.hospitalAccountPath + '/', routing.hospitalAccountEntryHref()]) for (const method of ['GET', 'HEAD']) {
      const before = sessionCalls.length;
      const response = await proxy(request(route, method));
      check(response.headers.get('x-middleware-next'), '1', 'Financial portal reaches original page');
      check(response.headers.get('location'), null, 'No redirect into archived menu');
      check(sessionCalls.length, before + 1, 'Original Auth refresh runs for portal');
      check(sessionCalls.at(-1).marker, '1', 'Proxy replaces incoming marker');
      check(response.headers.get('x-middleware-request-' + routing.hospitalAccountRouteHeader), '1', 'Marker forwarded as request header');
      check(response.cookies.get('auth')?.value, 'refreshed', 'Session refresh cookie retained');
      check(response.cookies.get('cashier')?.value, 'preserved', 'Existing cashier cookie refresh retained');
      rows.push({ route, method, outcome: 'page with original session refresh' });
    }
    for (const route of ['/c/mind-hospital/account', '/c/mind-hospital/hospital-account/other', '/c/another/hospital-account', '/c/another/login', '/app/mind-hospital/hospital-account']) {
      const before = sessionCalls.length;
      const response = await proxy(request(route));
      check(response.status, 308, 'Unrelated route retains archived alias redirect');
      check(sessionCalls.length, before, 'Spoofed marker grants no portal routing');
      check(response.headers.get('location').includes('/menu/'), true, 'Original menu destination retained');
      rows.push({ route, method: 'GET', outcome: 'original menu redirect' });
    }
    for (const route of ['/c/mind-hospital/account', '/c/another/hospital-account', '/api/public/cafe/mind-hospital']) {
      const before = sessionCalls.length;
      const response = await proxy(request(route, 'POST', '1', 'archived mutation'));
      check(response.status, 404, 'Archived POST remains unavailable');
      check(sessionCalls.length, before, 'Blocked mutation starts no session action');
      rows.push({ route, method: 'POST', outcome: '404 unchanged' });
    }
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('streamed action body')); controller.close(); } });
    const response = await proxy(request(routing.hospitalAccountLoginPath, 'POST', 'spoofed', body));
    check(sessionCalls.at(-1), { marker: '1', cookie: 'original', body: 'streamed action body' }, 'Reconstructed NextRequest preserves streamed POST and request cookies');
    check(response.cookies.get('auth')?.value, 'refreshed', 'POST response preserves Auth cookie');
    check(response.cookies.get('cashier')?.value, 'preserved', 'POST response preserves cashier cookie');
    await proxy(request('/dashboard/finance'));
    check(sessionCalls.at(-1).marker, null, 'Marker removed on unrelated session routes');
    check((await proxy(request('/c/mind-hospital/login?next=' + encodeURIComponent(routing.hospitalAccountPath)))).headers.get('location'), 'https://barndaksa.com' + routing.hospitalAccountLoginPath, 'Old exact account login URL reaches dedicated login');
    check((await proxy(request('/c/mind-hospital/login?next=https://outside.test'))).headers.get('location'), 'https://barndaksa.com/menu/mind-hospital', 'Foreign return destination never activates exemption');

    let marker = null;
    const blocked = new Proxy({}, { get() { throw Error('Archived theme must not load'); } });
    const layout = load('app/c/[slug]/layout.tsx', {
      '@/lib/platform/storefront-availability': availability,
      '@/lib/commerce/hospital-account-routing': routing,
      'next/headers': { headers: async () => new Headers(marker ? { [routing.hospitalAccountRouteHeader]: marker } : {}) },
      ...Object.fromEntries(['@/components/cafe/cafe-favicon-controller', '@/components/cafe/public-cafe-visit-tracker', '@/lib/cafe/cafe-display-logo', '@/lib/data/cafes', '@/lib/data/settings', '@/lib/data/theme', '@/lib/performance/server-memory-cache', '@/lib/cafe/use-cafe-theme-page'].map(name => [name, blocked])),
    });
    marker = '1';
    check(await layout.default({ params: Promise.resolve({ slug: 'mind-hospital' }), children: 'portal' }), 'portal', 'Portal bypasses archived theme and tracking shell');
    check((await layout.generateMetadata({ params: Promise.resolve({ slug: 'mind-hospital' }) })).robots, { index: false, follow: false }, 'Portal metadata remains private');
    await assert.rejects(() => layout.default({ params: Promise.resolve({ slug: 'other' }), children: 'other' }), /غير متاح/); assertions++;
    marker = null;
    await assert.rejects(() => layout.default({ params: Promise.resolve({ slug: 'mind-hospital' }), children: 'other' }), /غير متاح/); assertions++;

    let state, calls;
    const digits = load('lib/auth/input-digits.ts');
    const ownerPhone = load('lib/auth/owner-phone.ts', { '@/lib/auth/input-digits': digits });
    const brandPhone = load('lib/auth/brand-phone.ts', { '@/lib/auth/owner-phone': ownerPhone });
    const reset = () => { calls = []; state = { features: ['finance'], configured: true, allowed: true, user: { id: 'verified-user', phone: '+966500000001', phone_confirmed_at: '2026-11-15' }, session: { token: 'mock' }, error: null }; };
    const auth = load('app/actions/hospital-customer-auth.ts', {
      '@/lib/auth/brand-phone': brandPhone,
      '@/lib/data/brand-phone-country': { getBrandPhoneCountryBySlug: async () => 'SA' },
      '@/lib/data/feature-entitlements': { getPublicCafeFeatureCodesBySlug: async slug => { calls.push(['features', slug]); return state.features; } },
      '@/lib/platform/feature-gates': { featureCodesAllow: (features, code) => features.includes(code) },
      '@/lib/auth/phone-otp': { isPhoneOtpRequiredForBrand: () => state.configured, isAllowedCustomerOtpPhone: () => state.allowed, requestCustomerPhoneOtp: async (...args) => { calls.push(['request', ...args]); return { required: true, ok: true, maskedPhone: '9665****0001', resendAfterSeconds: 60 }; } },
      '@/lib/supabase/server': { createClient: async () => ({ auth: { verifyOtp: async input => { calls.push(['verify', input]); return { data: { user: state.user, session: state.session }, error: state.error }; }, signOut: async options => { calls.push(['signOut', options]); } } }) },
    });
    reset();
    check((await auth.requestHospitalCustomerOtpAction('mind-hospital', '0500000001')).ok, true, 'Finance portal uses original OTP request');
    check(calls.find(call => call[0] === 'request'), ['request', 'mind-hospital', '0500000001', 'customer_login'], 'Original OTP policy/rate limiting source preserved');
    for (const scenario of [{ slug: 'other', features: ['finance'] }, { slug: 'mind-hospital', features: [] }, { slug: 'mind-hospital', features: ['loyalty'] }]) {
      reset(); state.features = scenario.features;
      check((await auth.requestHospitalCustomerOtpAction(scenario.slug, '0500000001')).ok, false, 'Wrong brand or missing finance denies request');
      check(calls.some(call => call[0] === 'request'), false, 'Denied request never reaches OTP provider');
      check((await auth.completeHospitalCustomerOtpAction(scenario.slug, '0500000001', '123456')).ok, false, 'Wrong brand or missing finance denies verify');
      check(calls.some(call => call[0] === 'verify'), false, 'Denied verification never authenticates');
    }
    reset();
    check((await auth.completeHospitalCustomerOtpAction('mind-hospital', '0500000001', '123456')).ok, true, 'Verified original Auth identity is accepted');
    check(calls.find(call => call[0] === 'verify'), ['verify', { phone: '+966500000001', token: '123456', type: 'sms' }], 'Exact normalized phone and OTP sent to original Auth');
    for (const mutate of [s => { s.configured = false; }, s => { s.allowed = false; }]) {
      reset(); mutate(state);
      check((await auth.completeHospitalCustomerOtpAction('mind-hospital', '0500000001', '123456')).ok, false, 'Original OTP restrictions remain required');
      check(calls.some(call => call[0] === 'verify'), false, 'No verify when original OTP restrictions deny');
    }
    for (const code of ['123', 'abcdef', 123456]) {
      reset(); check((await auth.completeHospitalCustomerOtpAction('mind-hospital', '0500000001', code)).ok, false, 'Invalid code rejected');
      check(calls.some(call => call[0] === 'verify'), false, 'Invalid code never authenticates');
    }
    for (const user of [{ id: 'other', phone: '+966500000002', phone_confirmed_at: 'yes' }, { id: 'same', phone: '+966500000001' }]) {
      reset(); state.user = user;
      check((await auth.completeHospitalCustomerOtpAction('mind-hospital', '0500000001', '123456')).ok, false, 'Verified phone identity must match');
      check(calls.find(call => call[0] === 'signOut'), ['signOut', { scope: 'local' }], 'Mismatched session is cleared');
    }
    reset(); state.error = { message: 'invalid' };
    check((await auth.completeHospitalCustomerOtpAction('mind-hospital', '0500000001', '123456')).ok, false, 'Invalid OTP returns error');

    for (const file of ['scripts/check-hospital-account-routing.cjs', 'app/c/[slug]/hospital-account/page.tsx', 'app/c/[slug]/hospital-account/login/page.tsx', 'components/hospital/doctor-login.tsx', 'components/hospital/doctor-login.module.css', 'lib/data/hospital-doctor-portal.ts', 'lib/auth/phone-otp.ts', 'lib/supabase/middleware.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts']) inputs.add(file);
    const report = { at: new Date().toISOString(), runtime: process.version, passed: true, assertions, rows, command: 'node scripts/check-hospital-account-routing.cjs', limits: ['Actual proxy/layout/action functions with mocked service/auth/OTP dependencies; real NextRequest/NextResponse including streamed POST', 'No real OTP, account/session changes, database writes, messages or live customer identity'], inputs: Object.fromEntries([...inputs].sort().map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])) };
    fs.mkdirSync('output/mind-ui-review-20261115', { recursive: true });
    fs.writeFileSync('output/mind-ui-review-20261115/hospital-account-routing-check.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, assertions, routes: rows.length }));
  } finally { if (originalFlag === undefined) delete process.env.STOREFRONT_ENABLED; else process.env.STOREFRONT_ENABLED = originalFlag; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
