import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { transform } from 'lightningcss';
const dependency = createRequire(import.meta.url);
function load(file, stubs = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith('@/')) return load(path.resolve(name.slice(2) + '.ts'), stubs);
    return dependency(name);
  }, exports);
  return exports;
}
const sourcePath = 'components/admin/pages/admin-subscription-requests-page.tsx';
const id = '00000000-0000-4000-8000-000000000001';
const request = { id, cafeId: 'brand', cafeName: 'علامة الاختبار', cafeSlug: 'brand', ownerName: 'مالك العلامة', ownerPhone: '0500000000', ownerEmail: 'owner@example.invalid', planId: 'paid', planName: 'الباقة السنوية', amount: 2832, baseAmount: 3540, durationUnit: 'month', durationCount: 12, receiptUrl: 'https://example.invalid/receipt', receiptStoragePath: `brand/${id}/receipt.pdf`, receiptChannel: 'upload', paymentMethod: 'bank_transfer', status: 'pending_review', createdAt: '2026-10-10T00:00:00Z' };
const page = { requests: [request], total: 21, page: 0, pageSize: 20, filter: 'pending_review' };
function harness(props = {}, actions = {}) {
  const state = [], calls = []; let cursor = 0;
  const hooks = { ...React, useEffect() {}, useCallback: fn => fn, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => state[i] = typeof value === 'function' ? value(state[i]) : value]; }, useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; } };
  const { AdminSubscriptionRequestsPage } = load(sourcePath, { react: hooks, '@/app/actions/subscription-requests': {
    fetchSubscriptionRequestPageAction: async input => { calls.push(['fetch', input]); return { ok: true, data: { ...page, requests: [], ...input } }; },
    reviewSubscriptionRequestAction: async input => { calls.push(['review', input]); return { ok: true, data: { requestId: input.requestId, status: input.decision === 'approve' ? 'approved' : 'rejected' } }; }, ...actions,
  } });
  return { calls, render() { cursor = 0; return AdminSubscriptionRequestsPage({ initialData: page, ...props }); } };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function text(tree) { return tree == null || typeof tree === 'boolean' ? '' : Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'object' ? text(tree.props?.children) : String(tree); }
const button = (h, label) => nodes(h.render()).find(n => n.type === 'button' && text(n) === label);
const html = h => renderToStaticMarkup(h.render());
const h = harness();
for (const value of [request.cafeName, request.ownerName, request.ownerEmail, 'عرض الإيصال', 'سنة', '٢٬٨٣٢']) assert.ok(html(h).includes(value), value);
assert.equal(nodes(h.render()).find(n => n.type === 'a').props.rel, 'noopener noreferrer');
button(h, 'اعتماد وتفعيل الباقة').props.onClick();
assert.equal(h.calls.length, 0, 'opening confirmation does not mutate');
await button(h, 'تأكيد الاعتماد والتفعيل').props.onClick();
assert.equal(h.calls[0][1].decision, 'approve');
assert.ok(html(h).includes('تم اعتماد الطلب وتفعيل الباقة للعميل مباشرة'));
const reject = harness();
button(reject, 'رفض وإلغاء الطلب').props.onClick();
nodes(reject.render()).find(n => n.type === 'textarea').props.onChange({ target: { value: 'المبلغ غير مطابق' } });
await button(reject, 'تأكيد الرفض والإلغاء').props.onClick();
assert.equal(reject.calls[0][1].reason, 'المبلغ غير مطابق');
assert.equal(reject.calls[0][1].decision, 'reject');
assert.ok(html(reject).includes('تم رفض تفعيل الباقة وإلغاء الطلب'));
const waiting = harness({ initialData: { ...page, requests: [{ ...request, status: 'awaiting_receipt', receiptUrl: undefined }] } });
assert.equal(button(waiting, 'اعتماد وتفعيل الباقة').props.disabled, true);
assert.equal(button(waiting, 'رفض وإلغاء الطلب').props.disabled, false);
for (const status of ['approved','rejected','cancelled']) {
  const closed = harness({ initialData: { ...page, requests: [{ ...request, status }] } });
  assert.equal(button(closed, 'اعتماد وتفعيل الباقة'), undefined);
}
const whatsapp = harness({ initialData: { ...page, requests: [{ ...request, receiptUrl: undefined, receiptChannel: 'whatsapp' }] } });
assert.ok(html(whatsapp).includes('أرسل العميل الإيصال عبر واتساب'));
assert.equal(button(whatsapp, 'اعتماد وتفعيل الباقة').props.disabled, false);
const pagination = harness();
await button(pagination, 'التالي').props.onClick();
assert.deepEqual(pagination.calls[0], ['fetch', { page: 1, filter: 'pending_review' }]);
await button(pagination, 'الملغية').props.onClick();
assert.deepEqual(pagination.calls[1], ['fetch', { page: 0, filter: 'closed' }]);
let finish; let reviews = 0;
const duplicate = harness({}, { reviewSubscriptionRequestAction: input => { reviews++; return new Promise(resolve => { finish = () => resolve({ ok: true, data: { requestId: input.requestId, status: 'approved' } }); }); } });
button(duplicate, 'اعتماد وتفعيل الباقة').props.onClick();
const click = button(duplicate, 'تأكيد الاعتماد والتفعيل').props.onClick;
const pending = click(); await click();
assert.equal(reviews, 1); assert.equal(button(duplicate, 'جارٍ تنفيذ القرار').props.disabled, undefined); // disabled fieldset contains this button
assert.equal(nodes(duplicate.render()).find(n => n.type === 'fieldset').props.disabled, true);
finish(); await pending;
const failure = harness({}, { reviewSubscriptionRequestAction: async () => { throw new Error('offline'); } });
button(failure, 'اعتماد وتفعيل الباقة').props.onClick();
await button(failure, 'تأكيد الاعتماد والتفعيل').props.onClick();
assert.ok(html(failure).includes('حدّث القائمة للتحقق من حالة الطلب'));
assert.equal(button(failure, 'اعتماد وتفعيل الباقة').props.disabled, true);
const afterSave = harness({}, { fetchSubscriptionRequestPageAction: async () => ({ ok: false, message: 'failed refresh' }) });
button(afterSave, 'اعتماد وتفعيل الباقة').props.onClick();
await button(afterSave, 'تأكيد الاعتماد والتفعيل').props.onClick();
assert.ok(html(afterSave).includes('تم اعتماد الطلب وتفعيل الباقة للعميل مباشرة لكن تعذر تحديث القائمة'));
assert.equal(button(afterSave, 'اعتماد وتفعيل الباقة'), undefined, 'committed request cannot be submitted again after refresh failure');

