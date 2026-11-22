import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
function load(relative, stubs, cache = new Map()) {
  if (cache.has(relative)) return cache.get(relative);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {}; cache.set(relative, exports);
  new Function("require", "exports", output)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.endsWith(".module.css")) return new Proxy({}, { get: (_, key) => String(key) });
    if (name.startsWith("@/") || name.startsWith(".")) {
      const p = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name);
      return load(fs.existsSync(path.join(root, p + ".tsx")) ? p + ".tsx" : p + ".ts", stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}

let authorized = true, entitled = true, customer = { id: "customer-a", status: "active", blocked_at: null, phone_auth_conflict: false };
let card = { card_code: "CARD123", status: "active" }, dbError = false;
const queries = [];
const db = { from(table) {
  const query = { table, filters: [] }; queries.push(query);
  const chain = { select() { return chain; }, eq(key, value) { query.filters.push([key, value]); return chain; }, async maybeSingle() { return { data: table === "customer_profiles" ? customer : card, error: dbError ? { message: "private db detail" } : null }; } };
  return chain; // No mutation methods: searching must never write customer/card balances.
} };
const { resolveCashierLoyaltyPhone } = load("lib/data/cashier-loyalty-phone.ts", {
  "server-only": {}, "@/lib/supabase/admin": { createAdminClient: () => db },
  "@/lib/data/cashier": { requireCashierPermission: async permission => { assert.equal(permission, "loyalty"); if (!authorized) throw Error("unauthorized"); return { cafeId: "brand-a" }; } },
  "@/lib/data/rast-loyalty-access": { assertRastLoyaltyEntitlement: async id => { assert.equal(id, "brand-a"); if (!entitled) throw Error("not entitled"); } },
});
for (const phone of ["0501234567", "+966501234567", "00966501234567", "501234567", "٠٥٠١٢٣٤٥٦٧", "۰۵۰۱۲۳۴۵۶۷", "050 123 4567"]) {
  queries.length = 0;
  assert.equal(await resolveCashierLoyaltyPhone(phone), "CARD123");
  assert.deepEqual(queries.map(q => q.filters), [[['cafe_id', 'brand-a'], ['phone_normalized', '966501234567']], [['cafe_id', 'brand-a'], ['customer_profile_id', 'customer-a']]]);
}
for (const invalid of ["", "50123", "abc0501234567", "0501234567%", "1".repeat(31), null, {}, "+15551234567"]) {
  queries.length = 0; await assert.rejects(() => resolveCashierLoyaltyPhone(invalid)); assert.equal(queries.length, 0);
}
for (const field of ['authorized', 'entitled']) {
  authorized = field !== 'authorized'; entitled = field !== 'entitled'; queries.length = 0;
  await assert.rejects(() => resolveCashierLoyaltyPhone("0501234567")); assert.equal(queries.length, 0);
}
authorized = entitled = true;
const goodCustomer = customer, goodCard = card;
for (const unavailable of [null, { ...goodCustomer, status: "inactive" }, { ...goodCustomer, blocked_at: "today" }, { ...goodCustomer, phone_auth_conflict: true }]) {
  customer = unavailable; queries.length = 0; await assert.rejects(() => resolveCashierLoyaltyPhone("0501234567")); assert.equal(queries.length, 1);
}
customer = goodCustomer;
for (const unavailable of [null, { ...goodCard, status: "suspended" }, { ...goodCard, card_code: "bad code" }]) {
  card = unavailable; await assert.rejects(() => resolveCashierLoyaltyPhone("0501234567"));
}
card = goodCard; dbError = true;
await assert.rejects(() => resolveCashierLoyaltyPhone("0501234567"), error => !error.message.includes('private db detail'));

