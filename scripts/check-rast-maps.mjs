import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Exercise the production resolver and save methods; no network or database access.
const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
const cache = new Map();
const writes = [], events = [], invalidations = [];
let owner, features, ownerError, dbError, calls, respond;
const db = {
  rpc: async (name, args) => { writes.push({ name, args }); return { error: dbError }; },
  from: (table) => ({ upsert: async (args, options) => { writes.push({ table, args, options }); return { error: dbError }; } }),
};
const stubs = {
  "server-only": {},
  "@/lib/supabase/admin": { createAdminClient: () => assert.fail("Unexpected admin access") },
  "@/lib/supabase/server": { createClient: async () => { events.push("db"); return db; } },
  "@/lib/data/cafes": { requireOwnerCafeContext: async () => { events.push("owner"); if (ownerError) throw ownerError; return owner; } },
  "@/lib/data/feature-entitlements": { getOwnerFeatureCodes: async () => { events.push("features"); return features; } },
  "@/lib/data/settings": {}, "@/lib/data/loyalty-cards": {}, "@/lib/auth/rast-loyalty-session": {},
  "@/lib/data/cashier": {}, "@/lib/data/rast-loyalty-access": {}, "@/lib/data/customer-rewards": {},
  "@/app/actions/auth": {}, "@/lib/auth/phone-otp": {}, "@/lib/wallet": {},
  "next/cache": { revalidatePath: (value) => invalidations.push(value) },
};
function load(relative) {
  relative = relative.replaceAll("\\", "/");
  if (cache.has(relative)) return cache.get(relative);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {}; cache.set(relative, exports);
  new Function("require", "exports", output)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      const next = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name);
      return load(`${next}.ts`);
    }
    return dependency(name);
  }, exports);
  return exports;
}
const { resolveBranchGoogleMapsUrl: resolve, GoogleMapsLocationError } = load("lib/maps/resolve-branch-location.ts");
const { saveBrandLoyaltyProgram, saveOwnerLoyaltyExperience } = load("lib/data/loyalty-experience.ts");
const { saveRastLoyaltySettingsAction } = load("app/actions/loyalty-experience.ts");
const short = "https://maps.app.goo.gl/TestBranch";
const point = { latitude: 24.7136, longitude: 46.6753 };
const direct = "https://www.google.com/maps?q=24.7136,46.6753";
const canonical = `<link rel="canonical" href="${direct}">`;
const html = (body) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
const redirect = (location, status = 302) => new Response(null, { status, headers: { location } });
const program = {
  enabled: false, cardTitle: "Rast loyalty", cardSubtitle: "Member card", purchasesRequired: 7,
  rewardProductId: null, rewardName: "Custom reward", stampLabel: "Visit", terms: "Reward terms",
  cardBackground: "#112233", cardForeground: "#ffffff", cardAccent: "#aabbcc",
  appleWalletEnabled: false, googleWalletEnabled: false,
};
const experience = { rewardKind: "custom", rewardDiscountPercent: null, rewardValidityDays: 30,
  nearbyMessage: "Your branch is nearby", latitude: 10, longitude: 20 };
