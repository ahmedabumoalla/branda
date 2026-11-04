import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function("require", "exports", source)(name => {
    if (name === "server-only") return {};
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      const relative = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name);
      return load(`${relative}.ts`, stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1), brandId = id(2), campaignId = id(3), key = id(4), at = "2026-11-04T12:30:00Z";
const digest = "a".repeat(64);
const audience = { generatedAt: at, brandId, segment: "inactive", inactiveDays: 10,
  matched: 28, total: 26, excluded: 2, digest, page: 1, pageSize: 25,
  items: Array.from({ length: 25 }, (_, n) => ({ id: id(n + 100), name: `Synthetic ${n}`, phone: `96650000${String(n).padStart(4, "0")}`,
    lastVisitAt: at, inactiveDays: 15, visitDays: 3, averageVisitGapDays: 3.5 })) };
const draft = { brandId, segment: "inactive", inactiveDays: 10, audienceDigest: digest, idempotencyKey: key,
  title: "  Synthetic campaign  ", body: "  Exact approved line\nSecond line  ", contentKind: "message" };
function fixture(options = {}) {
  const state = { user: { id: actor }, profile: { role: "platform_admin", status: "active" }, authError: null, profileError: null,
    existing: null, lookupError: null, senderReady: true, rpcError: null, rpcThrows: false,
    preview: structuredClone(audience), created: { campaignId, total: 26 }, ...options };
  const calls = [];
  const session = { auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
    from: table => { calls.push({ name: "profile", table }); return { select: () => ({ eq: (_column, value) => {
      calls.push({ name: "profile-filter", value }); return { maybeSingle: async () => ({ data: state.profile, error: state.profileError }) };
    } }) }; } };
  const db = {
    from: table => { calls.push({ name: "lookup", table }); const query = { select: () => query, eq: (column, value) => {
      calls.push({ name: "lookup-filter", column, value }); return query;
    }, maybeSingle: async () => ({ data: state.existing, error: state.lookupError }) }; return query; },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (state.rpcThrows) throw new Error("PRIVATE_DATABASE_NETWORK_DETAIL");
      assert.ok(["platform_marketing_analytics_audience", "platform_marketing_create_analytics_campaign"].includes(name));
      return { data: name.endsWith("audience") ? state.preview : state.created, error: state.rpcError };
    },
  };
  const stubs = {
    "@/lib/supabase/server": { createClient: async () => session },
    "@/lib/supabase/admin": { createAdminClient: () => { calls.push({ name: "privileged-client" }); return db; } },
    "@/lib/whatsapp/green-api-platform-campaigns": {
      getBrandaCampaignSender: async () => { calls.push({ name: "sender" }); return { ready: state.senderReady, phone: null, status: state.senderReady ? "connected" : "disconnected" }; },
      sendBrandaCampaignMessage: async () => { assert.fail("Create or preview must never directly send provider messages"); },
    },
  };
  const cache = new Map();
  return { state, calls, api: load("lib/data/brand-analytics-campaign.ts", stubs, cache),
    actions: load("app/actions/brand-analytics-campaign.ts", stubs, cache) };
}
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
const rejectCode = async (call, code) => { await assert.rejects(call, error => error.code === code); checks++; };
const dto = load("lib/analytics/brand-analytics-campaign.ts");
for (const bad of [{ brandId: "bad", segment: "inactive" }, { brandId, segment: "all" }, { brandId, segment: "absent", inactiveDays: 0 },
  { brandId, segment: "absent", inactiveDays: 366 }, { brandId, segment: "absent", inactiveDays: 1.5 },
  { brandId, segment: "inactive", page: 0 }, { brandId, segment: "inactive", page: 100001 },
  { brandId, segment: "inactive", actorId: actor }, { brandId, segment: "inactive", phones: ["966500000001"] }]) {
  check(!dto.brandAnalyticsCampaignAudienceInputSchema.safeParse(bad).success, "invalid audience input rejected");
}
check(dto.brandAnalyticsCampaignAudienceInputSchema.parse({ brandId, segment: "loyal", inactiveDays: 90 }).inactiveDays === 10, "loyal canonical fixed threshold");
check(dto.brandAnalyticsCampaignAudienceInputSchema.parse({ brandId, segment: "inactive" }).page === 1, "default preview page");
check(dto.brandAnalyticsCampaignAudienceInputSchema.parse({ brandId, segment: "absent", inactiveDays: 21 }).inactiveDays === 21, "custom threshold preserved");
for (const bad of [{ ...draft, idempotencyKey: "bad" }, { ...draft, audienceDigest: "bad" }, { ...draft, title: " " },
  { ...draft, body: " " }, { ...draft, body: "x".repeat(3001) }, { ...draft, title: "x".repeat(101) },
  { ...draft, contentKind: "coupon" }, { ...draft, scheduledAt: "yesterday" }, { ...draft, p_actor: actor },
  { ...draft, phones: ["966500000001"] }, { ...draft, mediaId: id(6) }]) {
  check(!dto.brandAnalyticsCampaignInputSchema.safeParse(bad).success, "invalid or injected campaign input rejected");
}
for (const state of [{ user: null }, { profile: null }, { profile: { role: "cafe_owner", status: "active" } },
  { profile: { role: "customer", status: "active" } }, { profile: { role: "platform_admin", status: "suspended" } },
  { authError: new Error("PRIVATE_AUTH_DETAIL") }, { profileError: new Error("PRIVATE_PROFILE_DETAIL") }]) {
  const c = fixture(state);
  const preview = await c.actions.loadBrandAnalyticsCampaignAudienceAction({ brandId, segment: "inactive" });
  const create = await c.actions.createBrandAnalyticsCampaignAction(draft);
  check(!preview.ok && preview.code === "unauthorized" && !create.ok && create.code === "unauthorized", "active admin role enforced for every action");
  check(!c.calls.some(row => ["privileged-client", "sender", "lookup"].includes(row.name) || row.name.startsWith("platform_marketing_")), "unauthorized request never creates privileged client, queries audience or invokes sender");
}
{
  const c = fixture();
  const result = await c.actions.loadBrandAnalyticsCampaignAudienceAction({ brandId, segment: "inactive", page: 1 });
  const call = c.calls.find(row => row.name === "platform_marketing_analytics_audience");
  check(result.ok && result.data.total === 26 && result.data.items.length === 25 && result.data.sender.ready, "validated complete-audience count and paginated contact preview");
  check(call.args.p_actor === actor && call.args.p_cafe === brandId && call.args.p_inactive_days === 10 && call.args.p_page === 1, "preview actor derived from actual authenticated session");
  check(!c.calls.some(row => row.name === "lookup" || row.name === "platform_marketing_create_analytics_campaign"), "preview does not enqueue campaign");
}
for (const patch of [{ brandId: id(8) }, { segment: "loyal" }, { inactiveDays: 30 }, { page: 2 }, { total: 29 }, { excluded: 99 },
  { digest: "invalid" }, { items: [{ ...audience.items[0], phone: "bad" }] }]) {
  const c = fixture({ preview: { ...audience, ...patch } });
  const result = await c.actions.loadBrandAnalyticsCampaignAudienceAction({ brandId, segment: "inactive" });
  check(!result.ok && result.code === "unavailable", "cross-brand, stale or malformed preview never returned");
}
{
  const c = fixture({ rpcError: { message: "PRIVATE_RPC_DATA", code: "XX000" } });
  const result = await c.actions.loadBrandAnalyticsCampaignAudienceAction({ brandId, segment: "inactive" });
  check(!result.ok && !JSON.stringify(result).includes("PRIVATE"), "preview error sanitized");
}
{
  const c = fixture();
  const result = await c.actions.createBrandAnalyticsCampaignAction({ ...draft, contentKind: "offer", segment: "absent", inactiveDays: 21, scheduledAt: "2026-12-01T18:30:00+03:00" });
  const call = c.calls.find(row => row.name === "platform_marketing_create_analytics_campaign");
  check(result.ok && result.data.campaignId === campaignId && result.data.total === 26, "created response validated");
  check(call.args.p_actor === actor && call.args.p_cafe === brandId && call.args.p_key === key && call.args.p_audience_digest === digest, "creation actor, brand, key and reviewed digest forwarded exactly");
  check(call.args.p_body === draft.body.trim() && call.args.p_title === draft.title.trim() && call.args.p_content_kind === "offer", "approved body preserved without automatic footer");
  check(call.args.p_segment === "absent" && call.args.p_inactive_days === 21 && call.args.p_scheduled_at === "2026-12-01T18:30:00+03:00", "selected segment and explicit schedule forwarded to database gate");
  check(!("p_phones" in call.args) && !Object.values(call.args).includes(audience.items[0].phone), "create never accepts or forwards client recipient lists");
  check(c.calls.some(row => row.name === "lookup-filter" && row.column === "created_by" && row.value === actor), "idempotency lookup is scoped to authenticated actor");
}
{
  const c = fixture({ senderReady: false });
  await rejectCode(() => c.api.createBrandAnalyticsCampaign(draft), "sender_unavailable");
  check(!c.calls.some(row => row.name === "platform_marketing_create_analytics_campaign"), "offline sender never enqueues a new campaign");
}
{
  const c = fixture({ senderReady: false, existing: { id: campaignId } });
  const result = await c.actions.createBrandAnalyticsCampaignAction({ ...draft, scheduledAt: "2020-01-01T12:00:00Z" });
  check(result.ok && c.calls.some(row => row.name === "platform_marketing_create_analytics_campaign"), "existing lost-response request reconciles even with now-past schedule");
  check(!c.calls.some(row => row.name === "sender"), "disconnected sender cannot block reconciliation of an existing key");
}
{
  const c = fixture({ lookupError: { message: "PRIVATE_LOOKUP_DETAIL" } });
  const result = await c.actions.createBrandAnalyticsCampaignAction(draft);
  check(!result.ok && result.code === "uncertain" && !JSON.stringify(result).includes("PRIVATE"), "unknown lookup result retains same idempotency attempt");
  check(!c.calls.some(row => row.name === "sender" || row.name === "platform_marketing_create_analytics_campaign"), "lookup failure stops before creation");
}
for (const [error, code] of [
  [{ code: "42501", message: "PRIVATE_ROLE_DETAIL" }, "unauthorized"],
  [{ code: "22023", message: "Audience changed" }, "audience_changed"],
  [{ code: "22023", message: "Empty or oversized audience" }, "audience_changed"],
  [{ code: "22023", message: "Idempotency conflict" }, "uncertain"],
  [{ code: "22023", message: "Invalid scheduled time" }, "invalid"],
  [{ code: "XX000", message: "PRIVATE_DATABASE_DETAIL" }, "uncertain"],
]) {
  const c = fixture({ rpcError: error });
  const result = await c.actions.createBrandAnalyticsCampaignAction(draft);
  check(!result.ok && result.code === code && !JSON.stringify(result).includes("PRIVATE"), "creation error classified without leaking private database payload");
}
for (const options of [{ rpcThrows: true }, { created: { campaignId, total: 0 } }, { created: { campaignId: "bad", total: 26 } }]) {
  const c = fixture(options);
  const result = await c.actions.createBrandAnalyticsCampaignAction(draft);
  check(!result.ok && result.code === "uncertain" && !JSON.stringify(result).includes("PRIVATE"), "network or malformed committed response preserves retry key");
}
{
  const c = fixture();
  await rejectCode(() => c.api.createBrandAnalyticsCampaign({ ...draft, phones: ["966500000001"] }), "invalid");
  check(!c.calls.some(row => ["lookup", "sender", "platform_marketing_create_analytics_campaign"].includes(row.name)), "forged recipient list rejected before database mutation checks");
}
const files = ["scripts/check-brand-analytics-campaign-server.mjs", "lib/data/brand-analytics-campaign.ts", "lib/analytics/brand-analytics-campaign.ts", "app/actions/brand-analytics-campaign.ts", "lib/data/platform-marketing.ts", "package-lock.json"];
fs.mkdirSync("output/analytics-campaign", { recursive: true });
fs.writeFileSync("output/analytics-campaign/server-checks.json", JSON.stringify({ at: new Date().toISOString(), node: process.version,
  command: "node scripts/check-brand-analytics-campaign-server.mjs", result: "PASS", checks, mockedProviderOnly: true,
  inputs: Object.fromEntries(files.map(file => [file, crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")])) }, null, 2));
console.log(`PASS ${checks} analytics campaign server/auth/input/snapshot/idempotency/error checks; no provider messages`);
