import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash, generateKeyPairSync } from "node:crypto";
import { performance } from "node:perf_hooks";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
function load(file, stubs = {}, modules = new Map()) {
  if (modules.has(file)) return modules.get(file);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {}; modules.set(file, exports);
  new Function("require", "exports", output)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === "server-only") return {};
    if (name.startsWith("@/") || name.startsWith(".")) return load(`${name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name)}.ts`, stubs, modules);
    return dependency(name);
  }, exports);
  return exports;
}
const { createWalletArtifactCache } = load("lib/wallet/artifact-cache.ts");
let now = Date.now();
const originalNow = Date.now;
Date.now = () => now;
let checks = 0;
try {
  const cache = createWalletArtifactCache(8, 2, 100);
  let loads = 0;
  const get = key => cache(key, async () => { loads++; await Promise.resolve(); return Buffer.from("1234"); });
  await Promise.all(Array.from({ length: 12 }, () => get("same")));
  assert.equal(loads, 1); checks++;
  await get("same"); assert.equal(loads, 1); checks++;
  await get("b"); await get("same"); await get("c"); await get("b");
  assert.equal(loads, 4, "byte/entry bound evicts the least recently used buffer"); checks++;
  now += 101; await get("b"); assert.equal(loads, 5); checks++;
  await assert.rejects(cache("failure", async () => { throw Error("test failure"); }));
  assert.equal((await cache("failure", async () => Buffer.from("ok"))).toString(), "ok"); checks++;
  let oversize = 0;
  await cache("large", async () => { oversize++; return Buffer.alloc(9); });
  await cache("large", async () => { oversize++; return Buffer.alloc(9); });
  assert.equal(oversize, 2); checks++;
} finally { Date.now = originalNow; }