// Exercise actual component handlers without a browser, including pending lookup races.
const slots = []; let cursor = 0, resolvePhone, resolveSave, rejectSave, calls = 0, failCommit = false;
const inspected = [], committed = [];
const queued = [];
const hooks = {
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; }, useEffect() {},
};
const previewCard = { customerName: "Customer A", stampsInCycle: 2, purchasesRequired: 7, availableRewards: 1, rewardName: "Coffee" };
const reward = { sourceType: "loyalty", rewardCode: "REWARD123", canRedeem: true, customerName: "Customer A", rewardTitle: "Coffee" };
const { RastCashier } = load("components/rast-loyalty/rast-cashier.tsx", {
  "@/app/actions/cashier-invoice-points": {},
  "@/components/cashier/cashier-guide": { CashierGuideButton: () => null },
  "./use-invoice-points-outbox": { useInvoicePointsOutbox: () => ({ rows: [] }) },
  "./use-customer-summary": { useCustomerSummary: () => ({ state: { id: null, status: "idle", summary: null, confirmed: false }, lookup: () => null, clear() {}, confirm() {} }) },
  "./use-read-outbox": { useReadOutbox: () => ({ rows: [], storageError: false, authPaused: false, save: (method, value) => { queued.push({ method, value }); return new Promise((resolve, reject) => { resolveSave = resolve; rejectSave = reject; }); } }) },
  react: hooks,
  "@/components/cashier/analytics-coupon-redemption": { AnalyticsCouponRedemption: () => null },
  "@/components/cashier/cashier-language": { useCashierLanguage: () => ({ t: value => typeof value === "string" ? value : value.text, errorText: value => value, locale: "ar", dir: "rtl" }), CashierLanguageSwitch: () => null },
  "@/app/actions/cashier-loyalty-phone": { lookupCashierLoyaltyPhoneAction: () => { calls++; return new Promise(resolve => { resolvePhone = resolve; }); } },
  "@/app/actions/loyalty-experience": { lookupRastCashierCardAction: async code => { inspected.push(code); return previewCard; }, lookupRastCashierRewardAction: async code => { inspected.push(code); return reward; }, scanLoyaltyExperienceAction: async input => { committed.push(input); if (failCommit) throw Error("network"); return { status: input.kind === "stamp" ? "stamped" : "redeemed" }; } },
  "@/app/actions/cashier": { logoutCashierAction: async () => {} },
});
let tree;
let financeLinked = false;
function render() { cursor = 0; tree = RastCashier({ initialData: { cafe: { id: "brand", slug: "rast", name: "Test" }, cashier: { id: "cashier", fullName: "Test operator", financeLinked } } }); }
function all(node = tree) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(child => all(child ?? null)); return [node, ...all(node.props?.children ?? null)]; }
function text(node) { if (Array.isArray(node)) return node.map(text).join(''); if (node && typeof node === 'object') return text(node.props?.children); return String(node ?? ''); }
function button(label) { const found = all().find(n => n.type === 'button' && text(n) === label); assert(found, label); return found; }
function input(value) { all().find(n => n.props?.id === 'rast-scan-code').props.onChange({ target: { value } }); render(); }
function submit() { all().find(n => n.type === 'form' && n.props.onSubmit).props.onSubmit({ preventDefault() {} }); }
const settle = () => new Promise(setImmediate);
render(); button('رقم الجوال').props.onClick(); render(); input('0501234567');
assert.equal(all().find(n => n.props?.id === 'rast-scan-code').props.type, 'tel');
submit(); submit(); assert.equal(queued.length, 1, 'Duplicate clicks cannot enqueue twice while storage is pending');
assert.equal(calls, 0, 'Stamp entry never waits for the phone resolver');
render(); assert.equal(button('رقم الجوال').props.disabled, true);
assert.equal(all().find(n => n.props?.id === 'rast-scan-code').props.value, '0501234567', 'Input remains until durable save confirms');
resolveSave({ duplicate: false, row: { requestId: "first-read" } }); await settle(); render();
assert.equal(all().find(n => n.props?.id === 'rast-scan-code').props.value, '', 'Saved stamp releases input without customer preview');
assert.equal(inspected.length, 0); assert.equal(committed.length, 0, 'Stamp intent never uses synchronous inspection or commit');
assert(text(tree).includes('تم حفظ القراءة على هذا الجهاز'));
input('0501234567'); submit(); rejectSave(Error('disk full')); await settle(); render();
assert.equal(all().find(n => n.props?.id === 'rast-scan-code').props.value, '0501234567');
assert(text(tree).includes('تعذر حفظ القراءة على الجهاز'), 'Failed storage is never reported as saved');
button('صرف مكافأة').props.onClick(); render(); input('0501234567'); submit(); resolvePhone({ ok: true, cardCode: 'CARD123' }); await settle(); render();
assert(!all().some(n => n.props?.id === 'rast-scan-code'), 'Reward preview replaces the search form too');
failCommit = true; button('تأكيد تسليم المكافأة وصرفها ').props.onClick(); await settle(); render();
failCommit = false; button('تأكيد تسليم المكافأة وصرفها ').props.onClick(); await settle(); render();
assert.equal(committed[0].requestId, committed[1].requestId, 'Uncertain reward confirmation reuses request id');
assert.equal(committed.at(-1).value, 'REWARD123', 'Phone redemption pins exact reward');
input('0501234567'); submit(); resolvePhone({ ok: false, message: 'لا توجد بطاقة ولاء متاحة لهذا الرقم لدى العلامة' }); await settle(); render();
assert(all().some(n => n.props?.role === 'alert')); assert(!all().some(n => n.props?.id === 'rast-scan-preview'));
button('البطاقة أو الباركود').props.onClick(); render(); assert.equal(all().find(n => n.props?.id === 'rast-scan-code').props.value, '');
button('تسجيل ختم').props.onClick(); render(); input('CARD123'); const phoneCalls = calls; submit(); resolveSave({ duplicate: false, row: { requestId: "second-read" } }); await settle(); render();
assert.equal(calls, phoneCalls); assert.equal(queued.at(-1).value, 'CARD123');
assert.equal(all().find(n => n.props?.id === 'rast-scan-code').props.value, '');
assert(!all().some(n => n.props?.id === 'rast-scan-preview'), 'New search discards the previous preview');
financeLinked = true;
input('0501234567');
const priorCommits = committed.length;
submit(); resolvePhone({ok:false, missingCard:true, message:'missing'}); await settle(); render();
assert.equal(committed.length, priorCommits, 'Inspecting an unregistered phone must not issue or stamp a card');
assert(button('تأكيد إصدار البطاقة وتسجيل الختم'));
failCommit = true; submit(); await settle(); render();
failCommit = false; submit(); await settle(); render();
assert.equal(committed.length, priorCommits + 2);
assert.deepEqual(committed.at(-1), committed.at(-2), 'Retry the same confirmed enrollment and stamp request');
assert.equal(committed.at(-1).stampByPhone, true);
assert.deepEqual(committed.at(-1).expectedScope, { cafeId:'brand',cashierId:'cashier' });
assert.equal(committed.at(-1).value,'0501234567');
input('0501234567'); submit(); resolvePhone({ok:false,missingCard:false,message:'inactive'}); await settle(); render();
assert(!all().some(n => n.type === 'button' && text(n).includes('تأكيد إصدار')), 'Disabled cards are not offered enrollment');
const scope = { cafeId:crypto.randomUUID(), cashierId:crypto.randomUUID() };
const requestId = crypto.randomUUID(), mutations = [];
const { scanLoyaltyExperienceAction } = load("app/actions/loyalty-experience.ts", {
  "@/lib/data/loyalty-experience": {}, "@/lib/data/loyalty-enrollment": {}, "next/cache": {}, "next/server": { after() {} },
  "@/lib/data/cashier": { requireCashierPermission: async () => ({ ...scope, cafeSlug:"demo", token:"local-session" }) },
  "@/lib/data/cafes": {}, "@/lib/data/feature-entitlements": { getPublicCafeFeatureCodesBySlug:async () => ["loyalty"] },
  "@/lib/platform/feature-gates": { featureCodesAllow: () => true },
  "@/lib/supabase/admin": { createAdminClient: () => ({rpc: async (name,args) => {
    mutations.push([name,args]);
    return {data:{ok:true,status:"stamped",cardCode:"STAMP123"},error:null};
  }}) }, "@/lib/wallet": {}, "@/lib/maps/resolve-branch-location": {}, "@/lib/data/customer-rewards": {},
  "@/lib/cashier/catalog-translation": {}, "@/lib/loyalty/loco-redemption-alert": {},
});
const submitted = { requestId,expectedScope:scope,kind:"stamp",stampByPhone:true,value:"٠٥٠١٢٣٤٥٦٧" };
await assert.rejects(() => scanLoyaltyExperienceAction({...submitted,expectedScope:{...scope,cafeId:crypto.randomUUID()}}));
await assert.rejects(() => scanLoyaltyExperienceAction({...submitted,kind:"redeem"}));
await assert.rejects(() => scanLoyaltyExperienceAction({...submitted,expectedScope:undefined}));
assert.equal(mutations.length,0);
assert.equal((await scanLoyaltyExperienceAction(submitted)).status,"stamped");
assert.deepEqual(mutations,[["stamp_linked_cashier_by_phone",{p_phone:"966501234567",p_request_id:requestId,p_session_token:"local-session"}]]);
console.log('PASS: phone normalization, tenant/permission gates, inactive/ambiguous/error rejection, immediate stamp queue, storage failure, duplicate lock, unchanged exact reward confirmation/retry and barcode switching');
