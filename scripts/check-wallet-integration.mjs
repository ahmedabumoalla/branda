import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash, generateKeyPairSync, verify } from "node:crypto";
import ts from "typescript";
import forge from "node-forge";

const requireDependency = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  cache.set(file, exports);
  new Function("require", "exports", output)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === "server-only") return {};
    if (name.startsWith("@/") || name.startsWith(".")) return load(`${name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name)}.ts`, stubs, cache);
    return requireDependency(name);
  }, exports);
  return exports;
}

const member = {
  cafeSlug: "rast", cafeName: "Rast", logoUrl: "/menu-logos/rast-wordmark-transparent-v2.png",
  card: { id: "11111111-1111-4111-8111-111111111111", cafeId: "22222222-2222-4222-8222-222222222222", cardCode: "RAST-1234", customerName: "Private member", customerPhone: "Private phone", customerEmail: "private@example.test", stampsInCycle: 3, availableRewards: 1, updatedAt: "2026-10-03T00:00:00.123Z" },
  program: { enabled: true, appleWalletEnabled: true, googleWalletEnabled: true, cardTitle: "Rast loyalty", rewardName: "Coffee", stampLabel: "Stamps", purchasesRequired: 7, terms: "Terms", cardBackground: "#52212b", cardForeground: "#fff8eb", cardAccent: "#d8b67a", cardDesign: null },
  experience: { rewardValidityDays: 30, nearbyMessage: "Welcome to Rast", latitude: 18.2, longitude: 42.5, offerTitle: "New offer", offerBody: "Coffee invitation" },
};

function configureTestCertificates() {
  const issuerKeys = forge.pki.rsa.generateKeyPair(1024);
  const issuer = forge.pki.createCertificate();
  issuer.publicKey = issuerKeys.publicKey;
  issuer.serialNumber = "01";
  issuer.validity.notBefore = new Date(Date.now() - 60000);
  issuer.validity.notAfter = new Date(Date.now() + 86400000);
  issuer.setSubject([{ name: "commonName", value: "Test WWDR" }]);
  issuer.setIssuer(issuer.subject.attributes);
  issuer.setExtensions([{ name: "basicConstraints", cA: true }]);
  issuer.sign(issuerKeys.privateKey, forge.md.sha256.create());
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "02";
  cert.validity.notBefore = issuer.validity.notBefore;
  cert.validity.notAfter = issuer.validity.notAfter;
  cert.setSubject([{ name: "commonName", value: "Pass Type ID: pass.com.test.rast" }, { name: "organizationalUnitName", value: "TESTTEAM" }]);
  cert.setIssuer(issuer.subject.attributes);
  cert.sign(issuerKeys.privateKey, forge.md.sha256.create());
  process.env.APPLE_WALLET_SIGNER_CERT_PEM = forge.pki.certificateToPem(cert);
  process.env.APPLE_WALLET_SIGNER_KEY_PEM = forge.pki.privateKeyToPem(keys.privateKey);
  process.env.APPLE_WALLET_WWDR_CERT_PEM = forge.pki.certificateToPem(issuer);
  process.env.APPLE_WALLET_PASS_TYPE_ID = "pass.com.test.rast";
  process.env.APPLE_WALLET_TEAM_ID = "TESTTEAM";
  return forge.pki.publicKeyToPem(keys.publicKey);
}

function unpackStoredZip(buffer) {
  const entries = {};
  for (let index = 0; buffer.readUInt32LE(index) === 0x04034b50;) {
    assert.equal(buffer.readUInt16LE(index + 8), 0);
    const length = buffer.readUInt32LE(index + 18);
    const nameLength = buffer.readUInt16LE(index + 26);
    const extraLength = buffer.readUInt16LE(index + 28);
    const offset = index + 30 + nameLength + extraLength;
    entries[buffer.subarray(index + 30, index + 30 + nameLength).toString()] = buffer.subarray(offset, offset + length);
    index = offset + length;
  }
  return entries;
}