const key = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ format: "pem", type: "pkcs8" });
const config = { issuerId: "12345", email: "fixture@test.iam.gserviceaccount.com", key, baseUrl: "https://wallet.example.test" };
const member = {
  cafeSlug: "fixture", cafeName: "Fixture", logoUrl: null,
  card: { id: "11111111-1111-4111-8111-111111111111", cafeId: "22222222-2222-4222-8222-222222222222", cardCode: "TEST_CARD", stampsInCycle: 3, availableRewards: 1, updatedAt: "2026-11-11T00:00:00Z" },
  program: { enabled: true, googleWalletEnabled: true, appleWalletEnabled: true, stampStyle: "cup", purchasesRequired: 6, cardTitle: "Fixture card", stampLabel: "Stamps", rewardName: "Reward", terms: "Terms", cardBackground: "#123456", cardForeground: "#ffffff", cardAccent: "#abcdef" },
  experience: { nearbyMessage: "Welcome", rewardValidityDays: 30, latitude: null, longitude: null },
};
const savedFetch = globalThis.fetch;
const priorApproval = process.env.GOOGLE_WALLET_PUBLISHING_APPROVED;
process.env.GOOGLE_WALLET_PUBLISHING_APPROVED = "true";
const calls = [];
let existing = true, classFailure = false, conflict = false, rateLimit = false;
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), method: options.method, body: options.body instanceof URLSearchParams ? null : JSON.parse(options.body ?? "null") });
  await new Promise(resolve => setTimeout(resolve, 2));
  if (String(url).includes("oauth2")) return Response.json({ access_token: "fixture-only", expires_in: 3600 });
  if (classFailure && String(url).includes("loyaltyClass/")) return new Response(null, { status: 503 });
  if (rateLimit && calls.at(-1).body?.notifyPreference) return new Response(null, { status: 429 });
  if (!existing && options.method === "PATCH") return new Response(null, { status: 404 });
  if (options.method === "POST") { existing = true; return new Response(null, { status: conflict ? 409 : 200 }); }
  return Response.json({});
};
const stubs = { "./config": { googleConfig: () => config }, "./art": { walletArtUrl: value => `https://wallet.example.test/art/${value.card.id}?stamps=${value.card.stampsInCycle}` } };
try {
  const google = load("lib/wallet/google.ts", stubs);
  await google.issueGoogleSaveUrl(member);
  assert.equal(calls.length, 3, "cold existing wallet uses token + two PATCH requests"); checks++;
  calls.length = 0;
  await google.issueGoogleSaveUrl(member);
  assert.equal(calls.length, 1); assert.equal(calls[0].method, "PATCH"); assert(calls[0].url.includes("loyaltyObject/")); checks++;
  await google.issueGoogleSaveUrl({ ...member, card: { ...member.card, stampsInCycle: 4 } });
  assert.equal(calls.at(-1).body.loyaltyPoints.balance.string, "4 / 6", "balances are always freshly written"); checks++;
  calls.length = 0;
  await google.issueGoogleSaveUrl({ ...member, cafeName: "Changed" });
  await google.issueGoogleSaveUrl(member);
  assert.equal(calls.filter(call => call.url.includes("loyaltyClass/")).length, 2, "A-B-A branding cannot reuse an obsolete class success"); checks++;
  calls.length = 0; now = originalNow() + 61_000; Date.now = () => now;
  try { await google.issueGoogleSaveUrl(member); }
  finally { Date.now = originalNow; }
  assert.equal(calls.filter(call => call.url.includes("loyaltyClass/")).length, 1, "expired class confirmation is revalidated"); checks++;
  calls.length = 0;
  const concurrent = load("lib/wallet/google.ts", stubs);
  await Promise.all(Array.from({ length: 6 }, (_, index) => concurrent.issueGoogleSaveUrl({ ...member, card: { ...member.card, id: `${index}1111111-1111-4111-8111-111111111111` } })));
  assert.equal(calls.filter(call => call.url.includes("oauth2")).length, 1); checks++;
  assert.equal(calls.filter(call => call.url.includes("loyaltyClass/")).length, 1); checks++;
  assert.equal(calls.filter(call => call.url.includes("loyaltyObject/")).length, 6); checks++;
  calls.length = 0; classFailure = true;
  await assert.rejects(google.issueGoogleSaveUrl({ ...member, cafeName: "Retry" }), /google_wallet_update_503/);
  classFailure = false;
  await google.issueGoogleSaveUrl({ ...member, cafeName: "Retry" });
  assert.equal(calls.filter(call => call.url.includes("loyaltyClass/")).length, 2); checks++;
  calls.length = 0; existing = false; conflict = true;
  await google.issueGoogleSaveUrl({ ...member, cafeName: "Race" });
  assert.deepEqual(calls.filter(call => call.url.includes("loyaltyClass")).map(call => call.method), ["PATCH", "POST", "PATCH"]); checks++;
  calls.length = 0; rateLimit = true;
  await google.updateGooglePass(member, true);
  const objectWrites = calls.filter(call => call.url.includes("loyaltyObject/"));
  assert.equal(objectWrites.length, 2); assert.equal(objectWrites[1].body.notifyPreference, undefined); checks++;
  calls.length = 0;
  await assert.rejects(google.issueGoogleSaveUrl({ ...member, program: { ...member.program, enabled: false } }), /wallet_disabled/);
  assert.equal(calls.length, 0); checks++;
} finally {
  globalThis.fetch = savedFetch;
  if (priorApproval === undefined) delete process.env.GOOGLE_WALLET_PUBLISHING_APPROVED; else process.env.GOOGLE_WALLET_PUBLISHING_APPROVED = priorApproval;
}

