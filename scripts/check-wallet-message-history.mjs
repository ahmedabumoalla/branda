import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let state, queries;
function reset(patch = {}) {
  queries = [];
  state = { user: { id: id(1) }, profile: { role: "cafe_owner", status: "active" }, cafe: { id: id(10), owner_user_id: id(1) },
    member: null, jobError: null, rows: [], total: 0, ...patch };
}
function builder(table) {
  const operations = [];
  queries.push({ table, operations });
  const chain = {};
  for (const op of ["select", "eq", "is", "order", "range"]) chain[op] = (...args) => { operations.push([op, ...args]); return chain; };
  const result = () => table === "profiles" ? { data: state.profile, error: null }
    : table === "cafes" ? { data: state.cafe, error: null }
      : table === "cafe_members" ? { data: state.member, error: null }
        : { data: state.rows, count: state.total, error: state.jobError };
  chain.maybeSingle = async () => result();
  chain.then = (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
  return chain;
}
const db = { from: builder, auth: { getUser: async () => ({ data: { user: state.user }, error: null }) } };
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const loadedModule = { exports: {} };
  const localRequire = name => {
    if (name === "server-only") return {};
    if (name.endsWith(".css")) return new Proxy({}, { get: (_, key) => String(key) });
    if (name === "@/lib/supabase/server") return { createClient: async () => db };
    if (name === "@/lib/supabase/admin") return { createAdminClient: () => db };
    if (name === "@/lib/data/cafes") return { requireOwnerCafeContext: async () => ({ id: id(10), role: "owner" }) };
    if (name.startsWith("@/")) { const base = path.resolve(name.slice(2)); return load(fs.existsSync(`${base}.tsx`) ? `${base}.tsx` : `${base}.ts`); }
    return require(name);
  };
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", output)(localRequire, loadedModule, loadedModule.exports);
  cache.set(file, loadedModule.exports); return loadedModule.exports;
}
const { getWalletMessageHistory } = load("lib/data/wallet-message-history.ts");
const model = load("lib/loyalty/message-history.ts");
const { GET } = load("app/api/loyalty/messages/route.ts");
const { WalletMessageList, WalletMessageHistory } = load("components/loyalty/wallet-message-history.tsx");
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const denied = async patch => { reset(patch); await assert.rejects(() => getWalletMessageHistory({}), /denied/); check(!queries.some(q => q.table === "wallet_notification_jobs"), "denied callers cannot query messages"); };
await denied({ user: null });
await denied({ profile: null });
await denied({ profile: { role: "platform_admin", status: "suspended" } });
await denied({ cafe: null });
await denied({ cafe: { id: id(10), owner_user_id: id(2) }, member: { role: "staff" } });
await denied({ cafe: { id: id(10), owner_user_id: id(2) }, member: null });
reset();
await assert.rejects(() => getWalletMessageHistory({ brandId: id(11) }), /denied/);
check(!queries.some(q => q.table === "cafes" || q.table === "wallet_notification_jobs"), "owner cannot inject another brand");
reset({ cafe: { id: id(10), owner_user_id: id(2) }, member: { role: "manager" } });
await getWalletMessageHistory({});
check(queries.find(q => q.table === "cafe_members").operations.some(op => op[0] === "eq" && op[1] === "user_id" && op[2] === id(1)), "manager membership uses authenticated user");
const date = "2026-10-19T10:00:00Z";
const row = { id: id(30), title: "<script>example</script>", body: "First line\nSecond line", status: "sent", created_at: date, updated_at: date,
  delivery_state: { apple: { status: "accepted", count: 19, secret: "private" }, google: { status: "skipped", count: 0 } }, last_error: "private" };
