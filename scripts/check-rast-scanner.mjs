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
    if (name.endsWith('.module.css')) return new Proxy({}, { get: (_, key) => String(key) });
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
const reward = { sourceType: "loyalty", rewardCode: "REWARD123", canRedeem: true, expiresAt: "2030-01-02T00:00:00Z", invalidReason: null, rewardTitle: "Earned reward", customerName: "Test customer", metadata: { termsSnapshot: { rewardKind: "discount", discountPercent: 25, terms: "Original terms" } } };
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
const sequentialReads = [], sequentialWrites = [];
const sequentialSession = createRastScanSession({ lookupCard: async value => { sequentialReads.push(value); return card; }, lookupReward: async () => reward,
  commit: async input => { sequentialWrites.push(input); return { status: "stamped" }; }, createRequestId: () => "sequential-request" });
await sequentialSession.inspect("stamp", "١");
await sequentialSession.confirm("stamp", "1");
assert.deepEqual(sequentialReads, ["1"]); assert.equal(sequentialWrites[0].value, "1");
await sequentialSession.inspect("redeem", "٢");
await sequentialSession.confirm("redeem", "2");
assert.equal(sequentialWrites[1].value, "REWARD123", "Short membership number still redeems the exact inspected reward");
await session.inspect("redeem", "REWARD123");
assert(session.preview, "A prior reward preview exists before checking a depleted card");
returnedReward = null;
assert.equal(await session.inspect("redeem", "10000"), null);
assert.equal(session.preview, null, "An eligible card without rewards cannot create a confirmation preview");
await assert.rejects(session.confirm("redeem", "10000"));
assert.equal(writes.length, 0, "No rewards means no redemption RPC");
returnedReward = reward; reads.length = 0;
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

// Wallet membership QR resolves to one immutable reward target, including uncertain retries.
{
  const commits = []; let lookups = 0, fail = true, expired = false;
  const redemption = createRastScanSession({
    lookupCard: async () => card,
    lookupReward: async (code) => { assert.equal(code, "CARD123"); lookups++; return { ...reward, rewardCode: lookups === 1 ? "REWARD123" : "REWARD456" }; },
    commit: async (input) => { commits.push(input); if (fail) throw new Error("Lost response after commit"); return { status: "redeemed", replayed: true }; },
    createRequestId: () => `redeem-${commits.length}`, now: () => Date.parse(expired ? "2031-01-01" : "2030-01-01"),
  });
  await redemption.inspect("redeem", cardQr);
  assert.equal(commits.length, 0, "Reading a membership cannot spend a reward");
  await assert.rejects(() => redemption.confirm("redeem", "OTHER123"));
  await assert.rejects(() => redemption.confirm("redeem", cardQr));
  assert.equal(commits[0].value, "REWARD123", "Commit pins the displayed reward, not the membership");
  redemption.invalidate(); expired = true;
  const retry = await redemption.inspect("redeem", " card123 ");
  assert.equal(retry.retryPending, true); assert.equal(lookups, 1, "Rescanning cannot select the next reward after an interrupted response");
  fail = false;
  await redemption.confirm("redeem", cardQr);
  assert.deepEqual(commits[1], commits[0], "Retry after expiry reuses the same target and id; database resolves prior commit");
  await assert.rejects(() => redemption.confirm("redeem", cardQr));
  expired = false;
  assert.equal((await redemption.inspect("redeem", cardQr)).reward.rewardCode, "REWARD456", "A new inspection after success can show another earned reward");
  for (const wrongKind of ["invoice", "experience-reward", "event-ticket"]) {
    await assert.rejects(() => redemption.inspect("redeem", createBarndaksaQrPayload(wrongKind, "CARD123")));
  }
}

{
  let lookups = 0;
  const denied = createRastScanSession({
    lookupCard: async () => card,
    lookupReward: async () => { lookups++; return reward; },
    commit: async () => ({ ok: false, status: "reward_unavailable" }),
    createRequestId: () => "denied-request", now: () => Date.parse("2030-01-01"),
  });
  await denied.inspect("redeem", cardQr);
  await denied.confirm("redeem", cardQr);
  assert.equal(denied.preview, null, "A definite database denial invalidates the old preview");
  await assert.rejects(() => denied.confirm("redeem", cardQr));
  await denied.inspect("redeem", cardQr);
  assert.equal(lookups, 2, "A new explicit scan can refresh rewards after a known rejection");
}

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

