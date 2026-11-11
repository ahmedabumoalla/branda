import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
function load(relative, stubs = {}, cache = new Map()) {
  if (cache.has(relative)) return cache.get(relative);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {}; cache.set(relative, exports);
  new Function("require", "exports", output)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === "server-only") return {};
    if (name.startsWith("@/") || name.startsWith(".")) return load(`${name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name)}.ts`, stubs, cache);
    return dependency(name);
  }, exports);
  return exports;
}

const timestamp = "2026-10-04T09:29:42.717557+00:00";
const later = "2026-10-04T09:29:42.717558+00:00";
const tags = load("lib/wallet/update-tags.ts");
assert.match(tags.appleUpdateTag(timestamp), /^\d+$/);
assert.equal(BigInt(tags.appleUpdateTag(later)) - BigInt(tags.appleUpdateTag(timestamp)), 1n);
assert.equal(tags.appleUpdateTimestamp(tags.appleUpdateTag(timestamp)), "2026-10-04T09:29:42.717557Z");
for (const legacy of [timestamp, timestamp.replace("+", " "), "2026-10-04T12:29:42.717557+03:00"]) {
  assert.equal(tags.appleUpdateTimestamp(legacy), "2026-10-04T09:29:42.717557Z");
}
for (const invalid of ["", "invalid", "2026-40-04T01:00:00Z", "1e18", "9".repeat(19), "2026-10-04T00:00:00Z or true"]) assert.equal(tags.appleUpdateTimestamp(invalid), null);

const member = { cafeSlug: "rast", card: { id: "card-test", cardCode: "TEST_CARD", cafeId: "cafe-test", updatedAt: timestamp }, program: { enabled: true, appleWalletEnabled: true, googleWalletEnabled: false } };
function queryFor(run) {
  const state = { filters: [] };
  const query = {};
  for (const method of ["select", "eq", "neq", "in", "gt", "lte", "or", "order", "range", "limit", "update", "insert", "upsert", "delete", "maybeSingle"]) {
    query[method] = (...args) => { state.filters.push([method, ...args]); if (["update", "insert", "upsert"].includes(method)) state[method] = args[0]; return query; };
  }
  query.then = (resolve, reject) => Promise.resolve(run(state)).then(resolve, reject);
  return query;
}
const baseStubs = {
  "@/lib/data/feature-entitlements": { getCafeFeatureCodes: async () => ["loyalty"] },
  "./config": { appleConfig: () => ({ passTypeIdentifier: "pass.test" }), getWalletReadiness: () => ({ apple: true, google: false }) },
  "./apple": { verifyAppleAuth: request => request.headers.get("authorization") === "ApplePass test", issueApplePass: async () => Buffer.from("signed-test-bundle") },
  "@/lib/data/loyalty-experience": { loadWalletMemberByCode: async () => member },
};
const request = (url = "https://wallet.example.test", headers = {}) => new Request(url, { headers: { authorization: "ApplePass test", ...headers } });

for (const tag of [tags.appleUpdateTag(timestamp), timestamp, encodeURIComponent(timestamp)]) {
  let filter;
  const service = load("lib/wallet/webservice.ts", { ...baseStubs, "@/lib/supabase/admin": { createAdminClient: () => ({ from: table => queryFor(state => {
    if (table === "wallet_apple_registrations") return { data: [{ card_id: member.card.id }] };
    if (table === "wallet_passes") { filter = state.filters.find(([method]) => method === "gt"); return { data: [{ card_id: member.card.id, updated_at: later }] }; }
    return { data: [{ card_code: member.card.cardCode }] };
  }) }) } });
  const response = await service.listAppleUpdates(request(`https://wallet.example.test?passesUpdatedSince=${tag}`), "registered-device-123", "pass.test");
  assert.equal(response.status, 200);
  assert.equal(filter[2], "2026-10-04T09:29:42.717557Z");
  assert.deepEqual(await response.json(), { serialNumbers: [member.card.cardCode], lastUpdated: tags.appleUpdateTag(later) });
}
let dbCalls = 0, generated = 0;
const steps = [], writes = [];
const service = load("lib/wallet/webservice.ts", { ...baseStubs,
  "./apple": { ...baseStubs["./apple"], issueApplePass: async () => { generated++; return Buffer.from("signed-test-bundle"); } },
  "@/lib/data/loyalty-experience": { loadWalletMemberByCode: async () => { steps.push("snapshot"); return member; } },
  "@/lib/supabase/admin": { createAdminClient: () => { dbCalls++; return { from: () => queryFor(state => {
    if (state.update) writes.push(state); else steps.push("version");
    return { data: { card_id: member.card.id, updated_at: timestamp } };
  }) }; } },
});
assert.equal((await service.downloadUpdatedApplePass(new Request("https://wallet.example.test"), "pass.test", member.card.cardCode)).status, 401);
assert.equal(dbCalls, 0);
const response = await service.downloadUpdatedApplePass(request(), "pass.test", member.card.cardCode);
assert.equal(response.status, 200);
assert.deepEqual(steps, ["version", "snapshot"], "Never assign a newer tag to an older snapshot during a concurrent scan");
assert.equal(writes[0].update.apple_last_served_update, timestamp);
assert(writes[0].filters.some(([method, filter]) => method === "or" && filter.includes("apple_last_served_update.lt.")), "Out-of-order downloads cannot move the served watermark backwards");
assert.equal(response.headers.get("last-modified"), new Date(timestamp).toUTCString());
assert.equal((await service.downloadUpdatedApplePass(request(undefined, { "if-modified-since": "Sun, 04 Oct 2026 09:29:42 GMT" }), "pass.test", member.card.cardCode)).status, 200, "Second resolution never hides a newer subsecond scan");
assert.equal((await service.downloadUpdatedApplePass(request(undefined, { "if-modified-since": "Sun, 04 Oct 2026 09:29:43 GMT" }), "pass.test", member.card.cardCode)).status, 304);
assert.equal(generated, 2);