reset({ rows: [row], total: 21 });
const result = await getWalletMessageHistory({ page: 1 });
check(result.messages[0].title === row.title && result.messages[0].body === row.body, "original content preserved");
check(!JSON.stringify(result).includes("private") && !JSON.stringify(result).includes("count"), "only allowlisted fields returned; provider request counts are not customer counts");
const ops = queries.find(q => q.table === "wallet_notification_jobs").operations;
check(ops.some(op => op[0] === "eq" && op[1] === "cafe_id" && op[2] === id(10)), "query scoped to authenticated cafe");
check(ops.some(op => op[0] === "eq" && op[1] === "kind" && op[2] === "message"), "sync jobs excluded");
check(ops.some(op => op[0] === "range" && op[1] === 10 && op[2] === 19), "pagination is bounded and inclusive");
check(ops.filter(op => op[0] === "order").map(op => op[1]).join() === "created_at,id", "stable newest-first ordering");
reset({ profile: { role: "platform_admin", status: "active" }, cafe: { id: id(11), owner_user_id: id(2) } });
await getWalletMessageHistory({ brandId: id(11) });
check(queries.find(q => q.table === "wallet_notification_jobs").operations.some(op => op[0] === "eq" && op[1] === "cafe_id" && op[2] === id(11)), "active admin can query selected brand");
for (const input of [{ page: -1 }, { page: 0.5 }, { page: Infinity }, { brandId: "bad" }, { page: 100001 }, { extra: true }]) {
  reset(); await assert.rejects(() => getWalletMessageHistory(input)); check(queries.length === 0, "invalid input rejected before DB");
}
reset({ jobError: { message: "private database error" } });
await assert.rejects(() => getWalletMessageHistory({}), /unavailable/);
let response = await GET(new Request("https://example.test/api/loyalty/messages"));
check(response.status === 503 && !(await response.text()).includes("private database error"), "query errors are unavailable, sanitized and never empty success");
reset({ user: null }); response = await GET(new Request("https://example.test/api/loyalty/messages"));
check(response.status === 403 && response.headers.get("cache-control") === "private, no-store", "unauthenticated route denied and uncacheable");
reset(); response = await GET(new Request("https://example.test/api/loyalty/messages?page=-1")); check(response.status === 400, "invalid route parameters rejected");
response = await GET(new Request("https://example.test/api/loyalty/messages")); check(response.status === 200 && (await response.json()).total === 0, "authorized empty response");
const message = result.messages[0];
check(model.walletMessageStatus(message) === "قُبل طلب الإرسال", "accepted status is not delivery confirmation");
check(model.walletMessageStatus({ ...message, status: "sent", apple: "skipped" }) === "محفوظة دون إرسال", "sent queue with skipped providers is not sent notification");
check(model.walletMessageStatus({ ...message, status: "failed" }) === "قُبل جزئيًا وتعذرت البقية", "partial acceptance is preserved");
check(model.walletMessageStatus({ ...message, status: "pending", apple: "unknown" }) === "بانتظار الإرسال أو إعادة المحاولة", "queued state");
check(model.walletProviderStatus({ status: "skipped", pending: true }) === "pending", "pending readiness is distinct from skipped");
check(model.walletProviderStatus(null) === "unknown", "legacy empty state not fabricated");
const html = renderToStaticMarkup(React.createElement(WalletMessageList, { data: result }));
check(html.includes("&lt;script&gt;") && !html.includes("<script>"), "message content safely escaped");
check(html.includes("First line\nSecond line") && /datetime="2026-10-19T10:00:00Z"/i.test(html), "full message and timestamp rendered");
check(html.includes("محفظة أبل") && html.includes("محفظة أندرويد"), "separate provider statuses");
check(renderToStaticMarkup(React.createElement(WalletMessageList, { data: { page: 0, total: 0, messages: [] } })).includes("لا توجد رسائل محفوظة"), "empty history feedback");
const loading = renderToStaticMarkup(React.createElement(WalletMessageHistory, { brandName: "Example" }));
check(loading.includes('aria-busy="true"') && loading.includes("جارٍ تحميل سجل الرسائل"), "accessible initial loading state");
console.log(`Wallet message history: ${checks} authorization, tenant, pagination, state, HTTP and React SSR checks passed`);