const { RastCashier, RastCashierRewardDetails, RastCashierEmptyRewards, RastCashierReadSummary } = load("components/rast-loyalty/rast-cashier.tsx", {
  "@/app/actions/cashier-invoice-points": {},
  "./use-read-outbox": { useReadOutbox: () => ({ rows: [], save: async () => {}, storageError: false, authPaused: false }) },
  "@/components/cashier/analytics-coupon-redemption": { AnalyticsCouponRedemption: () => null },
  "@/app/actions/cashier-loyalty-phone": { lookupCashierLoyaltyPhoneAction: async () => ({ ok: true, cardCode: "CARD123" }) },
  "@/app/actions/loyalty-experience": { lookupRastCashierCardAction: async () => card, lookupRastCashierRewardAction: async () => reward, scanLoyaltyExperienceAction: async () => ({}) },
  "@/app/actions/cashier": { cashierLookupRewardAction: async () => reward, logoutCashierAction: async () => {} },
});
const emptyHtml = renderToStaticMarkup(React.createElement(RastCashierEmptyRewards));
assert(emptyHtml.includes('role="status"') && !emptyHtml.includes('role="alert"'));
assert(!emptyHtml.includes('<button') && !emptyHtml.includes('bg-red-'));
const { cashierText } = load("lib/cashier/language.ts");
assert.equal(cashierText("en", "لا توجد مكافآت حالية للصرف"), "No rewards are currently available to redeem");
assert(emptyHtml.includes(cashierText("ar", "لا توجد مكافآت حالية للصرف")));
const html = renderToStaticMarkup(React.createElement(RastCashier, { initialData: { cafe: { slug: 'rast', name: 'Test cafe' }, cashier: { fullName: "Test operator" } } }));
assert(html.includes('aria-describedby="rast-scan-help"'));
assert(html.includes('aria-pressed="true"'));
assert(html.includes('type="submit" disabled=""'));
assert(!html.includes('id="rast-scan-preview"'), "No confirmation preview before a real lookup");
const pointsHtml = renderToStaticMarkup(React.createElement(RastCashier, { initialData: {
  cafe: { slug: "test-cafe", name: "Demo" }, cashier: { fullName: "Operator" },
  pointsProgram: { mode: "points", rateSar: 2, rateQuantity: 3, milestones: [] },
} }));
assert(pointsHtml.includes("قيمة الفاتورة بالريال") && pointsHtml.includes("صرف مكافأة") && !pointsHtml.includes('id="rast-scan-code"'), "Points mode uses the invoice input and retains redemption");
assert(pointsHtml.includes("تسجيل نقاط الفاتورة") && !pointsHtml.includes("مراجعة الفاتورة"), "A single invoice submit records points without review");
{
  const apiCalls = [];
  const { POST } = load("app/api/cashier/invoice-points/route.ts", {
    "@/app/actions/cashier-invoice-points": {
      resolveInvoiceCardAction: async (...input) => { apiCalls.push(input); return "MEMBER"; },
      addCashierInvoicePointsAction: async input => { apiCalls.push(input); return { ok:true, pointsAdded:7, pointsBalance:17 }; },
    },
  });
  const origin="https://demo.example", url=origin+"/api/cashier/invoice-points";
  const scope={cafeId:"2e08901c-5aac-4bec-8c97-a135058e508b",cashierId:"124be05a-3bae-4d8b-9367-d70ca03cbd52"};
  const request = (payload, from=origin) => new Request(url,{method:"POST",headers:{Origin:from,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const credit={scope,requestId:"797a1cde-c8b9-4736-bb9f-73033e5a5b8b",cardCode:"MEMBER",rateSar:1,rateQuantity:1,amountHalalas:700};
  assert.equal((await POST(request({step:"credit", ...credit},"https://elsewhere.example"))).status,403);
  assert.equal((await POST(request({step:"credit",...credit,amountHalalas:-1}))).status,400); assert.equal(apiCalls.length,0);
  assert.deepEqual(await (await POST(request({step:"resolve",scope,identifier:"123"}))).json(),{ok:true,cardCode:"MEMBER"});
  assert.deepEqual(await (await POST(request({step:"credit", ...credit}))).json(),{ok:true,pointsAdded:7,pointsBalance:17});
  assert.deepEqual(apiCalls,[[scope,"123"],credit]);
  const {cardCode, ...phoneInvoice}=credit;
  const forwarded={...phoneInvoice,phone:"966501234567"};
  assert.equal((await POST(request({step:"credit",...credit,phone:"0501234567"}))).status,400);
  assert.equal((await POST(request({step:"credit",...phoneInvoice,phone:"invalid0501234567"}))).status,400);
  await POST(request({step:"credit",...phoneInvoice,phone:"٠٥٠ ١٢٣ ٤٥٦٧"}));
  assert.deepEqual(apiCalls.at(-1),{...phoneInvoice,phone:"٠٥٠ ١٢٣ ٤٥٦٧"}, "Local phone reaches the trusted tenant validation before normalization");
  await POST(request({step:"credit",...phoneInvoice,cardCode:"+966501234567"}));
  assert.deepEqual(apiCalls.at(-1),forwarded, "An older client's pinned phone reference performs the same atomic credit");
}
{
  const { POINTS_CAFE_ID } = load("lib/loyalty/points-program.ts");
  const scope = { cafeId: POINTS_CAFE_ID, cashierId: "124be05a-3bae-4d8b-9367-d70ca03cbd52" };
  const requestId = "797a1cde-c8b9-4736-bb9f-73033e5a5b8b";
  const args = { scope, requestId, cardCode: "CARD123", amountHalalas: 320, rateSar: 2, rateQuantity: 3 };
  const jobs = [], syncs = [], calls = [];
  let rpcResult = { ok: false, errorCode: "points_rate_changed" };
  let lookups=0;
  const { addCashierInvoicePointsAction, resolveInvoiceCardAction, inspectPointsCardAction, redeemCashierPointsAction } = load("app/actions/cashier-invoice-points.ts", {
    "next/server": { after: job => jobs.push(job) },
    "@/lib/data/cashier": { requireCashierPermission: async permission => { assert.equal(permission, "loyalty"); return { ...scope, token: "verified-session" }; } },
    "@/lib/data/brand-phone-country": { getBrandPhoneCountry: async id => { assert.equal(id, scope.cafeId); return "SA"; } },
    "@/lib/data/cashier-loyalty-phone": { resolveCashierLoyaltyPhone: async () => { lookups++; return "CARD123"; } },
    "@/lib/data/loyalty-experience": { lookupRastCashierCard: async () => ({customerName:"Member"}) },
    "@/lib/data/rast-loyalty-access": { assertRastLoyaltyEntitlement: async id => assert.equal(id, scope.cafeId) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name, payload) => { calls.push([name, payload]); return { data: rpcResult }; } }) },
    "@/lib/wallet": { syncWalletCardByCode: async code => syncs.push(code) },
  });
  await assert.rejects(addCashierInvoicePointsAction({ ...args, scope: { ...scope, cafeId: requestId } }));
  await assert.rejects(addCashierInvoicePointsAction({ ...args, amountHalalas: 1.25 }));
  assert.equal(calls.length, 0, "Untrusted scope and sub-halalah inputs never reach SQL");
  assert.deepEqual(await addCashierInvoicePointsAction(args), { ok: false, reason: "points_rate_changed" });
  assert.equal(jobs.length, 0);
  assert.deepEqual(calls[0], ["scan_loyalty_invoice_points", {
    p_request_id: requestId, p_session_token: "verified-session", p_card_code: "CARD123", p_amount_sar: 3.2, p_expected_rate_sar: 2, p_expected_rate_quantity: 3,
  }]);
  const affordableRewards = [{ points: 200, reward: "Coffee" }];
  rpcResult = { ok: true, status: "points_added", cardCode: "CARD123", pointsBalance: 203, pointsAdded: 4, affordableRewards };
  assert.deepEqual(await addCashierInvoicePointsAction(args), { ok: true, pointsAdded: 4, pointsBalance: 203, affordableRewards });
  await jobs[0](); assert.deepEqual(syncs, ["CARD123"], "A committed points result schedules its wallet refresh");
  const {cardCode, ...phoneTerms} = args;
  assert.equal(await resolveInvoiceCardAction(scope,"٠٥٠١٢٣٤٥٦٧"),"+966501234567");
  const phoneCredit = {...phoneTerms,phone:"0501234567"};
  await assert.rejects(addCashierInvoicePointsAction({...phoneCredit,scope:{...scope,cashierId:requestId}}));
  assert.deepEqual(await addCashierInvoicePointsAction(phoneCredit), { ok:true, pointsAdded:4, pointsBalance:203, affordableRewards });
  assert.deepEqual(calls.at(-1), ["scan_loyalty_invoice_points_by_phone", {
    p_request_id:requestId, p_session_token:"verified-session", p_phone:"966501234567", p_amount_sar:3.2, p_expected_rate_sar:2, p_expected_rate_quantity:3,
  }]);
  assert.equal(lookups,0, "Credit and compatibility resolve need no pre-existing membership");
  await jobs[1](); assert.deepEqual(syncs,["CARD123","CARD123"], "Phone credit syncs the canonical card from the committed receipt");
  rpcResult = { ok: true, status: "points_options", pointsBalance: 203, affordableRewards };
  assert.deepEqual(await inspectPointsCardAction(scope,"0501234567"), { code:"CARD123", customerName:"Member", pointsBalance:203, affordableRewards });
  assert.equal(lookups,1, "Reward inspection is still lookup-only");
  assert.equal(calls.at(-1)[0], "get_loyalty_points_options");
  const spend = { scope, requestId, cardCode:"CARD123", cost:200, reward:"Coffee", expectedBalance:203 };
  await assert.rejects(redeemCashierPointsAction({ ...spend, scope: { ...scope, cafeId: requestId } }));
  rpcResult = { ok:false, errorCode:"points_balance_changed" };
  assert.deepEqual(await redeemCashierPointsAction(spend), { ok:false, reason:"points_balance_changed" });
  assert.deepEqual(calls.at(-1), ["redeem_loyalty_points_reward", {
    p_session_token:"verified-session", p_card_code:"CARD123", p_request_id:requestId, p_cost:200, p_reward:"Coffee", p_expected_balance:203,
  }]);
  rpcResult = { ok:true, status:"points_redeemed", cardCode:"CARD123", pointsBalance:3, pointsSpent:200, reward:"Coffee", affordableRewards:[] };
  assert.deepEqual(await redeemCashierPointsAction(spend), { ok:true, replayed:false, pointsBalance:3, pointsSpent:200, reward:"Coffee", affordableRewards:[] });
  await jobs[2](); assert.deepEqual(syncs, ["CARD123","CARD123","CARD123"]);
}
const summaryRows = [
  { operation: { status: "succeeded", rewardIssued: true } },
  {}, { operation: { status: "pending" } }, { operation: { status: "processing" } },
  { operation: { status: "failed", retryable: true } },
  { operation: { status: "failed", retryable: false } }, { operation: { status: "needs_review" } },
  { operation: { status: "duplicate" } }, { errorCode: "rejected:invalid_phone" },
].map((row, index) => ({ ...row, requestId: `private-request-${index}`, value: "0501234567", identifierHint: "private-identifier", createdAt: "2026-11-08T12:34:00Z", errorMessage: "private-local-error", operation: row.operation ? { ...row.operation, customerName: "private-customer", errorMessage: "private-server-error" } : undefined }));
const summaryHtml = renderToStaticMarkup(React.createElement(RastCashierReadSummary, { rows: summaryRows }));
for (const [state, count] of [["succeeded", 1], ["pending", 4], ["failed", 4]]) {
  assert(summaryHtml.match(new RegExp(`data-state="${state}"[^]*?<strong>${new Intl.NumberFormat("ar").format(count)}</strong>`)), `Honest ${state} count`);
}
assert.equal((summaryHtml.match(/<button[^>]*data-state=/g) ?? []).length, 3, "Three labeled counters filter the device history");
assert(summaryHtml.includes('aria-live="polite"') && summaryHtml.includes('aria-atomic="true"'));
assert(summaryHtml.includes('أختام مسجلة') && summaryHtml.includes('لم تُسجل'), "Status labels are visible without hovering");
assert.equal((summaryHtml.match(/title=/g) ?? []).length, 3, "Every icon explains its meaning");
assert(!/private-request-|0501234567/.test(summaryHtml), "History never exposes raw input or internal request IDs");
assert(summaryHtml.includes('private-local-error') && summaryHtml.includes('private-server-error'), "Failed scans show their actual reason without extra clicks");
assert(summaryHtml.includes('<time') && summaryHtml.includes('<bdi'), "History identifies the scan time and masked identifier");
const emptySummary = renderToStaticMarkup(React.createElement(RastCashierReadSummary, { rows: [] }));
assert.equal((emptySummary.match(new RegExp(`<strong>${new Intl.NumberFormat("ar").format(0)}</strong>`, "g")) ?? []).length, 3, "Empty state keeps three zero counters");
assert.equal(cashierText("en", "لم تُسجل"), "Not recorded");
assert.equal(cashierText("en", "تحتاج مزامنة"), "Needs sync");
const earnedDetails = renderToStaticMarkup(React.createElement(RastCashierRewardDetails, { reward }));
assert(earnedDetails.includes("25%") && earnedDetails.includes("Original terms"), "Cashier sees the original earned discount and terms");
const productDetails = renderToStaticMarkup(React.createElement(RastCashierRewardDetails, { reward: { ...reward, metadata: { termsSnapshot: { rewardKind: "product", rewardProductName: "Original product", terms: "Original terms" } } } }));
assert(productDetails.includes("Original product") && !productDetails.includes("25%"));
console.log("PASS: read-only scan previews, duplicate confirmation lock, uncertain-request id reuse, redemption guards, camera late cleanup and one detection, cashier SSR accessibility, compact private counters across all operation states.");
}