const art = load("lib/wallet/art.ts");
const times = [];
let first;
for (let index = 0; index < 21; index++) {
  const start = performance.now();
  const image = await art.walletStampArtwork(member, 3, true);
  times.push(performance.now() - start);
  if (!first) first = image; else assert.equal(image, first);
}
checks++;
const changed = await art.walletStampArtwork({ ...member, card: { ...member.card, stampsInCycle: 4 } }, 3, true);
assert.notDeepEqual(changed, first); checks++;
const palette = await art.walletStampArtwork({ ...member, program: { ...member.program, cardBackground: "#654321" } }, 3, true);
assert.notDeepEqual(palette, first); checks++;
const warm = times.slice(1).sort((a, b) => a - b);
const previousWindow = globalThis.window, previousDocument = globalThis.document;
const windowEvents = new Map(), documentEvents = new Map();
let refreshes = 0, timer, effect, timerCleared = false, manualTransitions = 0;
let initialBalanceRef = { current: false };
const router = { refresh: () => refreshes++ };
globalThis.window = { addEventListener: (name, cb) => windowEvents.set(name, cb), removeEventListener: name => windowEvents.delete(name), setInterval: cb => { timer = cb; return 1; }, clearInterval: () => { timerCleared = true; } };
globalThis.document = { visibilityState: "visible", addEventListener: (name, cb) => documentEvents.set(name, cb), removeEventListener: name => documentEvents.delete(name) };
now = 100_000; Date.now = () => now;
try {
  const component = load("components/rast-loyalty/rast-member-card.tsx", {
    react: { useRef: () => initialBalanceRef, useState: value => [value, () => {}], useTransition: () => [false, cb => { manualTransitions++; cb(); }], useEffect: cb => { effect = cb; } },
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null },
    "next/navigation": { useRouter: () => router }, "lucide-react": {}, "./rast-brand": {}, "./rast-stamp-card": {}, "./wallet-download-link": {}, "./qr-code": {}, "./rast-loyalty.module.css": {}, "./loyalty-theme": { loyaltyTheme: () => ({}), loyaltyCommunityName: () => "Fixture" },
  });
  const props = { identity: { slug: "fixture" }, member: { ...member, rewards: [] }, walletAvailability: { apple: true, google: true } };
  component.RastMemberCard({ ...props, loadedAt: now });
  const stop = effect();
  assert.equal(refreshes, 0, "a fresh server render does not immediately refetch"); checks++;
  now += 6000; windowEvents.get("focus")(); documentEvents.get("visibilitychange")();
  assert.equal(refreshes, 1, "focus and visibility events coalesce"); checks++;
  now += 30000; document.visibilityState = "hidden"; timer();
  assert.equal(refreshes, 1, "hidden pages do not poll"); checks++;
  document.visibilityState = "visible"; documentEvents.get("visibilitychange")();
  assert.equal(refreshes, 2); checks++;
  stop(); assert.equal(windowEvents.size + documentEvents.size, 0); assert(timerCleared); checks++;
  initialBalanceRef = { current: false }; // A newly mounted cached page.
  component.RastMemberCard({ ...props, loadedAt: now - 10000 });
  const stopCached = effect(); assert.equal(refreshes, 3, "returning to an old cached membership reconciles immediately"); checks++;
  stopCached();
  // Preserve hook state across refreshed server props with an ahead-of-server clock.
  for (let index = 0; index < 3; index++) {
    component.RastMemberCard({ ...props, loadedAt: now - 60000 + index });
    const stopUpdated = effect();
    assert.equal(refreshes, 3, "server updates must not start an immediate refresh loop"); checks++;
    if (index === 2) { now += 30000; timer(); assert.equal(refreshes, 4, "scheduled reconciliation remains active"); checks++; }
    stopUpdated();
  }
  assert.equal(manualTransitions, 0, "background reconciliation never starts the manual spinner"); checks++;
} finally { Date.now = originalNow; globalThis.window = previousWindow; globalThis.document = previousDocument; }
const inputFiles = ["lib/wallet/artifact-cache.ts", "lib/wallet/art.ts", "lib/wallet/apple.ts", "lib/wallet/logo.ts", "lib/wallet/google.ts", "lib/wallet/payload.ts", "components/rast-loyalty/rast-member-card.tsx", "app/loyalty/[slug]/page.tsx", "scripts/check-wallet-performance.mjs", "scripts/check-rast-wallet-security.mjs", "scripts/check-wallet-sync.mjs", "package.json", "package-lock.json", "tsconfig.json"];
const inputs = Object.fromEntries(inputFiles.map(file => [file, createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")]));
const result = { at: new Date().toISOString(), runtime: process.version, command: "node scripts/check-wallet-performance.mjs --record", inputs, checks, scope: "isolated real PNG rendering + mocked provider requests; no production sends", artworkMs: { cold: times[0], warmP50: warm[9], warmP95: warm[18], warmP99: warm[19] }, googleExistingCalls: { previousWarm: 4, currentWarm: 1, currentColdIncludingToken: 3 } };
if (process.argv.includes("--record")) { fs.mkdirSync(path.join(root, "output/platform-performance"), { recursive: true }); fs.writeFileSync(path.join(root, "output/platform-performance/wallet.json"), JSON.stringify(result, null, 2)); }
console.log(JSON.stringify({ ...result, inputs: undefined }));