function reset() {
  owner = { id: "11111111-1111-4111-8111-111111111111", slug: "rast" };
  features = ["loyalty"]; ownerError = null; dbError = null;
  writes.length = events.length = invalidations.length = 0;
  calls = [];
  respond = () => { throw new Error("Unexpected network request"); };
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  events.push("fetch"); calls.push({ url: String(url), options });
  assert.equal(options.redirect, "manual"); assert.equal(options.cache, "no-store");
  assert.ok(options.signal instanceof AbortSignal);
  return respond(String(url), options, calls.length);
};
let passed = 0;
const failed = [];
async function test(name, run) {
  reset();
  try { await run(); passed++; } catch (error) { failed.push({ name, error }); }
}
const rejectsLocation = (input) => assert.rejects(resolve(input), GoogleMapsLocationError);
try {
  for (const [name, url, expected] of [
    ["q", direct, point],
    ["query", "https://google.com/maps/search/?api=1&query=24.7136%2C46.6753", point],
    ["coordinate place", "https://google.com/maps/place/24.7136%2C46.6753", point],
    ["pin over viewport and fallback", "https://google.com/maps/place/Rast/@1,2,17z/data=!3d24.7136!4d46.6753?q=3,4", point],
    ["pin query", "https://google.com/maps?data=!3d24.7136!4d46.6753", point],
    ["same repeated pin", "https://google.com/maps/data=!3d24.7136!4d46.6753!3d24.7136!4d46.6753", point],
    ["Saudi domain", "https://maps.google.com.sa/?q=24.7136,46.6753", point],
    ["zero", "https://google.com/maps?q=0,0", { latitude: 0, longitude: 0 }],
    ["range boundaries", "https://google.com/maps?q=-90,180", { latitude: -90, longitude: 180 }],
    ["clear", "   ", { latitude: null, longitude: null }],
  ]) await test(`direct ${name}`, async () => { assert.deepEqual(await resolve(url), expected); assert.equal(calls.length, 0); });

  const forbidden = [
    "https://evil.google.com/maps?q=1,2", "https://google.com.evil.test/maps?q=1,2",
    "https://google.com@evil.test/maps?q=1,2", "https://user:pass@google.com/maps?q=1,2",
    "https://google.com:8443/maps?q=1,2", "http://google.com/maps?q=1,2",
    "https://127.0.0.1/maps?q=1,2", "https://2130706433/maps?q=1,2", "https://[::1]/maps?q=1,2",
    "https://localhost/maps?q=1,2", "file:///maps?q=1,2", "javascript:alert(1)", "//google.com/maps?q=1,2",
    "https://google.com/search?q=1,2", "https://goo.gl/other/123", "https://google.com/maps/dir/?q=1,2",
    "https://google.com/maps/%64ir/?q=1,2", "https://google.com/maps/%2564ir/?q=1,2",
    "https://google.com/maps/embed?q=1,2", "https://google.com/maps/d/viewer?q=1,2",
    "https://google.com/maps?map_action=pano&q=1,2", "https://google.com/maps?q=91,2",
    "https://google.com/maps?q=1,-181", "https://google.com/maps/data=!3d1!4d2!3d3!4d4",
    `https://google.com/maps?q=1,2&extra=${"x".repeat(2050)}`,
    "https://google.com/maps\n?q=1,2",
  ];
  for (const [index, url] of forbidden.entries()) await test(`reject unsafe input ${index + 1}`, async () => {
    await rejectsLocation(url); assert.equal(calls.length, 0);
  });

  for (const status of [301, 302, 303, 307, 308]) await test(`short redirect ${status}`, async () => {
    respond = () => redirect(direct, status);
    assert.deepEqual(await resolve(short), point); assert.equal(calls.length, 1);
  });
  await test("legacy short URL and relative redirect", async () => {
    respond = (_url, _options, count) => redirect(count === 1 ? "https://maps.google.com/maps/place/Branch" : "/maps?q=24.7136,46.6753");
    assert.deepEqual(await resolve("https://goo.gl/maps/abc123"), point);
    assert.equal(calls.length, 2); assert.equal(calls[0].options.signal, calls[1].options.signal);
  });
  for (const location of [forbidden[0], forbidden[3], forbidden[4], forbidden[5], forbidden[6], forbidden[10], "//evil.test/maps?q=1,2"]) {
    await test(`unsafe redirect ${location}`, async () => {
      respond = () => redirect(location); await rejectsLocation(short); assert.equal(calls.length, 1);
    });
  }
  await test("redirect cap", async () => {
    respond = (_url, _options, count) => redirect(`https://maps.app.goo.gl/next${count}`);
    await rejectsLocation(short); assert.equal(calls.length, 6);
  });
  await test("redirect cycle", async () => {
    respond = (_url, _options, count) => redirect(count === 1 ? "https://maps.app.goo.gl/second" : short);
    await rejectsLocation(short); assert.equal(calls.length, 2);
  });
  await test("missing redirect destination", async () => {
    respond = () => new Response(null, { status: 302 }); await rejectsLocation(short); assert.equal(calls.length, 1);
  });
  for (const markup of [canonical, `<META content='${direct.replace("?q=", "?api=1&amp;q=")}' PROPERTY='og:url'>`]) {
    await test("canonical metadata", async () => { respond = () => html(markup); assert.deepEqual(await resolve(short), point); });
  }
  for (const url of [forbidden[0], forbidden[3], forbidden[4], forbidden[5], forbidden[6], forbidden[10]]) {
    await test(`unsafe canonical ${url}`, async () => {
      respond = () => html(`<link rel="canonical" href="${url}">`);
      await rejectsLocation(short); assert.equal(calls.length, 1);
    });
  }
  for (const [name, url, markup] of [
    ["name", "https://google.com/maps/place/Rast", "<p>Rast, Riyadh 24.7136,46.6753</p>"],
    ["viewport", "https://google.com/maps/@24.7136,46.6753,18z?ll=24.7136,46.6753", ""],
    ["Place ID overrides fallback", `${direct}&query_place_id=ChIJ-test`, ""],
    ["evil canonical", short, '<link rel="canonical" href="https://evil.test/maps?q=1,2">'],
    ["viewport canonical", short, '<link rel="canonical" href="https://google.com/maps/@1,2,12z">'],
    ["comment", short, `<!-- ${canonical} -->`],
    ["script", short, `<script>const x = '${canonical}';</script>`],
    ["style", short, `<style>/* ${canonical} */</style>`],
    ["template", short, `<template>${canonical}</template>`],
    ["image", short, `<img src="${direct}">`],
  ]) await test(`no guessed location: ${name}`, async () => { respond = () => html(markup); await rejectsLocation(url); assert.equal(calls.length, 1); });
  await test("ignore unsafe metadata before valid canonical", async () => {
    respond = () => html(`<script>${canonical.replace("24.7136", "1")}</script>${canonical}`);
    assert.deepEqual(await resolve(short), point);
  });
  await test("body byte cap cancels stream", async () => {
    let cancelled = false;
    respond = () => html(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(256 * 1024 + 1)); },
      cancel() { cancelled = true; },
    }));
    await rejectsLocation(short); assert.equal(cancelled, true);
  });
  await test("non-HTML body is not interpreted", async () => {
    respond = () => new Response(canonical, { headers: { "content-type": "application/json" } });
    await rejectsLocation(short);
  });
  await test("failed response is not interpreted", async () => {
    respond = () => new Response(canonical, { status: 503, headers: { "content-type": "text/html" } });
    await rejectsLocation(short);
  });
  await test("network failure uses safe typed error", async () => {
    respond = () => { throw new Error("PRIVATE_NETWORK_DETAIL"); };
    await assert.rejects(resolve(short), (error) => error instanceof GoogleMapsLocationError && !error.message.includes("PRIVATE_NETWORK_DETAIL"));
  });
  for (const phase of ["headers", "body"]) await test(`shared eight-second abort signal: ${phase}`, async () => {
    const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
    const controller = new AbortController(); const durations = [];
    Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: (duration) => { durations.push(duration); return controller.signal; } });
    try {
      respond = async (_url, options, count) => {
        if (count === 1) return redirect("https://maps.app.goo.gl/second");
        assert.equal(options.signal, controller.signal);
        if (phase === "headers") return new Promise((_accept, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
          controller.abort(new DOMException("Aborted", "AbortError"));
        });
        return html(new ReadableStream({ start(stream) {
          options.signal.addEventListener("abort", () => stream.error(options.signal.reason), { once: true });
          controller.abort(new DOMException("Aborted", "AbortError"));
        } }));
      };
      await rejectsLocation(short); assert.deepEqual(durations, [8000]); assert.equal(calls.length, 2);
      assert.equal(calls[0].options.signal, calls[1].options.signal);
    } finally { Object.defineProperty(AbortSignal, "timeout", descriptor); }
  });

  for (const method of ["program", "experience"]) {
    const save = (input) => method === "program" ? saveBrandLoyaltyProgram({ program, experience: input }) : saveOwnerLoyaltyExperience(input);
    const savedPoint = () => method === "program" ? writes[0].args.p_experience
      : { latitude: writes[0].args.branch_latitude, longitude: writes[0].args.branch_longitude };
    for (const denied of ["not owner", "other tenant", "no feature"]) await test(`${method}: ${denied} denied before fetch/DB`, async () => {
      if (denied === "not owner") ownerError = new Error("Unauthorized");
      if (denied === "other tenant") owner.slug = "other-brand";
      if (denied === "no feature") features = [];
      respond = () => redirect(direct);
      await assert.rejects(save({ ...experience, mapsUrl: short }));
      assert.equal(calls.length, 0); assert.equal(writes.length, 0); assert.ok(!events.includes("db"));
    });
    await test(`${method}: resolved coordinates are persisted after authorization`, async () => {
      respond = () => redirect(direct);
      await save({ ...experience, mapsUrl: short });
      assert.equal(writes.length, 1); assert.equal(savedPoint().latitude, point.latitude); assert.equal(savedPoint().longitude, point.longitude);
      assert.ok(events.indexOf("owner") < events.indexOf("fetch"));
      assert.ok(events.indexOf("features") < events.indexOf("fetch"));
      assert.ok(events.indexOf("fetch") < events.indexOf("db"));
      if (method === "program") {
        assert.equal(writes[0].name, "set_rast_loyalty_settings"); assert.equal(writes[0].args.p_cafe_id, owner.id);
        assert.equal(Object.hasOwn(writes[0].args.p_experience, "mapsUrl"), false);
      } else { assert.equal(writes[0].table, "cafe_loyalty_experience"); assert.equal(writes[0].args.cafe_id, owner.id); }
    });
    await test(`${method}: blank link clears both old coordinates`, async () => {
      await save({ ...experience, mapsUrl: "  " });
      assert.equal(savedPoint().latitude, null); assert.equal(savedPoint().longitude, null); assert.equal(calls.length, 0);
    });
    await test(`${method}: absent link preserves legacy coordinates`, async () => {
      await save(experience); assert.equal(savedPoint().latitude, 10); assert.equal(savedPoint().longitude, 20); assert.equal(calls.length, 0);
    });
    for (const invalid of ["https://evil.test/maps?q=1,2", "https://google.com/maps?q=91,2", short]) {
      await test(`${method}: invalid or unresolved map makes no write`, async () => {
        respond = () => html("<p>Unknown place</p>");
        await assert.rejects(save({ ...experience, mapsUrl: invalid }));
        assert.equal(writes.length, 0); assert.ok(!events.includes("db"));
      });
    }
    await test(`${method}: invalid legacy pair makes no write`, async () => {
      await assert.rejects(save({ ...experience, latitude: null })); assert.equal(writes.length, 0);
    });
    await test(`${method}: interrupted resolution makes no write`, async () => {
      respond = () => { throw new DOMException("Aborted", "AbortError"); };
      await assert.rejects(save({ ...experience, mapsUrl: short }), GoogleMapsLocationError);
      assert.equal(writes.length, 0); assert.ok(!events.includes("db"));
    });
    await test(`${method}: database errors are propagated`, async () => {
      dbError = { message: "DB error" }; await assert.rejects(save({ ...experience, mapsUrl: direct })); assert.equal(writes.length, 1);
    });
  }
  await test("save action reports invalid link without invalidation or write", async () => {
    const result = await saveRastLoyaltySettingsAction({ program, experience: { ...experience, mapsUrl: "https://evil.test/maps?q=1,2" } });
    assert.equal(result.ok, false); assert.ok(result.message); assert.equal(writes.length, 0); assert.equal(invalidations.length, 0);
  });
  await test("save action reports successful atomic save and invalidates both routes", async () => {
    const result = await saveRastLoyaltySettingsAction({ program, experience: { ...experience, mapsUrl: direct } });
    assert.deepEqual(result, { ok: true }); assert.equal(writes.length, 1);
    assert.deepEqual(invalidations, ["/loyalty/rast", "/dashboard/loyalty"]);
  });
} finally { globalThis.fetch = originalFetch; }
for (const { name, error } of failed) console.error(`FAIL ${name}: ${error.stack ?? error}`);
console.log(`Rast maps: ${passed} passed, ${failed.length} failed (actual resolver/save methods; mocked network and DB).`);
if (failed.length) process.exitCode = 1;