for (const existing of [false, true]) {
  let queued = 0;
  const registrationService = load("lib/wallet/webservice.ts", { ...baseStubs, "@/lib/supabase/admin": { createAdminClient: () => ({ from: table => queryFor(state => {
    if (table === "wallet_notification_jobs") { queued++; return { error: { code: "23505" } }; }
    return { data: state.upsert ? null : existing ? { card_id: member.card.id } : null };
  }) }) } });
  const registration = new Request("https://wallet.example.test", { method: "POST", headers: { authorization: "ApplePass test" }, body: JSON.stringify({ pushToken: "a".repeat(64) }) });
  assert.equal((await registrationService.registerAppleDevice(registration, "registered-device-123", "pass.test", member.card.cardCode)).status, existing ? 200 : 201);
  assert.equal(queued, existing ? 0 : 1, "New installation queues a reconciliation without duplicate registration pushes");
}

for (const scenario of ["accepted", "410", "no-response", "closed", "timeout"]) {
  let destroyed = false, headers, payload;
  const client = new EventEmitter(), stream = new EventEmitter();
  client.destroy = () => { destroyed = true; };
  client.setTimeout = (_, callback) => { if (scenario === "timeout") queueMicrotask(callback); };
  client.request = value => { headers = value; return stream; };
  stream.resume = () => {};
  stream.end = value => { payload = value; queueMicrotask(() => {
    if (scenario === "timeout") return;
    if (scenario === "closed") { stream.emit("close"); return; }
    if (["accepted", "410"].includes(scenario)) stream.emit("response", { ":status": scenario === "accepted" ? 200 : 410 });
    stream.emit("end");
  }); };
  const push = load("lib/wallet/apple-push.ts", { "./config": baseStubs["./config"], "node:http2": { connect: () => client } });
  if (scenario === "accepted") await push.pushAppleDevice("a".repeat(64));
  else await assert.rejects(push.pushAppleDevice("a".repeat(64)), /apple_push_/);
  assert.equal(headers["apns-priority"], "10"); assert.equal(headers["apns-topic"], "pass.test"); assert.equal(payload, "{}"); assert(destroyed);
}

for (const mode of ["immediate", "retry", "served", "new-device-served", "replacement-during-push", "multiple-served", "exhausted"]) {
  let pushed = 0;
  const updates = [];
  const db = { rpc: async () => ({ data: [{ id: "job", kind: "sync", cafe_id: member.card.cafeId, card_id: member.card.id, attempts: mode === "exhausted" ? 5 : 1, delivery_state: mode === "new-device-served" ? {} : { apple: { status: "accepted", count: 1, pending: true, awaitingDevice: true } } }] }),
    from: table => queryFor(state => {
      if (state.update) { updates.push(state.update); return {}; }
      if (table === "wallet_passes") {
        const single = state.filters.some(([method]) => method === "maybeSingle");
        const data = { provider: "apple", updated_at: single && mode === "replacement-during-push" ? later : timestamp, apple_last_served_update: mode.includes("served") || (!single && mode === "replacement-during-push") ? timestamp : null };
        return { data: single ? data : [data] };
      }
      if (table === "wallet_apple_registrations") return { data: [{ push_token: "a".repeat(64) }, ...(mode === "multiple-served" ? [{ push_token: "b".repeat(64) }] : [])] };
      if (table === "loyalty_cards") return { data: { card_code: member.card.cardCode } };
      return { data: null };
    }),
  };
  const worker = load("lib/wallet/index.ts", { ...baseStubs, "./apple": { pushAppleDevice: async () => { pushed++; } }, "./google": {}, "@/lib/supabase/admin": { createAdminClient: () => db } });
  if (mode === "immediate") {
    const result = await worker.syncWalletCardByCode(member.card.cardCode);
    assert.equal(result.apple.status, "accepted"); assert.equal(result.apple.awaitingDevice, true); assert.equal(updates.length, 0, "APNs acceptance must not mark a card update delivered");
  } else {
    await worker.retryWalletNotificationJobs(1);
    assert.equal(updates[0].status, mode === "served" ? "sent" : mode === "exhausted" ? "failed" : "pending");
    if (mode === "exhausted") assert.equal(updates[0].last_error, "apple_update_not_confirmed");
  }
  assert.equal(pushed, mode === "multiple-served" ? 2 : 1, `${mode}: every worker attempt pushes the currently registered device`);
}

