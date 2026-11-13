import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash, verify } from "node:crypto";
import ts from "typescript";
import sharp from "sharp";
import forge from "node-forge";

const dependency = createRequire(import.meta.url);
const root = process.cwd(), modules = new Map();
function load(file, mocks = {}) {
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "exports", code)(name => {
    if (name === "server-only") return {};
    if (name in mocks) return mocks[name];
    if (name.startsWith("@/") || name.startsWith(".")) return load(`${name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(file), name)}.ts`, mocks);
    return dependency(name);
  }, exports);
  return exports;
}
function unzip(buffer) {
  const files = {};
  for (let offset = 0; buffer.readUInt32LE(offset) === 0x04034b50;) {
    assert.equal(buffer.readUInt16LE(offset + 8), 0);
    const length = buffer.readUInt32LE(offset + 18), nameLength = buffer.readUInt16LE(offset + 26), extra = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString(), start = offset + 30 + nameLength + extra;
    files[name] = buffer.subarray(start, start + length); offset = start + length;
  }
  return files;
}
function certificate() {
  const keys = forge.pki.rsa.generateKeyPair(1024), cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 60000); cert.validity.notAfter = new Date(Date.now() + 86400000);
  cert.setSubject([{ name: "commonName", value: "pass.com.test.mqas77" }, { name: "organizationalUnitName", value: "TESTTEAM" }]); cert.setIssuer(cert.subject.attributes);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  process.env.APPLE_WALLET_SIGNER_CERT_PEM = forge.pki.certificateToPem(cert);
  process.env.APPLE_WALLET_SIGNER_KEY_PEM = forge.pki.privateKeyToPem(keys.privateKey);
  process.env.APPLE_WALLET_WWDR_CERT_PEM = forge.pki.certificateToPem(cert);
  process.env.APPLE_WALLET_PASS_TYPE_ID = "pass.com.test.mqas77";
  process.env.APPLE_WALLET_TEAM_ID = "TESTTEAM";
  process.env.WALLET_AUTH_SECRET = "isolated-wallet-fixture-secret-0000000000";
  process.env.WALLET_PUBLIC_BASE_URL = "https://wallet.example.test";
  return forge.pki.publicKeyToPem(keys.publicKey);
}

