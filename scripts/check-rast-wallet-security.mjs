import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, verify } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const dependency = createRequire(import.meta.url);
const forge = dependency("node-forge");
const root = fileURLToPath(new URL("..", import.meta.url));
function load(relative, stubs = {}, cache = new Map()) {
  if (cache.has(relative)) return cache.get(relative);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {}; cache.set(relative, exports);
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name === "server-only") return {};
    if (name.startsWith("@/") || name.startsWith(".")) {
      const file = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name);
      return load(`${file}.ts`, stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}
function unzip(buffer) {
  const result = {};
  for (let cursor = 0; buffer.readUInt32LE(cursor) === 0x04034b50;) {
    const compressed = buffer.readUInt32LE(cursor + 18);
    const nameLength = buffer.readUInt16LE(cursor + 26);
    const extraLength = buffer.readUInt16LE(cursor + 28);
    const name = buffer.subarray(cursor + 30, cursor + 30 + nameLength).toString();
    const start = cursor + 30 + nameLength + extraLength;
    const content = buffer.subarray(start, start + compressed);
    result[name] = buffer.readUInt16LE(cursor + 8) === 8 ? inflateRawSync(content) : content;
    cursor = start + compressed;
  }
  return result;
}
const keys = forge.pki.rsa.generateKeyPair(2048);
function cert(subject, issuer, signingKey, ca = false) {
  const value = forge.pki.createCertificate();
  value.publicKey = keys.publicKey;
  value.serialNumber = ca ? "01" : "02";
  value.validity.notBefore = new Date(Date.now() - 86400000);
  value.validity.notAfter = new Date(Date.now() + 86400000 * 30);
  value.setSubject(subject); value.setIssuer(issuer ?? subject);
  value.setExtensions([{ name: "basicConstraints", cA: ca }]);
  value.sign(signingKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(value);
}
const issuer = [{ name: "commonName", value: "Wallet isolated test CA" }];
const identity = [{ name: "commonName", value: "Pass Type ID: pass.com.example.rast" }, { name: "organizationalUnitName", value: "TESTTEAM01" }];
const env = {
  WALLET_PUBLIC_BASE_URL: "https://wallet.example.test", WALLET_AUTH_SECRET: "test-only-wallet-secret-".repeat(3),
  APPLE_WALLET_PASS_TYPE_ID: "pass.com.example.rast", APPLE_WALLET_TEAM_ID: "TESTTEAM01",
  APPLE_WALLET_SIGNER_CERT_PEM: cert(identity, issuer, keys.privateKey), APPLE_WALLET_WWDR_CERT_PEM: cert(issuer, null, keys.privateKey, true),
  APPLE_WALLET_SIGNER_KEY_PEM: forge.pki.privateKeyToPem(keys.privateKey),
  GOOGLE_WALLET_ISSUER_ID: "123456789", GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: "test@test.iam.gserviceaccount.com",
  GOOGLE_WALLET_PRIVATE_KEY_PEM: forge.pki.privateKeyToPem(keys.privateKey), GOOGLE_WALLET_PUBLISHING_APPROVED: "true",
  GOOGLE_WALLET_RAST_CLASS_ID: "",
  CRON_SECRET: "isolated-test-cron-secret-".repeat(3),
};
const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
Object.assign(process.env, env);
const member = {
  cafeSlug: "rast", cafeName: "راست", logoUrl: "/menu-logos/rast-wordmark-transparent-v2.png",
  card: { id: "11111111-1111-4111-8111-111111111111", cafeId: "22222222-2222-4222-8222-222222222222", cardCode: "TEST_CARD_123", customerName: "Private Name", customerPhone: "PRIVATE_PHONE", customerEmail: "PRIVATE_EMAIL", stampsInCycle: 3, availableRewards: 1, updatedAt: new Date().toISOString() },
  program: { enabled: true, appleWalletEnabled: true, googleWalletEnabled: true, purchasesRequired: 7, rewardName: "قهوة من راست", cardTitle: "بطاقة راست", cardSubtitle: "لحظتك تستاهل", stampLabel: "الأختام", terms: "المكافأة للاستخدام مرة واحدة", cardBackground: "#3b1420", cardForeground: "#f8f2e8", cardAccent: "#d8b67a", cardDesign: null },
  experience: { rewardValidityDays: 30, nearbyMessage: "قريب من راست؟ حياك", latitude: 0, longitude: 0, offerTitle: "راست", offerBody: "لحظتك معنا" },
};
const fetchBefore = globalThis.fetch;
try {
  const payload = load("lib/wallet/payload.ts");
  const rastId = "3c697864-d371-4190-87ab-48f183cdf2d5";
  const stableObjectId = payload.googleObjectId(env.GOOGLE_WALLET_ISSUER_ID, { ...member, card: { ...member.card, cafeId: rastId } });
  process.env.GOOGLE_WALLET_RAST_CLASS_ID = `${env.GOOGLE_WALLET_ISSUER_ID}.${env.GOOGLE_WALLET_ISSUER_ID}.rast_prepared`;
  assert.equal(payload.googleClassId(env.GOOGLE_WALLET_ISSUER_ID, rastId), process.env.GOOGLE_WALLET_RAST_CLASS_ID);
  assert.equal(payload.googleObjectId(env.GOOGLE_WALLET_ISSUER_ID, { ...member, card: { ...member.card, cafeId: rastId } }), stableObjectId);
  process.env.GOOGLE_WALLET_RAST_CLASS_ID = "999999.foreign_issuer";
  assert.throws(() => payload.googleClassId(env.GOOGLE_WALLET_ISSUER_ID, rastId), /wallet_invalid_class_id/);
  process.env.GOOGLE_WALLET_RAST_CLASS_ID = "";
  assert.deepEqual(payload.walletLocations(member), [{ latitude: 0, longitude: 0 }]);
  assert.deepEqual(payload.walletLocations({ ...member, experience: { ...member.experience, latitude: 91 } }), []);
  const apple = load("lib/wallet/apple.ts");
  const token = apple.appleAuthToken(member.card.cardCode);
  const request = (authorization) => new Request("https://wallet.example.test", { headers: { authorization } });
  assert(apple.verifyAppleAuth(request(`ApplePass ${token}`), env.APPLE_WALLET_PASS_TYPE_ID, member.card.cardCode));
  assert(!apple.verifyAppleAuth(request(token), env.APPLE_WALLET_PASS_TYPE_ID, member.card.cardCode), "Authorization scheme is required");
  assert(!apple.verifyAppleAuth(request(`ApplePass ${token}`), env.APPLE_WALLET_PASS_TYPE_ID, "OTHER_CARD"));
  const bundle = unzip(await apple.issueApplePass(member));
  const pass = JSON.parse(bundle["pass.json"].toString());
  assert.equal(pass.storeCard.headerFields[0].value, "3 / 7");
  assert.equal(pass.storeCard.auxiliaryFields[0].value, 1);
  assert.equal(pass.storeCard.secondaryFields[0].value, 4);
  assert.equal(pass.storeCard.backFields.find(field => field.key === "reward").value, member.program.rewardName);
  assert.equal(pass.logoText, undefined, "Do not repeat the wordmark in a text field");
  assert.equal(pass.backgroundColor, "rgb(248, 242, 232)");
  assert.equal(pass.foregroundColor, "rgb(59, 20, 32)");
  assert.equal(pass.locations[0].latitude, 0);
  assert.equal(pass.authenticationToken, token);
  assert(pass.webServiceURL.startsWith("https://wallet.example.test/api/wallet/apple"));
  assert(pass.barcodes[0].message.startsWith("BARNDAKSA_QR:v1:"));
  assert(!JSON.stringify(pass).includes("PRIVATE_"));
  assert(!JSON.stringify(pass).includes("Private Name"));
  const sharp = dependency("sharp");
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? "" : `@${scale}x`;
    const strip = await sharp(bundle[`strip${suffix}.png`]).metadata();
    assert.deepEqual([strip.width, strip.height], [375 * scale, 144 * scale]);
    const icon = await sharp(bundle[`icon${suffix}.png`]).metadata();
    assert.deepEqual([icon.width, icon.height], [29 * scale, 29 * scale]);
    const logo = await sharp(bundle[`logo${suffix}.png`]).metadata();
    assert(logo.width <= 160 * scale && logo.height <= 50 * scale);
  }
  const art = load("lib/wallet/art.ts");
  const artUrl = new URL(art.walletArtUrl(member));
  assert(artUrl.searchParams.get("v").startsWith(`${art.WALLET_ART_VERSION}:`), "Artwork has a revision independent of the card balance");
  assert(art.verifyWalletArtToken(member.card.id, artUrl.pathname.split("/").at(-1)), "A design revision preserves existing signed artwork tokens");
  assert.equal(pass.userInfo.artworkVersion, art.WALLET_ART_VERSION);
  const cases = [[1, 0], [7, 0], [7, 2], [7, 7], [14, 4], [30, 15], [100, 70]];
  for (const [required, stamps] of cases) {
    const example = { ...member, program: { ...member.program, purchasesRequired: required }, card: { ...member.card, stampsInCycle: stamps } };
    const svg = art.walletStampSvg(example);
    assert(!svg.includes("<text") && !svg.includes("<image"), "Native fields provide text and the only brand logo is in the header");
    const raster = await sharp(await art.walletStampArtwork(example)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(raster.info.width, 750);
    assert.equal(raster.info.height, 288);
    for (const [x, y] of [[0, 0], [749, 287], [0, 144], [749, 144]]) {
      const pixel = (y * raster.info.width + x) * raster.info.channels;
      assert.deepEqual([...raster.data.subarray(pixel, pixel + 3)], [248, 242, 232], "Artwork keeps its safety gutter on all supported target sizes");
    }
    if (required <= 30) {
      const frames = [...svg.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" rx="[^"]+" fill="([^"]+)"/g)];
      assert.equal(frames.length, required);
      assert.equal(frames.filter(frame => frame[5] === "#3b1420").length, stamps, "Every applied stamp has a filled icon tile");
      for (const frame of frames) {
        const [, x, y, width, height] = frame.map(Number);
        assert(x >= 20 && y >= 10 && x + width <= 355 && y + height <= 134);
      }
      if (required === 7 && stamps === 2) {
        const first = frames[0];
        const second = frames[1];
        assert(Number(first[1]) > Number(second[1]), "Stamp progress reads right to left");
        const last = frames.at(-1);
        const point = frame => (Math.round(Number(frame[2]) * 2 + 10) * raster.info.width + Math.round(Number(frame[1]) * 2 + 16)) * raster.info.channels;
        assert(raster.data[point(first)] < raster.data[point(last)], "Rendered filled and pending stamps remain distinguishable in grayscale");
      }
    } else {
      assert(svg.includes("stroke-dasharray="), "Large targets have a proportional ring, never a false truncated stamp target");
    }
    if (process.env.WALLET_ART_PREVIEW_DIR) {
      fs.mkdirSync(process.env.WALLET_ART_PREVIEW_DIR, { recursive: true });
      fs.writeFileSync(path.join(process.env.WALLET_ART_PREVIEW_DIR, `stamps-${stamps}-of-${required}.png`), await art.walletStampArtwork(example, 3));
    }
  }
  const luminance = hex => {
    const channels = hex.match(/[0-9a-f]{2}/g).map(channel => parseInt(channel, 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  assert((luminance("f8f2e8") + .05) / (luminance("3b1420") + .05) > 7, "Native text and stamp icons meet enhanced contrast");
  const manifest = JSON.parse(bundle["manifest.json"].toString());
  for (const [name, digest] of Object.entries(manifest)) assert.equal(createHash("sha1").update(bundle[name]).digest("hex"), digest);
  const signature = forge.asn1.fromDer(bundle.signature.toString("binary"));
  assert(forge.pkcs7.messageFromAsn1(signature), "Pass includes a parseable PKCS7 signature");
  await assert.rejects(apple.issueApplePass({ ...member, cafeSlug: "other-brand" }), /wallet_disabled/);
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method, body: options.body && JSON.parse(options.body instanceof URLSearchParams ? "{}" : options.body) });
    if (String(url).includes("oauth2.googleapis.com")) return Response.json({ access_token: "isolated-test-token", expires_in: 3600 });
    return options.method === "GET" ? new Response(null, { status: 404 }) : Response.json({});
  };
  const google = load("lib/wallet/google.ts");
  const saveUrl = await google.issueGoogleSaveUrl(member);
  const signed = saveUrl.split("/").at(-1);
  const [header, body, sig] = signed.split(".");
  assert(verify("RSA-SHA256", Buffer.from(`${header}.${body}`), forge.pki.publicKeyToPem(keys.publicKey), Buffer.from(sig, "base64url")));
  const claims = JSON.parse(Buffer.from(body, "base64url"));
  assert.equal(claims.aud, "google"); assert.equal(claims.typ, "savetowallet");
  assert.equal(claims.payload.loyaltyObjects[0].id, payload.googleObjectId(env.GOOGLE_WALLET_ISSUER_ID, member));
  const objectWrite = calls.find((call) => call.url.endsWith("/loyaltyObject") && call.method === "POST");
  assert.equal(objectWrite.body.loyaltyPoints.balance.string, "3 / 7");
  assert.equal(objectWrite.body.secondaryLoyaltyPoints.balance.int, 1);
  assert(!JSON.stringify(calls).includes("PRIVATE_"));
  await assert.rejects(google.issueGoogleSaveUrl({ ...member, cafeSlug: "other-brand" }), /wallet_disabled/);
  const updates = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("loyaltyObject/") && options.method === "PATCH") {
      const body = JSON.parse(options.body); updates.push(body);
      return body.notifyPreference ? new Response(null, { status: 429 }) : Response.json({});
    }
    return Response.json({});
  };
  await google.updateGooglePass(member, true);
  assert.equal(updates.length, 2, "Notification quota must not leave the stamp balance stale");
  assert.equal(updates[0].notifyPreference, "NOTIFY_ON_UPDATE");
  assert.equal(updates[1].notifyPreference, undefined);
  assert.equal(updates[1].loyaltyPoints.balance.string, "3 / 7");
  let classPatch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("loyaltyClass/") && options.method === "GET") return Response.json({ reviewStatus: "DRAFT" });
    if (String(url).includes("loyaltyClass/") && options.method === "PATCH") classPatch = JSON.parse(options.body);
    return Response.json({});
  };
  await google.updateGooglePass(member);
  assert.equal(classPatch.reviewStatus, "UNDER_REVIEW", "Existing console draft is submitted instead of remaining unusable");
  for (const reviewStatus of ["approved", "APPROVED", "underReview"]) {
    let objectWritten = false;
    globalThis.fetch = async (url, options = {}) => {
      const isClass = String(url).includes("loyaltyClass/");
      if (isClass && options.method === "GET") return Response.json({ reviewStatus, messages: [{ id: "keep-existing-message" }] });
      if (isClass && options.method === "PATCH") {
        const patch = JSON.parse(options.body);
        // Google rejects PATCH when the merged class retains its read-only APPROVED state.
        if (patch.reviewStatus !== "UNDER_REVIEW") return Response.json({ error: { message: 'Invalid review status "APPROVED". Use "UNDER_REVIEW" instead.' } }, { status: 400 });
        assert.equal(patch.messages, undefined, "Updating branding must preserve existing messages");
        return Response.json({ reviewStatus: "approved" });
      }
      if (String(url).includes("loyaltyObject/") && options.method === "PATCH") {
        objectWritten = true;
        assert.equal(JSON.parse(options.body).reviewStatus, undefined, "Review status belongs only to classes");
      }
      return Response.json({});
    };
    const result = await google.issueGoogleSaveUrl(member);
    assert(result.startsWith("https://pay.google.com/gp/v/save/"));
    assert(objectWritten, "An approved class must not block object issuance");
  }
  let dbCalled = false;
  const service = load("lib/wallet/webservice.ts", {
    "@/lib/supabase/admin": { createAdminClient() { dbCalled = true; throw new Error("Unauthorized database access"); } },
    "@/lib/data/loyalty-experience": { loadWalletMemberByCode() { dbCalled = true; throw new Error("Unauthorized member access"); } },
  });
  assert.equal((await service.registerAppleDevice(request("ApplePass invalid"), "device", env.APPLE_WALLET_PASS_TYPE_ID, member.card.cardCode)).status, 401);
  assert.equal((await service.downloadUpdatedApplePass(request("ApplePass invalid"), env.APPLE_WALLET_PASS_TYPE_ID, member.card.cardCode)).status, 401);
  assert.equal(dbCalled, false);
  for (const atLimit of [false, true]) {
    let passWrites = 0;
    const registrationService = load("lib/wallet/webservice.ts", {
      "@/lib/data/loyalty-experience": { loadWalletMemberByCode: async () => member },
      "@/lib/supabase/admin": { createAdminClient: () => ({ from(table) {
        const query = {
          select() { return query; }, eq() { return query; },
          maybeSingle: async () => ({ data: atLimit ? null : { card_id: member.card.id }, error: null }),
          upsert: async () => {
            if (table === "wallet_passes") passWrites++;
            return { error: atLimit ? { code: "P0001", message: "Wallet registration limit reached" } : null };
          },
        }; return query;
      } }) },
    });
    const registration = new Request("https://wallet.example.test", {
      method: "POST", headers: { authorization: `ApplePass ${token}` }, body: JSON.stringify({ pushToken: "a".repeat(64) }),
    });
    const response = await registrationService.registerAppleDevice(registration, "registered-device-123", env.APPLE_WALLET_PASS_TYPE_ID, member.card.cardCode);
    assert.equal(response.status, atLimit ? 429 : 200, "The cap rejects new devices while existing device replay remains idempotent");
    assert.equal(passWrites, atLimit ? 0 : 1);
    assert(response.headers.get("cache-control").includes("no-store"));
  }
  let cronCalls = 0;
  const cron = load("app/api/wallet/jobs/route.ts", {
    "@/lib/wallet": { retryWalletNotificationJobs: async (limit) => { cronCalls++; assert.equal(limit, 10); return { processed: 1 }; } },
  });
  assert.equal((await cron.GET(request(`Bearer ${"\u00e9".repeat(env.CRON_SECRET.length)}`))).status, 401, "Non-ASCII authorization cannot throw a timing-safe byte-length error");
  assert.equal((await cron.GET(request("Bearer invalid"))).status, 401);
  assert.equal(cronCalls, 0);
  assert.equal((await cron.GET(request(`Bearer ${env.CRON_SECRET}`))).status, 200);
  assert.equal(cronCalls, 1);
  for (const provider of ["apple", "google"]) {
    let issued = false;
    const route = load(`app/api/wallet/${provider}/[cardCode]/route.ts`, {
      "@/lib/data/loyalty-experience": { getAuthorizedWalletMember: async () => null },
      "@/lib/wallet": { getWalletReadiness: () => { issued = true; return { apple: true, google: true }; }, issueApplePass() { issued = true; }, issueGoogleSaveUrl() { issued = true; } },
    });
    const response = await route.GET(new Request("https://wallet.example.test"), { params: Promise.resolve({ cardCode: member.card.cardCode }) });
    assert.equal(response.status, 404); assert.equal(issued, false);
    assert(!String(await response.text()).includes(member.card.cardCode));
    assert(response.headers.get("cache-control").includes("no-store"));
  }
  const config = load("lib/wallet/config.ts");
  delete process.env.GOOGLE_WALLET_PUBLISHING_APPROVED;
  assert.equal(config.getWalletReadiness().google, false, "Google signing configuration alone is not publishing approval");
  process.env.GOOGLE_WALLET_PUBLISHING_APPROVED = "true";
  async function exerciseQueue(kind, duplicate = false) {
    const writes = [];
    const jobId = "33333333-3333-4333-8333-333333333333";
    const db = {
      rpc: async () => ({ data: [{ id: jobId, cafe_id: member.card.cafeId, card_id: member.card.id, kind, title: "Rast", body: "Update", attempts: 1 }], error: null }),
      from(table) {
        let update, filters = {};
        const query = {
          select() { return query; }, update(value) { update = value; return query; },
          eq(key, value) { filters[key] = value; return query; }, neq() { return query; }, limit() { return query; },
          maybeSingle() { return query; },
          then(resolve) {
            let data = null, error = null;
            if (table === "wallet_passes") data = [{ provider: "google" }];
            else if (table === "cafe_loyalty_programs") data = { enabled: true, google_wallet_enabled: true, apple_wallet_enabled: false };
            else if (table === "loyalty_cards") data = { card_code: member.card.cardCode };
            else if (table === "wallet_notification_jobs" && update) {
              writes.push({ ...update, id: filters.id });
              if (duplicate && update.status === "pending") error = { code: "23505" };
            } else if (table === "wallet_notification_jobs") data = filters.status === "pending" ? { id: "newer-job" } : { kind: "sync", card_id: member.card.id, cafe_id: member.card.cafeId };
            return Promise.resolve({ data, error }).then(resolve);
          },
        }; return query;
      },
    };
    const worker = load("lib/wallet/index.ts", {
      "@/lib/supabase/admin": { createAdminClient: () => db },
      "@/lib/data/loyalty-experience": { loadWalletMemberByCode: async () => member },
      "./config": { getWalletReadiness: () => ({ google: !duplicate, apple: false }) },
      "./apple": {},
      "./google": { notifyGoogleBrand: async () => { throw new Error("google_wallet_message_429"); } },
    });
    await worker.retryWalletNotificationJobs(1);
    return writes;
  }
  const delayed = await exerciseQueue("message");
  assert.equal(delayed[0].status, "pending");
  assert(Date.parse(delayed[0].available_at) >= Date.now() + 86399000, "Google message quota retry waits 24 hours");
  const superseded = await exerciseQueue("sync", true);
  assert.equal(superseded.length, 2);
  assert.equal(superseded[1].status, "sent");
  assert.equal(superseded[1].last_error, "superseded_by_newer_sync");
  assert.equal(superseded[1].id, superseded[0].id, "Concurrent newer pending job is preserved");
  let rpcCalls = 0;
  const announcements = load("lib/wallet/index.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => ({
      rpc: async (name, args) => { rpcCalls++; assert.equal(name, "enqueue_rast_wallet_announcement"); assert.equal(args.p_cafe_id, member.card.cafeId); return { data: { id: "duplicate-job", created: false, delivery_state: { google: { status: "accepted", count: 1 } } }, error: null }; },
      from() { throw new Error("Duplicate announcement must not deliver again"); },
    }) },
    "./config": { getWalletReadiness() { throw new Error("Duplicate announcement must not invoke providers"); } }, "./apple": {}, "./google": {},
  });
  const duplicate = await announcements.notifyBrandWalletMembers(member.card.cafeId, "rast", "Title", "Message");
  assert.equal(rpcCalls, 1); assert.equal(duplicate.google.status, "accepted"); assert.equal(duplicate.apple.pending, true);
  console.log("PASS: signed Apple bundle/manifest, Google RS256 save link, real balances, no personal payload, tenant and Apple authorization boundaries.");
} finally {
  globalThis.fetch = fetchBefore;
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}