const originalFetch = globalThis.fetch;
const originalEnvironment = { ...process.env };
try {
  for (const key of Object.keys(process.env)) if (key.startsWith("APPLE_WALLET_") || key.startsWith("GOOGLE_WALLET_") || key.startsWith("WALLET_")) delete process.env[key];
  const config = load("lib/wallet/config.ts");
  assert.deepEqual(config.getWalletReadiness(), { apple: false, google: false });
  process.env.WALLET_PUBLIC_BASE_URL = "https://example.test";
  process.env.WALLET_AUTH_SECRET = "test-secret-for-purpose-separation-32-characters";
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.GOOGLE_WALLET_ISSUER_ID = "123456789";
  process.env.GOOGLE_WALLET_PUBLISHING_APPROVED = "true";
  process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL = "wallet@test.iam.gserviceaccount.com";
  process.env.GOOGLE_WALLET_PRIVATE_KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const applePublicKey = configureTestCertificates();
  assert.deepEqual(config.getWalletReadiness(), { apple: true, google: true });
  const payload = load("lib/wallet/payload.ts");
  const cls = payload.buildGoogleClass(member, "123456789", "https://example.test");
  const object = payload.buildGoogleObject(member, "123456789");
  assert.equal(object.loyaltyPoints.balance.string, "3 / 7");
  assert.deepEqual(cls.merchantLocations, [{ latitude: 18.2, longitude: 42.5 }]);
  assert.deepEqual(payload.walletLocations({ ...member, experience: { ...member.experience, latitude: 91 } }), []);
  assert.notEqual(payload.googleClassId("123456789", member.card.cafeId), payload.googleClassId("123456789", member.card.id));
  for (const sensitive of [member.card.customerPhone, member.card.customerEmail, member.card.customerName]) assert(!JSON.stringify({ cls, object }).includes(sensitive));
  const apple = load("lib/wallet/apple.ts");
  assert(!apple.verifyAppleAuth(new Request("https://example.test"), "pass.com.test.rast", member.card.cardCode));
  const validRequest = new Request("https://example.test", { headers: { authorization: `ApplePass ${apple.appleAuthToken(member.card.cardCode)}` } });
  assert(apple.verifyAppleAuth(validRequest, "pass.com.test.rast", member.card.cardCode));
  assert(!apple.verifyAppleAuth(validRequest, "pass.com.foreign.rast", member.card.cardCode));
  assert(!apple.verifyAppleAuth(validRequest, "pass.com.test.rast", "OTHER-CARD"));
  const art = load("lib/wallet/art.ts");
  assert(art.verifyWalletArtToken(member.card.id, art.walletArtToken(member.card.id)));
  assert(!art.verifyWalletArtToken(member.card.id, apple.appleAuthToken(member.card.cardCode)));
  const entries = unpackStoredZip(await apple.issueApplePass(member));
  const pass = JSON.parse(entries["pass.json"]);
  assert.equal(pass.logoText, member.cafeName, "Native identity remains visible independently of logo artwork");
  const sharp = requireDependency("sharp");
  const tiers = [{ points: 200, reward: "قهوة" }, { points: 500, reward: "قهوة وحلا" }];
  const memberWithPoints = balance => ({ ...member, cafeSlug: "test-cafe", logoUrl: null,
    program: { ...member.program, pointsProgram: { mode: "points", rateSar: 1, rateQuantity: 1, milestones: tiers } },
    card: { ...member.card, availableLoyaltyPoints: balance } });
  let previousStrip;
  for (const [balance, nextName, remaining] of [[0, "قهوة", 200], [211, "قهوة وحلا", 289], [11, "قهوة", 189], [500, undefined, null]]) {
    const pointsMember = memberWithPoints(balance);
    const signed = unpackStoredZip(await apple.issueApplePass(pointsMember));
    const { storeCard, serialNumber } = JSON.parse(signed["pass.json"]);
    assert.equal(serialNumber, member.card.cardCode);
    assert.equal(storeCard.headerFields[0].key, "points");
    assert.equal(storeCard.headerFields[0].value, balance);
    assert.equal(storeCard.secondaryFields.find(field => field.key === "nextReward")?.value, nextName);
    assert.equal(storeCard.secondaryFields.find(field => field.key === "availableReward")?.value, tiers.findLast(tier => tier.points <= balance)?.reward);
    assert.equal(storeCard.auxiliaryFields.find(field => field.key === "pointsRemaining")?.value ?? null, remaining);
    assert.match(storeCard.backFields.find(field => field.key === "rewardPath").value, /قهوة وحلا · 500 نقطة/);
    assert.equal(payload.buildGoogleObject(pointsMember, "123456789").loyaltyPoints.balance.int, balance);
    assert.notDeepEqual(signed["strip.png"], previousStrip, "Affordable stations must light and dim again after redemption");
    previousStrip = signed["strip.png"];
    assert((await sharp(signed["strip@3x.png"]).metadata()).width === 1125);
  }
  const { walletBrandLogo } = load("lib/wallet/logo.ts");
  for (const [background, expected] of [["#151515", 255], ["#ffffff", 0]]) {
    const fallback = { ...member, cafeSlug: "fallback", cafeName: "Fallback brand", logoUrl: null,
      program: { ...member.program, cardBackground: background } };
    const { data, info } = await sharp(await walletBrandLogo(fallback)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let visible = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i + 3] > 200) { visible++; assert(Math.abs(data[i] - expected) <= 3, "Fallback contrasts with background after rasterization"); }
    }
    assert(visible > 100, "Fallback identity must not be transparent");
    const fallbackPass = JSON.parse(unpackStoredZip(await apple.issueApplePass(fallback))["pass.json"]);
    assert.equal(fallbackPass.logoText, fallback.cafeName);
    assert.equal(fallbackPass.serialNumber, member.card.cardCode, "Appearance fix preserves the installed card identity");
  }
  const { branchIdentity, branchProgram } = load("lib/loyalty/branch-appearance.ts");
  const parent = { name: "Parent", logoUrl: member.logoUrl, logoDisplayUrl: member.logoUrl };
  const noLogoBranch = { id: "branch-id", name: "Branch", logo: null, background: "#151515", foreground: "#ffffff", accent: "#ffff00" };
  assert.equal(branchIdentity(parent, noLogoBranch).logoUrl, parent.logoUrl);
  assert.equal(branchProgram({ ...member.program, logoUrl: member.logoUrl }, noLogoBranch).logoUrl, member.logoUrl);
  assert.equal(branchIdentity(parent, { ...noLogoBranch, logo: "/branch.png" }).logoUrl, "/branch.png");
  assert.equal(pass.serialNumber, member.card.cardCode);
  assert.equal(pass.storeCard.headerFields[0].value, "3 / 7");
  assert.equal(pass.locations[0].relevantText, "Welcome to Rast");
  const branchMember = { ...member, branchLocations: [
    { latitude: 24.7, longitude: 46.6, branchName: "North", nearbyMessage: "Welcome North" },
    { latitude: 21.5, longitude: 39.2, branchName: "West" },
  ] };
  const branchPass = JSON.parse(unpackStoredZip(await apple.issueApplePass(branchMember))["pass.json"]);
  assert.deepEqual(branchPass.locations, [
    { latitude: 24.7, longitude: 46.6, relevantText: "Welcome North" },
    { latitude: 21.5, longitude: 39.2, relevantText: "Rast — West" },
  ], "Apple setter must retain all branches in a single call");
  assert.deepEqual(payload.buildGoogleClass(branchMember, "123456789", "https://example.test").merchantLocations,
    [{ latitude: 24.7, longitude: 46.6 }, { latitude: 21.5, longitude: 39.2 }]);
  assert.deepEqual(payload.buildGoogleObject(branchMember, "123456789").merchantLocations,
    [{ latitude: 24.7, longitude: 46.6 }, { latitude: 21.5, longitude: 39.2 }]);
  assert.deepEqual(payload.walletLocations({ ...member, branchLocations: [] }), [], "Closed branches must not resurrect the legacy location");
  assert.equal(pass.storeCard.backFields.find(field => field.key === "offer").value, "New offer\nCoffee invitation");
  assert(entries["strip@2x.png"] && entries["logo.png"]);
  const manifest = JSON.parse(entries["manifest.json"]);
  for (const [name, hash] of Object.entries(manifest)) assert.equal(createHash("sha1").update(entries[name]).digest("hex"), hash);
  const signedData = forge.asn1.fromDer(entries.signature.toString("binary")).value[1].value[0];
  const signerInfo = signedData.value.at(-1).value[0];
  const attributes = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, signerInfo.value[3].value);
  assert(verify("RSA-SHA1", Buffer.from(forge.asn1.toDer(attributes).getBytes(), "binary"), applePublicKey, Buffer.from(signerInfo.value[5].value, "binary")), "Detached PKCS7 signature verifies with native crypto");
  await assert.rejects(apple.issueApplePass({ ...member, logoUrl: "https://127.0.0.1/private" }), /wallet_invalid_asset/);
  await assert.rejects(apple.issueApplePass({ ...member, program: { ...member.program, appleWalletEnabled: false } }), /wallet_disabled/);
  const calls = [];
  const stored = new Map();
  globalThis.fetch = async (url, options) => {
    const uri = String(url); calls.push([uri, options]);
    if (uri.includes("oauth2")) {
      const jwt = options.body.get("assertion").split(".");
      assert(verify("RSA-SHA256", Buffer.from(`${jwt[0]}.${jwt[1]}`), publicKey, Buffer.from(jwt[2], "base64url")));
      return Response.json({ access_token: "mock-token", expires_in: 3600 });
    }
    const body = options.body ? JSON.parse(options.body) : null;
    if (options.method === "POST" && uri.endsWith("/addMessage")) { const base = uri.replace(/\/addMessage$/, ""); stored.get(base).messages.push(body.message); return Response.json({}); }
    if (options.method === "POST") { stored.set(`${uri}/${body.id}`, { ...body, messages: [] }); return Response.json(body); }
    if (options.method === "PATCH") { if (!stored.has(uri)) return new Response(null, { status: 404 }); Object.assign(stored.get(uri), body); return Response.json(body); }
    return stored.has(uri) ? Response.json(stored.get(uri)) : new Response(null, { status: 404 });
  };
  const google = load("lib/wallet/google.ts");
  process.env.GOOGLE_WALLET_PUBLISHING_APPROVED = "false";
  const callsBeforeApprovalCheck = calls.length;
  await assert.rejects(google.issueGoogleSaveUrl(member), /wallet_not_configured/);
  assert.equal(calls.length, callsBeforeApprovalCheck);
  process.env.GOOGLE_WALLET_PUBLISHING_APPROVED = "true";
  const save = await google.issueGoogleSaveUrl(member);
  assert(save.startsWith("https://pay.google.com/gp/v/save/"));
  const savedJwt = save.split("/save/")[1].split(".");
  assert(verify("RSA-SHA256", Buffer.from(`${savedJwt[0]}.${savedJwt[1]}`), publicKey, Buffer.from(savedJwt[2], "base64url")));
  assert(!Buffer.from(savedJwt[1], "base64url").toString().includes("private@example.test"));
  await google.updateGooglePass({ ...member, card: { ...member.card, stampsInCycle: 4 } });
  let previousArt;
  for (const [balance, status] of [[211, "متاحة للاستبدال"], [11, "باقي 189 نقطة"]]) {
    const customer = memberWithPoints(balance);
    await google.updateGooglePass(customer);
    const [url, options] = calls.at(-1);
    assert(url.endsWith("/loyaltyObject/" + payload.googleObjectId(process.env.GOOGLE_WALLET_ISSUER_ID, customer)));
    assert.equal(options.method, "PATCH");
    const updated = stored.get(url);
    assert.equal(updated.loyaltyPoints.balance.int, balance);
    assert.equal(updated.loyaltyPoints.balance.string, null, "PATCH clears the old stamp string");
    assert.equal(updated.secondaryLoyaltyPoints.balance.int, null, "PATCH clears the old integer reward count");
    assert(updated.textModulesData[0].body.includes("قهوة · 200 نقطة · " + status));
    assert(updated.textModulesData[0].body.includes(`باقي ${500 - balance} نقطة`));
    const artUri = updated.heroImage.sourceUri.uri;
    assert.notEqual(artUri, previousArt, "The same Google loyalty object fetches fresh artwork after spending points");
    previousArt = artUri;
  }
  const switched = memberWithPoints(11);
  switched.program.pointsProgram.mode = "stamps";
  await google.updateGooglePass(switched);
  const stampPatch = JSON.parse(calls.at(-1)[1].body);
  assert.equal(stampPatch.loyaltyPoints.balance.int, null);
  assert.equal(stampPatch.secondaryLoyaltyPoints.balance.string, null);
  assert.deepEqual(stored.get(calls.at(-1)[0]).textModulesData, [], "Switching to stamps clears obsolete points availability");
  const patches = calls.filter(([, request]) => request.method === "PATCH");
  assert(patches.length >= 2);
  assert(patches.every(([url, request]) => url.includes("/loyaltyClass/") ? JSON.parse(request.body).reviewStatus === "UNDER_REVIEW" : !JSON.parse(request.body).reviewStatus));
  await google.notifyGoogleBrand(member.card.cafeId, "Offer", "Coffee", "job-one");
  await google.notifyGoogleBrand(member.card.cafeId, "Offer", "Coffee", "job-one");
  assert.equal(calls.filter(([url]) => url.endsWith("/addMessage")).length, 1, "Retry reads existing ID to avoid repeat notifications");
  globalThis.fetch = async () => new Response(null, { status: 403 });
  await assert.rejects(google.issueGoogleSaveUrl(member), /google_wallet_update_403/);
  let snapshotReads = 0;
  const databaseFilters = [];
  let registered = false;
  const database = { from(table) {
    const query = {
      select() { return query; }, eq(key, value) { databaseFilters.push([table, key, value]); return query; },
      in(key, value) { databaseFilters.push([table, key, value]); return query; }, gt(key, value) { databaseFilters.push([table, key, value]); return query; },
      order() { return query; }, limit() { return query; }, insert() { return query; },
      upsert() { if (table === "wallet_apple_registrations") registered = true; return query; }, delete() { return query; },
      maybeSingle() { return Promise.resolve({ data: table === "wallet_apple_registrations" && registered ? { card_id: member.card.id } : null, error: null }); },
      then(resolve, reject) {
        const data = table === "wallet_apple_registrations" ? [{ card_id: member.card.id }] : table === "wallet_passes" ? [{ card_id: member.card.id, updated_at: "2026-10-03T00:00:00.123456+00:00" }] : [{ card_code: member.card.cardCode }];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
  const service = load("lib/wallet/webservice.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => database },
    "@/lib/data/loyalty-experience": { loadWalletMemberByCode: async () => { snapshotReads++; return member; } },
  });
  const registerRequest = () => new Request("https://example.test", { method: "POST", headers: { authorization: `ApplePass ${apple.appleAuthToken(member.card.cardCode)}`, "content-type": "application/json" }, body: JSON.stringify({ pushToken: "a".repeat(64) }) });
  const deviceId = "device-library-one-123456789";
  assert.equal((await service.registerAppleDevice(new Request("https://example.test"), deviceId, "pass.com.test.rast", member.card.cardCode)).status, 401);
  assert.equal(snapshotReads, 0, "Pass authorization must precede privileged snapshot reads");
  assert.equal((await service.registerAppleDevice(registerRequest(), deviceId, "pass.com.test.rast", member.card.cardCode)).status, 201);
  assert.equal((await service.registerAppleDevice(registerRequest(), deviceId, "pass.com.test.rast", member.card.cardCode)).status, 200);
  await service.unregisterAppleDevice(validRequest, deviceId, "pass.com.test.rast", member.card.cardCode);
  assert(databaseFilters.some(([table, key, value]) => table === "wallet_apple_registrations" && key === "card_id" && value === member.card.id));
  const cursor = "2026-10-03T00:00:00.123455+00:00";
  const updateList = await service.listAppleUpdates(new Request(`https://example.test?passesUpdatedSince=${encodeURIComponent(cursor)}`), deviceId, "pass.com.test.rast");
  assert.deepEqual(await updateList.json(), { serialNumbers: [member.card.cardCode], lastUpdated: "1790985600123456" });
  assert(databaseFilters.some(([table, key, value]) => table === "wallet_passes" && key === "updated_at" && value === "2026-10-03T00:00:00.123455Z"), "Microsecond update cursor must survive without Date truncation");
  assert.equal((await service.downloadUpdatedApplePass(new Request("https://example.test"), "pass.com.test.rast", member.card.cardCode)).status, 401);
  const cron = load("app/api/wallet/jobs/route.ts", {
    "@/lib/wallet": { retryWalletNotificationJobs: async () => ({ processed: 3 }) },
    "@/lib/wallet/welcome": { dispatchWalletWelcomes: async () => ({ processed: 0 }) },
  });
  delete process.env.CRON_SECRET;
  assert.equal((await cron.GET(new Request("https://example.test"))).status, 401);
  process.env.CRON_SECRET = "cron-secret-32-characters-or-more-test";
  assert.equal((await cron.GET(new Request("https://example.test", { headers: { authorization: "Bearer wrong" } }))).status, 401);
  const cronResult = await (await cron.GET(new Request("https://example.test", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }))).json();
  assert.equal(cronResult.processed, 3);
  assert.deepEqual(cronResult.welcomes, { processed: 0 });
  assert.equal(cronResult.birthdays.deferred, true);
  console.log("Wallet integration passed: native signatures, branding/stamps, isolation, disabled/invalid credentials, Google upsert/retry, cron authorization; no live provider calls.");
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
}
