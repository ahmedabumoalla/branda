import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const dependency = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
function load(relative, stubs = {}, cache = new Map()) {
  if (cache.has(relative)) return cache.get(relative);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {}; cache.set(relative, exports);
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      const relativePath = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name);
      return load(fs.existsSync(path.join(root, `${relativePath}.tsx`)) ? `${relativePath}.tsx` : `${relativePath}.ts`, stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
const settle = () => new Promise(setImmediate);

if (!process.argv.includes("--entitlements-only")) {
const { createRastScanSession } = load("components/rast-loyalty/scan-session.ts");
const { createBarndaksaQrPayload } = load("lib/loyalty/secure-qr-payload.ts");
const card = { customerName: "Test customer", stampsInCycle: 2, purchasesRequired: 7, availableRewards: 1, rewardName: "Test reward" };
const reward = { sourceType: "loyalty", canRedeem: true, expiresAt: "2030-01-02T00:00:00Z", invalidReason: null, rewardTitle: "Earned reward", customerName: "Test customer", metadata: { termsSnapshot: { rewardKind: "discount", discountPercent: 25, terms: "Original terms" } } };
const writes = [], reads = [];
let currentTime = Date.parse("2030-01-01T00:00:00Z"), id = 0, returnedReward = reward;
let mutation = async () => ({ status: "stamped" });
const session = createRastScanSession({
  lookupCard: async (code) => { reads.push(["stamp", code]); return card; },
  lookupReward: async (code) => { reads.push(["redeem", code]); return returnedReward; },
  commit: async (input) => { writes.push(input); return mutation(input); },
  createRequestId: () => `request-${++id}`, now: () => currentTime,
});

await assert.rejects(session.confirm("stamp", "CARD123"));
assert.equal(writes.length, 0, "Uninspected cards cannot reach the mutation");
const cardQr = createBarndaksaQrPayload("loyalty-card", "CARD123");
const stampPreview = await session.inspect("stamp", cardQr);
assert.equal(stampPreview.card.customerName, card.customerName);
assert.deepEqual(reads, [["stamp", "CARD123"]]);
assert.equal(writes.length, 0, "Hardware Enter inspection must stay read-only");
await assert.rejects(session.confirm("stamp", "OTHER123"));
await assert.rejects(session.confirm("redeem", "CARD123"));

const failedResponse = deferred();
mutation = () => failedResponse.promise;
const firstConfirm = session.confirm("stamp", " card123 ");
assert.equal(session.busy, true);
assert.equal(await session.confirm("stamp", "CARD123"), null);
assert.equal(writes.length, 1, "Rapid double confirmation is one request");
failedResponse.reject(new Error("Response interrupted after commit"));
await assert.rejects(firstConfirm);
assert.equal(session.busy, false);
session.invalidate();
await session.inspect("redeem", "REWARD123");
session.invalidate();
await session.inspect("stamp", cardQr);
mutation = async () => ({ status: "stamped", replayed: true });
const replay = await session.confirm("stamp", "CARD123");
assert.equal(replay.replayed, true);
assert.equal(writes[0].requestId, writes[1].requestId, "Uncertain retry keeps the id after re-scan and tab changes");
await assert.rejects(session.confirm("stamp", "CARD123"));
await session.inspect("stamp", "CARD123");
mutation = async () => ({ status: "recent_scan" });
await session.confirm("stamp", "CARD123");
assert.notEqual(writes[2].requestId, writes[1].requestId);
mutation = async () => ({ status: "stamped" });
await session.confirm("stamp", "CARD123");
assert.notEqual(writes[3].requestId, writes[2].requestId, "A definite cooldown response permits a fresh later attempt");

const beforeReward = writes.length;
const rewardPreview = await session.inspect("redeem", "REWARD123");
assert.equal(rewardPreview.reward.metadata.termsSnapshot.discountPercent, 25);
assert.equal(writes.length, beforeReward, "Reward preview never redeems");
currentTime = Date.parse("2030-01-02T00:00:01Z");
await assert.rejects(session.confirm("redeem", "REWARD123"));
assert.equal(writes.length, beforeReward, "Reward expiring after preview cannot be confirmed");
currentTime = Date.parse("2030-01-01T00:00:00Z");
returnedReward = { ...reward, canRedeem: false, invalidReason: "Already redeemed" };
await session.inspect("redeem", "REWARD123");
await assert.rejects(session.confirm("redeem", "REWARD123"));
returnedReward = { ...reward, sourceType: "experience" };
await assert.rejects(session.inspect("redeem", "REWARD123"));
await assert.rejects(session.confirm("redeem", "REWARD123"));
await assert.rejects(session.inspect("stamp", createBarndaksaQrPayload("customer-reward", "REWARD123")));
assert.equal(writes.length, beforeReward, "Invalid preview or QR kind cannot reach a mutation");

const { startRastCameraSession } = load("components/rast-loyalty/camera-session.ts");
function cameraFixture() {
  const video = { srcObject: null }, detections = [], events = { tracksStopped: 0, controlsStopped: 0, acquire: 0, decode: 0, errors: 0 };
  const stream = { getTracks: () => [{ stop: () => events.tracksStopped++ }] };
  const controls = { stop: () => events.controlsStopped++ };
  let callback;
  const reader = { decodeFromStream: async (incoming, element, onResult) => { events.decode++; element.srcObject = incoming; callback = onResult; return controls; } };
  const options = { video, loadReader: async () => reader, acquireStream: async () => { events.acquire++; return stream; }, onDetected: (value) => detections.push(value), onError: () => events.errors++ };
  return { video, detections, events, stream, controls, reader, options, detect: () => callback?.({ getText: () => "CARD123" }, null, controls) };
}

{
  const fixture = cameraFixture(), loading = deferred();
  const stop = startRastCameraSession({ ...fixture.options, loadReader: () => loading.promise });
  stop(); loading.resolve(fixture.reader); await settle();
  assert.equal(fixture.events.acquire, 0, "Closing during decoder import cannot start a camera");
}
{
  const fixture = cameraFixture(), permission = deferred();
  const stop = startRastCameraSession({ ...fixture.options, acquireStream: () => permission.promise });
  await settle(); stop(); permission.resolve(fixture.stream); await settle();
  assert(fixture.events.tracksStopped > 0, "A late permission grant must stop every track");
  assert.equal(fixture.events.decode, 0); assert.equal(fixture.video.srcObject, null); assert.equal(fixture.events.errors, 0);
}
{
  const fixture = cameraFixture(), decoder = deferred();
  const reader = { decodeFromStream: async (stream, video) => { video.srcObject = stream; await decoder.promise; video.srcObject = stream; return fixture.controls; } };
  const stop = startRastCameraSession({ ...fixture.options, loadReader: async () => reader });
  await settle(); stop(); decoder.resolve(); await settle();
  assert(fixture.events.controlsStopped > 0, "Late decoder controls are stopped");
  assert(fixture.events.tracksStopped > 0); assert.equal(fixture.video.srcObject, null, "A late decoder cannot reattach the closed stream");
}
{
  const fixture = cameraFixture();
  const stop = startRastCameraSession(fixture.options); await settle();
  fixture.detect(); fixture.detect(); stop();
  assert.deepEqual(fixture.detections, ["CARD123"], "Repeated frames produce one detection");
  assert(fixture.events.controlsStopped > 0); assert(fixture.events.tracksStopped > 0); assert.equal(fixture.video.srcObject, null);
}
{
  const fixture = cameraFixture();
  startRastCameraSession({ ...fixture.options, acquireStream: async () => { throw new Error("Permission denied"); } });
  await settle(); assert.equal(fixture.events.errors, 1); assert.equal(fixture.video.srcObject, null);
}
{
  const fixture = cameraFixture(), permission = deferred();
  const stop = startRastCameraSession({ ...fixture.options, acquireStream: () => permission.promise });
  await settle(); stop(); permission.reject(new Error("Late permission rejection")); await settle();
  assert.equal(fixture.events.errors, 0, "Unmounted camera never reports a late error");
}

const { RastCashier, RastCashierRewardDetails } = load("components/rast-loyalty/rast-cashier.tsx", {
  "@/app/actions/loyalty-experience": { lookupRastCashierCardAction: async () => card, scanLoyaltyExperienceAction: async () => ({}) },
  "@/app/actions/cashier": { cashierLookupRewardAction: async () => reward, logoutCashierAction: async () => {} },
});
const html = renderToStaticMarkup(React.createElement(RastCashier, { initialData: { cashier: { fullName: "Test operator" } } }));
assert(html.includes('aria-describedby="rast-scan-help"'));
assert(html.includes('aria-pressed="true"'));
assert(html.includes('type="submit" disabled=""'));
assert(!html.includes('id="rast-scan-preview"'), "No confirmation preview before a real lookup");
const earnedDetails = renderToStaticMarkup(React.createElement(RastCashierRewardDetails, { reward }));
assert(earnedDetails.includes("25%") && earnedDetails.includes("Original terms"), "Cashier sees the original earned discount and terms");
const productDetails = renderToStaticMarkup(React.createElement(RastCashierRewardDetails, { reward: { ...reward, metadata: { termsSnapshot: { rewardKind: "product", rewardProductName: "Original product", terms: "Original terms" } } } }));
assert(productDetails.includes("Original product") && !productDetails.includes("25%"));
console.log("PASS: read-only scan previews, duplicate confirmation lock, uncertain-request id reuse, redemption guards, camera late cleanup and one detection, cashier SSR accessibility.");
}

// Exercise the actual legacy data functions and the shared entitlement guard.
// The database/provider adapters stay isolated; no scans or customer writes occur.
{
  const cafeId = "10000000-0000-4000-8000-000000000001";
  let cafeSlug = "rast", sourceType = "loyalty", allowed = false, entitlementError = false, auditDenied = false, linkedOwner = false;
  const featureReads = [], databaseWrites = [], rpcCalls = [], dataReads = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    rpc: async (name) => {
      rpcCalls.push(name);
      if (auditDenied) return { data: { ok: false, errorCode: "card_unavailable" }, error: null };
      return { data: name === "preview_loyalty_card"
        ? { ok: true, customerName: "Customer", stampsInCycle: 2, purchasesRequired: 7, availableRewards: 1, rewardName: "Reward" }
        : { ok: true, status: "stamped", cardCode: "CARD123" }, error: null };
    },
    from(table) {
      dataReads.push(table);
      const result = () => ({ error: null, count: 1, data:
        table === "cafe_cashier_sessions" ? { cafe_id: cafeId, cashier_id: "cashier", revoked_at: null }
          : table === "cafe_cashiers" ? { id: "cashier", active: true, full_name: "Test cashier", email: "test@example.test", owner_user_id: linkedOwner ? "owner-id" : null }
          : table === "cafes" ? { id: cafeId, slug: cafeSlug, status: "active", deleted_at: null, owner_user_id: "owner-id" }
          : table === "customer_reward_instances" ? { id: "reward", cafe_id: cafeId, source_type: sourceType, status: "available", loyalty_card_id: "card", reward_title: "Reward", reward_code: "REWARD123", customer_profiles: { full_name: "Customer" }, issued_at: "2030-01-01", expires_at: null }
            : table === "loyalty_cards" ? { id: "card", cafe_id: cafeId, customer_name: "Customer", stamps_in_cycle: 2, available_rewards: 1 }
              : table === "cafe_loyalty_programs" ? { enabled: true, purchases_required: 7, reward_name: "Reward" } : { id: "row" },
      });
      const query = {
        select() { return query; }, eq() { return query; }, is() { return query; }, gt() { return query; }, or() { return query; },
        update() { databaseWrites.push(table); return query; }, insert() { databaseWrites.push(table); return query; },
        maybeSingle: async () => result(),
        then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  };
  const stubs = {
    "server-only": {},
    "next/headers": { cookies: async () => ({ get: () => ({ value: "session-token" }) }) },
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/data/cafes": { requireOwnerCafeContext: async () => ({ id: cafeId, slug: cafeSlug }) },
    "@/lib/data/feature-entitlements": { getCafeFeatureCodes: async (id) => { featureReads.push(id); if (entitlementError) throw new Error("entitlement lookup unavailable"); return allowed ? ["loyalty"] : []; } },
    "@/lib/data/loyalty-cards": {}, "@/lib/data/customer-rewards": {},
    "@/lib/data/settings": {}, "@/lib/auth/rast-loyalty-session": {},
    "@/lib/data/operation-events": { operationEventTypes: {}, recordOperationEvent: async () => {} },
    "@/lib/data/notifications": {}, "@/lib/notifications/whatsapp": {},
  };
  const cashierData = load("lib/data/cashier.ts", stubs);
  stubs["@/lib/data/cashier"] = cashierData;
  const rewardsData = load("lib/data/customer-rewards.ts", stubs);
  const experienceData = load("lib/data/loyalty-experience.ts", stubs);
  const ownerData = load("lib/data/loyalty-cards.ts", stubs);
  const operations = [
    () => cashierData.cashierScanLoyalty({ cafeId, cardCode: "CARD123" }),
    () => rewardsData.lookupCashierCustomerReward("REWARD123"),
    () => rewardsData.redeemCashierCustomerReward("REWARD123"),
    () => experienceData.lookupRastCashierCard("CARD123"),
  ];
  for (const operation of operations) await assert.rejects(operation, /برنامج الولاء غير متاح/);
  await assert.rejects(() => ownerData.recordOwnerLoyaltyOperation({ cardCode: "CARD123" }), /شاشة الموظف/);
  assert.equal(featureReads.length, 4, "All four Rast cashier/preview entry points enforce entitlement");
  assert(featureReads.every((id) => id === cafeId), "Guard uses the authenticated tenant id");
  assert.equal(rpcCalls.length, 0); assert.equal(databaseWrites.length, 0);
  assert(!dataReads.includes("loyalty_cards"), "Denied card previews never load a customer card");
  allowed = true;
  for (const operation of operations) await operation();
  await assert.rejects(() => ownerData.recordOwnerLoyaltyOperation({ cardCode: "CARD123" }), /شاشة الموظف/);
  assert.deepEqual(rpcCalls, ["execute_loyalty_audited_operation", "preview_loyalty_reward", "execute_loyalty_audited_operation", "preview_loyalty_card"]);
  auditDenied = true;
  for (const operation of operations) await assert.rejects(operation);
  assert.equal(databaseWrites.length, 0, "Denied audit responses never trigger fallback legacy writes");
  auditDenied = false;
  entitlementError = true;
  const rpcCount = rpcCalls.length;
  for (const operation of operations) await assert.rejects(operation, /entitlement lookup unavailable/);
  assert.equal(rpcCalls.length, rpcCount, "Entitlement lookup failure stays closed");
  entitlementError = false; allowed = false;
  const previousReads = featureReads.length;
  sourceType = "experience";
  assert.equal((await rewardsData.lookupCashierCustomerReward("REWARD123")).canRedeem, true);
  await rewardsData.redeemCashierCustomerReward("REWARD123");
  assert.equal(featureReads.length, previousReads, "Experience rewards retain their separate access behavior");
  cafeSlug = "other"; sourceType = "loyalty";
  await cashierData.cashierScanLoyalty({ cafeId, cardCode: "CARD123" });
  await rewardsData.lookupCashierCustomerReward("REWARD123");
  await rewardsData.redeemCashierCustomerReward("REWARD123");
  await ownerData.recordOwnerLoyaltyOperation({ cardCode: "CARD123" });
  assert.equal(featureReads.length, previousReads, "Other brands do not acquire a new Rast restriction");
  assert.equal(rpcCalls.filter((name) => name === "record_loyalty_card_operation").length, 2);
  linkedOwner = true;
  const beforeLogoutChecks = { rpc: rpcCalls.length, writes: databaseWrites.length };
  for (const operation of operations) await assert.rejects(operation, /Owner cashier session expired/);
  assert.equal(rpcCalls.length, beforeLogoutChecks.rpc, "All four entry points reject logged out owner before privileged RPC");
  assert.equal(databaseWrites.length, beforeLogoutChecks.writes, "Logged out linked owner never falls back to customer writes");
  console.log("PASS: shared Rast entitlement guards four cashier/preview entry points, owner scans always reject, enabled cashier paths succeed, other brands and experience rewards unchanged.");
}