// Exercise the actual legacy data functions and the shared entitlement guard.
// The database/provider adapters stay isolated; no scans or customer writes occur.
{
  const cafeId = "10000000-0000-4000-8000-000000000001";
  let cafeSlug = "rast", sourceType = "loyalty", allowed = false, entitlementError = false, auditDenied = false, linkedOwner = false;
  const featureReads = [], databaseWrites = [], rpcCalls = [], dataReads = [], rpcPayloads = [], queryFilters = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    rpc: async (name, payload) => {
      rpcCalls.push(name);
      rpcPayloads.push(payload);
      if (auditDenied) return { data: { ok: false, errorCode: "card_unavailable" }, error: null };
      return { data: name === "preview_loyalty_card"
        ? { ok: true, customerName: "Customer", stampsInCycle: 2, purchasesRequired: 7, availableRewards: 1, rewardName: "Reward" }
        : { ok: true, status: "stamped", cardCode: "CARD123" }, error: null };
    },
    from(table) {
      dataReads.push(table);
      const result = () => ({ error: null, count: 1, data:
        table === "cafe_cashier_sessions" ? { cafe_id: cafeId, cashier_id: "cashier", revoked_at: null }
          : table === "cafe_cashiers" ? { id: "cashier", active: true, can_use_loyalty: true, full_name: "Test cashier", email: "test@example.test", owner_user_id: linkedOwner ? "owner-id" : null }
          : table === "cafes" ? { id: cafeId, slug: cafeSlug, status: "active", deleted_at: null, owner_user_id: "owner-id" }
          : table === "customer_reward_instances" ? { id: "reward", cafe_id: cafeId, source_type: sourceType, status: "available", loyalty_card_id: "card", reward_title: "Reward", reward_code: "REWARD123", customer_profiles: { full_name: "Customer" }, issued_at: "2030-01-01", expires_at: null }
            : table === "loyalty_cards" ? { id: "card", cafe_id: cafeId, card_code: "SECURECARD123", customer_name: "Customer", stamps_in_cycle: 2, available_rewards: 1 }
              : table === "cafe_loyalty_programs" ? { enabled: true, purchases_required: 7, reward_name: "Reward" } : { id: "row" },
      });
      const query = {
        select() { return query; }, eq(column, value) { queryFilters.push({ table, column, value }); return query; }, is() { return query; }, gt() { return query; }, or() { return query; },
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
  for (const operation of operations) await assert.rejects(operation, /برنامج الولاء غير متاح|صلاحية استخدام هذه الخدمة/);
  await assert.rejects(() => ownerData.recordOwnerLoyaltyOperation({ cardCode: "CARD123" }), /شاشة الموظف/);
  assert(featureReads.length >= 4, "All four cashier/preview entry points enforce entitlement");
  assert(featureReads.every((id) => id === cafeId), "Guard uses the authenticated tenant id");
  assert.equal(rpcCalls.length, 0); assert.equal(databaseWrites.length, 0);
  assert(!dataReads.includes("loyalty_cards"), "Denied card previews never load a customer card");
  allowed = true;
  for (const operation of operations) await operation();
  await assert.rejects(() => ownerData.recordOwnerLoyaltyOperation({ cardCode: "CARD123" }), /شاشة الموظف/);
  assert.deepEqual(rpcCalls, ["execute_loyalty_audited_operation", "preview_loyalty_reward", "execute_loyalty_audited_operation", "preview_loyalty_card"].flatMap(name => ["brand_finance_loyalty_session_guard", name]));
  await cashierData.cashierScanLoyalty({ cafeId, cardCode: "١" });
  assert.equal(rpcPayloads.at(-1).p_code, "SECURECARD123", "Legacy cashier resolves Arabic short numbers before audited stamping");
  assert(queryFilters.some(f => f.table === "loyalty_cards" && f.column === "cafe_id" && f.value === cafeId), "Number lookup is authenticated brand scoped");
  assert(queryFilters.some(f => f.table === "loyalty_cards" && f.column === "display_number" && f.value === 1));
  const readsBeforeWrongBrand = dataReads.length;
  await assert.rejects(() => cashierData.cashierScanLoyalty({ cafeId: "other-brand", cardCode: "1" }), /لا تطابق/);
  assert(!dataReads.slice(readsBeforeWrongBrand).includes("loyalty_cards"), "Wrong-brand request never resolves a card");
  const beforeInvalid = rpcCalls.length;
  await assert.rejects(() => cashierData.cashierScanLoyalty({ cafeId, cardCode: "0" }), /غير صالح/);
  await assert.rejects(() => cashierData.cashierScanLoyalty({ cafeId, cardCode: "01" }), /غير صالح/);
  assert.equal(rpcCalls.length, beforeInvalid, "Invalid short number never enters audited mutation");
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
  await assert.rejects(() => rewardsData.lookupCashierCustomerReward("REWARD123"));
  await assert.rejects(() => rewardsData.redeemCashierCustomerReward("REWARD123"));
  cafeSlug = "other"; sourceType = "loyalty";
  for (const operation of operations) await assert.rejects(operation);
  allowed = true;
  for (const operation of operations) await operation();
  await assert.rejects(() => ownerData.recordOwnerLoyaltyOperation({ cardCode: "CARD123" }));
  assert(featureReads.length > previousReads, "Every brand enforces its own package eligibility");
  assert.equal(rpcCalls.filter((name) => name === "record_loyalty_card_operation").length, 0);
  linkedOwner = true;
  const beforeLogoutChecks = { rpc: rpcCalls.length, writes: databaseWrites.length };
  for (const operation of operations) await assert.rejects(operation, /Owner cashier session expired/);
  assert.equal(rpcCalls.length, beforeLogoutChecks.rpc, "All four entry points reject logged out owner before privileged RPC");
  assert.equal(databaseWrites.length, beforeLogoutChecks.writes, "Logged out linked owner never falls back to customer writes");
  console.log("PASS: Every brand enforces entitlement and owner logout with the same audited scanner engine");
}
