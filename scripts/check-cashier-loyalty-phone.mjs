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
const slots = []; let cursor = 0, resolvePhone, calls = 0, failCommit = false;
const inspected = [], committed = [];
const hooks = {
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; }, useEffect() {},
};
const previewCard = { customerName: "Customer A", stampsInCycle: 2, purchasesRequired: 7, availableRewards: 1, rewardName: "Coffee" };
const reward = { sourceType: "loyalty", rewardCode: "REWARD123", canRedeem: true, customerName: "Customer A", rewardTitle: "Coffee" };
const { RastCashier } = load("components/rast-loyalty/rast-cashier.tsx", {
  react: hooks,
  "@/components/cashier/cashier-language": { useCashierLanguage: () => ({ t: value => typeof value === "string" ? value : value.text, errorText: value => value, locale: "ar", dir: "rtl" }), CashierLanguageSwitch: () => null },
  "@/app/actions/cashier-loyalty-phone": { lookupCashierLoyaltyPhoneAction: () => { calls++; return new Promise(resolve => { resolvePhone = resolve; }); } },
  "@/app/actions/loyalty-experience": { lookupRastCashierCardAction: async code => { inspected.push(code); return previewCard; }, lookupRastCashierRewardAction: async code => { inspected.push(code); return reward; }, scanLoyaltyExperienceAction: async input => { committed.push(input); if (failCommit) throw Error("network"); return { status: input.kind === "stamp" ? "stamped" : "redeemed" }; } },
  "@/app/actions/cashier": { logoutCashierAction: async () => {} },
});
let tree;
function render() { cursor = 0; tree = RastCashier({ initialData: { cafe: { slug: "rast", name: "Test" }, cashier: { fullName: "Test operator" } } }); }
function all(node = tree) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(child => all(child ?? null)); return [node, ...all(node.props?.children ?? null)]; }
function text(node) { if (Array.isArray(node)) return node.map(text).join(''); if (node && typeof node === 'object') return text(node.props?.children); return String(node ?? ''); }
function button(label) { const found = all().find(n => n.type === 'button' && text(n) === label); assert(found, label); return found; }
function input(value) { all().find(n => n.props?.id === 'rast-scan-code').props.onChange({ target: { value } }); render(); }
function submit() { all().find(n => n.type === 'form' && n.props.onSubmit).props.onSubmit({ preventDefault() {} }); }
const settle = () => new Promise(setImmediate);
render(); button('رقم الجوال').props.onClick(); render(); input('0501234567');
assert.equal(all().find(n => n.props?.id === 'rast-scan-code').props.type, 'tel');
submit(); submit(); assert.equal(calls, 1, 'Duplicate clicks cannot race the phone resolver');
render(); assert.equal(button('رقم الجوال').props.disabled, true);
resolvePhone({ ok: true, cardCode: 'CARD123' }); await settle(); render();
assert.deepEqual(inspected, ['CARD123']); assert.equal(committed.length, 0, 'Lookup never stamps');
failCommit = true; button('تأكيد الشراء وتسجيل ختم واحد ').props.onClick(); await settle(); render();
failCommit = false; button('تأكيد الشراء وتسجيل ختم واحد ').props.onClick(); await settle(); render();
assert.equal(committed[0].value, 'CARD123'); assert.equal(committed[0].requestId, committed[1].requestId, 'Uncertain phone confirmation reuses request id');
button('صرف مكافأة').props.onClick(); render(); input('0501234567'); submit(); resolvePhone({ ok: true, cardCode: 'CARD123' }); await settle(); render();
button('تأكيد تسليم المكافأة وصرفها ').props.onClick(); await settle(); render();
assert.equal(committed.at(-1).value, 'REWARD123', 'Phone redemption pins exact reward');
input('0501234567'); submit(); resolvePhone({ ok: false, message: 'لا توجد بطاقة ولاء متاحة لهذا الرقم لدى العلامة' }); await settle(); render();
assert(all().some(n => n.props?.role === 'alert')); assert(!all().some(n => n.props?.id === 'rast-scan-preview'));
button('البطاقة أو الباركود').props.onClick(); render(); assert.equal(all().find(n => n.props?.id === 'rast-scan-code').props.value, '');
console.log('PASS: phone normalization, tenant/permission gates, inactive/ambiguous/error rejection, read-only lookup, phone UI, duplicate lock, uncertain request retry, exact reward and barcode switching');