// Data boundary: authenticated session, bounded query, scoped private receipt paths
const queryCalls = []; let allowed = true;
const row = { ...request, cafe_id: 'brand', plan_id: 'paid', plan_name: request.planName, amount_sar: 2832, base_amount_sar: 3540, duration_count: 12, duration_unit: 'month', created_at: request.createdAt, receipt_storage_path: request.receiptStoragePath, cafes: { name: request.cafeName, slug: 'brand', cafe_settings: [{ owner_name: request.ownerName, owner_email: request.ownerEmail }] } };
const builder = { select(...args) { queryCalls.push(['select', ...args]); return this; }, order(...args) { queryCalls.push(['order', ...args]); return this; }, in(...args) { queryCalls.push(['in', ...args]); return this; }, eq(...args) { queryCalls.push(['eq', ...args]); return this; }, range(...args) { queryCalls.push(['range', ...args]); return Promise.resolve({ data: [row, { ...row, id: 'other', receipt_storage_path: 'another-brand/other/receipt.pdf' }], count: 42, error: null }); } };
const auth = async () => { if (!allowed) throw new Error('Forbidden'); };
const supabase = { from() { return builder; }, storage: { from(bucket) { assert.equal(bucket, 'subscription-receipts'); return { async createSignedUrls(paths, seconds) { assert.deepEqual(paths, [request.receiptStoragePath]); assert.equal(seconds, 300); return { data: [{ path: paths[0], signedUrl: 'https://example.invalid/private' }] }; } }; } } };
const stubs = { '@/lib/supabase/server': { createClient: async () => supabase }, '@/lib/supabase/admin': {}, '@/lib/data/cafes': { requirePlatformAdmin: auth }, '@/lib/platform/maintenance': {}, '@/lib/data/feature-entitlements': {}, '@/lib/platform/admin-subscription-status': {}, '@/lib/platform/business-categories': {} };
const data = load('lib/data/admin.ts', stubs);
const fetched = await data.getAdminSubscriptionRequestPage({ page: 1, filter: 'closed' });
assert.equal(fetched.total, 42); assert.equal(fetched.requests[0].ownerName, request.ownerName);
assert.ok(queryCalls.some(call => call[0] === 'range' && call[1] === 20 && call[2] === 39));
assert.ok(queryCalls.some(call => call[0] === 'in' && call[1] === 'status' && call[2].includes('rejected')));
await assert.rejects(data.getAdminSubscriptionRequestPage({ page: -1 }));
await assert.rejects(data.getAdminSubscriptionRequestPage({ filter: 'unsafe' }));
allowed = false; const before = queryCalls.length;
await assert.rejects(data.getAdminSubscriptionRequestPage()); assert.equal(queryCalls.length, before);

const actionCalls = [];
const actions = load('app/actions/subscription-requests.ts', {
  'next/cache': { revalidatePath: target => actionCalls.push(['invalidate', target]) },
  '@/lib/data/admin': {
    approveSubscriptionRequest: async requestId => { await auth(); actionCalls.push(['approve', requestId]); },
    rejectSubscriptionRequest: async (requestId, reason) => { await auth(); actionCalls.push(['reject', requestId, reason]); },
    getAdminSubscriptionRequestPage: async input => { await auth(); return { ...page, ...input }; },
  },
});
assert.equal((await actions.reviewSubscriptionRequestAction({ requestId: id, decision: 'approve' })).ok, false, 'non-admin cannot approve');
assert.equal(actionCalls.length, 0);
allowed = true;
assert.equal((await actions.reviewSubscriptionRequestAction({ requestId: 'invalid', decision: 'approve' })).ok, false);
assert.equal(actionCalls.length, 0);
assert.equal((await actions.reviewSubscriptionRequestAction({ requestId: id, decision: 'approve' })).data.status, 'approved');
assert.equal((await actions.reviewSubscriptionRequestAction({ requestId: id, decision: 'reject', reason: '  mismatch  ' })).data.status, 'rejected');
assert.ok(actionCalls.some(call => call[0] === 'reject' && call[2] === 'mismatch'));
assert.ok(actionCalls.some(call => call[0] === 'invalidate' && call[1] === '/dashboard'));

const css = fs.readFileSync('components/admin/pages/admin-subscription-requests-page.module.css', 'utf8');
const compiledCss = transform({ filename: 'admin-subscription-requests-page.module.css', code: Buffer.from(css), cssModules: true });
for (const [,name] of fs.readFileSync(sourcePath,'utf8').matchAll(/\bs\.(\w+)/g)) assert.ok(compiledCss.exports[name], name);
assert.ok(css.includes('max-width:640px') && css.includes(':focus-visible') && css.includes('prefers-reduced-motion'));
console.log('PASS subscription request review: SSR/details, receipt states, approval/rejection, duplicate/failure recovery, pagination, admin authorization, private receipt scope and CSS');