let googleUpdates = 0;
const googleMember = { ...member, program: { ...member.program, appleWalletEnabled: false, googleWalletEnabled: true }, card: { ...member.card, stampsInCycle: 4 } };
const googleWorker = load("lib/wallet/index.ts", { ...baseStubs,
  "./config": { getWalletReadiness: () => ({ apple: false, google: true }) },
  "@/lib/data/loyalty-experience": { loadWalletMemberByCode: async () => googleMember },
  "./google": { updateGooglePass: async (current, notify) => { googleUpdates++; assert.equal(current.card.stampsInCycle, 4); assert.equal(notify, false, "Refresh current data without repeating a previously accepted notification"); } },
  "@/lib/supabase/admin": { createAdminClient: () => ({
    rpc: async () => ({ data: [{ id: "coalesced", kind: "sync", cafe_id: member.card.cafeId, card_id: member.card.id, attempts: 2, delivery_state: { google: { status: "accepted", count: 1 } } }] }),
    from: table => queryFor(state => {
      if (state.update) return {};
      return { data: table === "wallet_passes" ? [{ provider: "google" }] : { card_code: member.card.cardCode } };
    }),
  }) },
});
await googleWorker.retryWalletNotificationJobs(1);
assert.equal(googleUpdates, 1, "Coalesced new card state must be sent even when the prior Google attempt was accepted");