const member = {
  cafeSlug: "brand-edbc2c01385b", cafeName: "مقص 77", logoUrl: null,
  card: { id: "11111111-1111-4111-8111-111111111111", cafeId: "d4a19dc5-ef99-4aec-86ae-0bebc7bbd59e", cardCode: "MQAS77-ISOLATED-FIXTURE", displayNumber: "77", stampsInCycle: 3, availableRewards: 0, updatedAt: "2026-11-13T00:00:00Z", customerName: "Private fixture name", customerPhone: "Private fixture phone" },
  program: { enabled: true, appleWalletEnabled: true, googleWalletEnabled: true, cardTitle: "بطاقة الولاء", stampLabel: "ختم", purchasesRequired: 4, rewardName: "خدمة مجانية", terms: "Fixture", cardBackground: "#4a281d", cardForeground: "#fcf8f3", cardAccent: "#d9a33f", stampStyle: "scissors" },
  experience: { rewardValidityDays: 30, nearbyMessage: "", latitude: null, longitude: null },
};
const output = path.join(root, "output/mqas77-wallet"); fs.mkdirSync(output, { recursive: true });
const oldFetch = globalThis.fetch; globalThis.fetch = async () => { throw Error("Unexpected network request"); };
let checks = 0;
try {
  const key = certificate();
  const design = load("lib/wallet/mqas77-design.ts"), art = load("lib/wallet/art.ts"), payload = load("lib/wallet/payload.ts");
  assert.deepEqual(payload.walletColors(member), design.MQAS77_WALLET_COLORS); checks++;
  const other = { ...member, cafeSlug: "another-brand" };
  assert.equal(payload.walletColors(other).background, member.program.cardBackground); checks++;
  for (const earned of [0, 1, 3, 4]) {
    const current = { ...member, card: { ...member.card, stampsInCycle: earned } };
    const svg = design.mqas77StampSvg(current, "data:image/png;base64,fixture", 2, true);
    assert.equal((svg.match(/data-stamp=/g) || []).length, 4);
    assert.equal((svg.match(/data-earned="true"/g) || []).length, earned);
    assert(!svg.includes(member.card.cardCode)); assert(!svg.includes(member.card.customerName));
    const google = payload.buildGoogleObject(current, "12345", art.walletArtUrl(current));
    assert.equal(google.loyaltyPoints.balance.string, String(4 - earned)); assert.equal(google.secondaryLoyaltyPoints.balance.int, 0); checks += 3;
    for (const apple of [true, false]) {
      const png = await art.walletStampArtwork(current, 2, apple), meta = await sharp(png).metadata();
      assert.equal(meta.width, apple ? 750 : 1032); assert.equal(meta.height, apple ? 288 : 812);
      fs.writeFileSync(path.join(output, `${apple ? "apple-strip" : "google-hero"}-${earned}.png`), png); checks++;
    }
  }
  const googleLogo = await load("lib/wallet/mqas77-assets.ts").mqas77GoogleLogo();
  const meta = await sharp(googleLogo).metadata(); assert.equal(meta.width, 660); assert.equal(meta.height, 660); checks++;
  fs.writeFileSync(path.join(output, "google-logo.png"), googleLogo);
  assert.match(payload.buildGoogleClass(member, "12345", "https://wallet.example.test").programLogo.sourceUri.uri, /wallet=mqas77/); checks++;
  assert(!payload.buildGoogleClass(other, "12345", "https://wallet.example.test").programLogo.sourceUri.uri.includes("wallet=mqas77")); checks++;
  const native = unzip(await load("lib/wallet/apple.ts").issueApplePass(member)), pass = JSON.parse(native["pass.json"]);
  assert.equal(pass.backgroundColor, "rgb(8, 8, 8)"); assert.equal(pass.foregroundColor, "rgb(246, 220, 166)");
  assert.equal(pass.storeCard.headerFields[0].value, "3 / 4"); assert.equal(pass.storeCard.secondaryFields[0].value, 1); assert.equal(pass.storeCard.auxiliaryFields[0].value, 0); checks += 3;
  assert.equal(pass.barcodes[0].message, payload.buildGoogleObject(member, "12345").barcode.value); assert.equal(pass.serialNumber, member.card.cardCode); checks++;
  for (const suffix of ["", "@2x", "@3x"]) assert(native[`strip${suffix}.png`] && native[`logo${suffix}.png`]); checks++;
  for (const [index, suffix] of ["", "@2x", "@3x"].entries()) {
    const icon = await sharp(native[`icon${suffix}.png`]).metadata();
    assert.deepEqual([icon.width, icon.height], [38 * (index + 1), 38 * (index + 1)]);
    assert.equal(icon.hasAlpha, false); checks++;
  }
  assert.equal(pass.userInfo.iconVersion, load("lib/wallet/apple-icon.ts").APPLE_ICON_VERSION); checks++;
  const { appleIconBackground } = load("lib/wallet/apple-icon.ts");
  for (const [color, expected] of [["#ffffff", "#080808"], ["#000000", "#f8f2e8"]]) {
    const mark = await sharp({ create: { width: 32, height: 32, channels: 4, background: color } }).png().toBuffer();
    assert.equal(await appleIconBackground(mark, "#080808", "#f8f2e8"), expected); checks++;
  }
  const manifest = JSON.parse(native["manifest.json"]);
  for (const [name, hash] of Object.entries(manifest)) assert.equal(createHash("sha1").update(native[name]).digest("hex"), hash); checks++;
  const info = forge.asn1.fromDer(native.signature.toString("binary")).value[1].value[0].value.at(-1).value[0];
  const attributes = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, info.value[3].value);
  assert(verify("RSA-SHA1", Buffer.from(forge.asn1.toDer(attributes).getBytes(), "binary"), key, Buffer.from(info.value[5].value, "binary"))); checks++;
  const route = load("app/api/wallet/brand/[slug]/logo/route.ts", { "@/lib/data/loyalty-experience": { getLoyaltyBrand: async slug => slug === member.cafeSlug ? { identity: { name: member.cafeName, logoUrl: null }, program: member.program } : null } });
  const response = await route.GET(new Request(`https://wallet.example.test/logo?wallet=mqas77`), { params: Promise.resolve({ slug: member.cafeSlug }) });
  assert.equal(response.status, 200); assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width, 660); checks++;
  assert.equal((await route.GET(new Request("https://wallet.example.test/logo?wallet=mqas77"), { params: Promise.resolve({ slug: "unavailable-brand" }) })).status, 404); checks++;
  console.log(`PASS ${checks} MQAS77 artwork, native fields, signed Apple package, scoped Google logo, QR and tenant-isolation checks; no real messages or issuance`);
} finally { globalThis.fetch = oldFetch; }