let download;
const issue = load("lib/wallet/index.ts", { ...baseStubs, "./google": {}, "@/lib/supabase/admin": { createAdminClient: () => ({
  from: () => queryFor(() => ({})), rpc: async (name, args) => { download = { name, args }; return {}; },
}) } });
await issue.issueApplePass(member);
assert.deepEqual(download, { name: "record_wallet_download", args: { p_card_id: member.card.id, p_provider: "apple" } });
const cafeId = "11111111-1111-4111-8111-111111111111";
const cardIds = Array.from({ length: 5 }, (_, i) => `22222222-2222-4222-8222-${String(i + 1).padStart(12, "0")}`);
const claims = [];
const emptyWorker = load("lib/wallet/index.ts", { ...baseStubs, "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name, args) => { claims.push({ name, args }); return { data: [] }; } }) } });
assert.deepEqual(await emptyWorker.retryWalletNotificationJobs(10, []), { processed: 0 });
assert.equal(claims.length, 0, "empty scope must never fall back to a global claim");
await emptyWorker.retryWalletNotificationJobs(100, [cardIds[0], cardIds[0], cardIds[1]]);
assert.deepEqual(claims.pop(), { name: "claim_wallet_notification_jobs_for_cards", args: { p_card_ids: cardIds.slice(0, 2), p_limit: 5 } });
await emptyWorker.retryWalletNotificationJobs(100);
assert.deepEqual(claims.pop(), { name: "claim_wallet_notification_jobs", args: { p_limit: 25 } });
for (const invalid of [["invalid"], Array(101).fill(cardIds[0])]) await assert.rejects(emptyWorker.retryWalletNotificationJobs(5, invalid), /wallet_invalid_card_scope/);
await assert.rejects(emptyWorker.retryWalletNotificationJobs(NaN), /wallet_invalid_queue_limit/);
assert.equal(claims.length, 0);

let activeUpdates = 0, maxUpdates = 0;
const finished = [];
const scopedWorker = load("lib/wallet/index.ts", { ...baseStubs,
  "./config": { getWalletReadiness: () => ({ apple: false, google: true }) },
  "./google": { updateGooglePass: async current => {
    activeUpdates++; maxUpdates = Math.max(maxUpdates, activeUpdates);
    await new Promise(resolve => setImmediate(resolve)); activeUpdates--;
    if (current.card.id === cardIds[1]) throw new Error("google_wallet_update_429");
  } },
  "@/lib/data/loyalty-experience": { loadWalletMemberByCode: async code => ({ ...googleMember, card: { ...googleMember.card, id: code, cafeId } }) },
  "@/lib/supabase/admin": { createAdminClient: () => ({
    rpc: async () => ({ data: cardIds.map(id => ({ id, kind: "sync", cafe_id: cafeId, card_id: id, attempts: 5 })) }),
    from: table => queryFor(state => {
      if (state.update) { finished.push({ id: state.filters.find(([method, field]) => method === "eq" && field === "id")?.[2], ...state.update }); return {}; }
      return { data: table === "wallet_passes" ? [{ provider: "google" }] : { card_code: state.filters.find(([method, field]) => method === "eq" && field === "id")?.[2] } };
    }),
  }) },
});
assert.deepEqual(await scopedWorker.retryWalletNotificationJobs(5, cardIds), { processed: 5 });
assert.equal(maxUpdates, 4, "provider concurrency is bounded to four jobs");
assert.equal(finished.filter(job => job.status === "sent").length, 4);
assert.equal(finished.find(job => job.id === cardIds[1]).status, "failed");
assert.equal(finished.find(job => job.id === cardIds[1]).delivery_state.google.retryAfterSeconds, 86400, "quota retry semantics are preserved");
const mismatchedWorker = load("lib/wallet/index.ts", { ...baseStubs, "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async () => ({ data: [{ kind: "sync", card_id: cardIds[1] }] }) }) } });
await assert.rejects(mismatchedWorker.retryWalletNotificationJobs(1, [cardIds[0]]), /wallet_queue_scope_mismatch/);

const originalFetch = globalThis.fetch;
const originalApproval = process.env.GOOGLE_WALLET_PUBLISHING_APPROVED;
try {
  process.env.GOOGLE_WALLET_PUBLISHING_APPROVED = "true";
  const identity = { cafeId, cardId: cardIds[0] };
  const payload = load("lib/wallet/payload.ts", { "@/lib/loyalty/secure-qr-payload": {} });
  const config = { issuerId: "123456789", email: "test@test.iam.gserviceaccount.com", key: "isolated-test-key", baseUrl: "https://wallet.example.test" };
  const googleStubs = { "node:crypto": { ...dependency("node:crypto"), sign: () => Buffer.from("test-signature") }, "./config": { googleConfig: () => config }, "./payload": payload, "./art": {} };
  for (const scenario of [true, false, "missing", "wrong-type", "404", "401", "429", "500", "network", "invalid-json"]) {
    const requests = [];
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      if (String(url).includes("oauth2")) return Response.json({ access_token: "isolated-test-token", expires_in: 3600 });
      if (scenario === "network") throw new Error("network_unavailable");
      if (scenario === "invalid-json") return new Response("not json");
      if (["404", "401", "429", "500"].includes(scenario)) return new Response(null, { status: Number(scenario) });
      return Response.json(scenario === "missing" ? {} : { hasUsers: scenario === "wrong-type" ? "false" : scenario });
    };
    const google = load("lib/wallet/google.ts", googleStubs);
    if (typeof scenario === "boolean" || scenario === "404") assert.equal(await google.getGoogleWalletSaveState(identity), scenario === true);
    else await assert.rejects(google.getGoogleWalletSaveState(identity));
    assert.equal(requests[1].options.method, "GET");
    assert.equal(requests[1].options.cache, "no-store");
    assert.equal(requests[1].url, `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${payload.googleObjectId(config.issuerId, { card: { id: identity.cardId, cafeId } })}`);
    assert.equal(requests.length, 2, "save-state probe never modifies a wallet object");
  }
  let unexpectedFetches = 0;
  globalThis.fetch = async () => { unexpectedFetches++; throw new Error("unexpected_fetch"); };
  const google = load("lib/wallet/google.ts", googleStubs);
  await assert.rejects(google.getGoogleWalletSaveState({ ...identity, cardId: "invalid" }), /wallet_invalid_card_scope/);
  process.env.GOOGLE_WALLET_PUBLISHING_APPROVED = "false";
  await assert.rejects(google.getGoogleWalletSaveState(identity), /wallet_not_configured/);
  const unavailableGoogle = load("lib/wallet/google.ts", { ...googleStubs, "./config": { googleConfig: () => { throw new Error("wallet_not_configured"); } } });
  await assert.rejects(unavailableGoogle.getGoogleWalletSaveState(identity), /wallet_not_configured/);
  assert.equal(unexpectedFetches, 0);
} finally {
  globalThis.fetch = originalFetch;
  if (originalApproval === undefined) delete process.env.GOOGLE_WALLET_PUBLISHING_APPROVED;
  else process.env.GOOGLE_WALLET_PUBLISHING_APPROVED = originalApproval;
}
console.log("PASS: Wallet update tags, authenticated version ordering, APNs retries, scoped claims, bounded concurrency, provider semantics and read-only Google saved-state true/false/404/unknown/error checks");
