// Offline tests only: never contact WhatsApp or mutate the production database
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
function load(relative, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", source)((name) => Object.hasOwn(mocks, name) ? mocks[name] : name === "server-only" ? {} : name.startsWith("@/") ? load(`${name.slice(2)}.ts`, mocks) : require(name), exports);
  return exports;
}
const cafeId = "bb404c1a-a439-41ab-aed8-ea0c17875bd9";
const input = { requestId: "abcdefab-1234-4123-a123-abcdefabcdef", rating: 5, notes: "Great food", website: "" };
function fixture({ published = true, phone = "0531293437", failProvider = false, failStorage = false, status = "active" } = {}) {
  const sent = [];
  const tables = {
    cafes: [{ id: cafeId, slug: "double-b-bistro", name: "Double B Bistro", deleted_at: null, status }],
    cafe_settings: [{ cafe_id: cafeId, whatsapp: phone }],
    brand_feature_overrides: [{ cafe_id: cafeId, feature_id: "standalone_menu", enabled: published }],
    cafe_operation_events: [],
  };
  const client = { from(table) {
    let filters = [], mutation;
    const result = () => {
      const selected = tables[table].filter(row => filters.every(([key, value]) => row[key] === value));
      if (mutation?.kind === "insert") {
        if (failStorage) return { error: { code: "storage_failed" } };
        if (tables[table].some(row => row.id === mutation.row.id)) return { error: { code: "23505" } };
        tables[table].push(mutation.row); return { error: null };
      }
      if (mutation?.kind === "update") { selected.forEach(row => Object.assign(row, mutation.row)); return { error: null }; }
      return { data: selected[0] ?? null, error: null };
    };
    const builder = {
      select() { return builder; }, eq(key, value) { filters.push([key, value]); return builder; },
      is(key, value) { filters.push([key, value]); return builder; },
      insert(row) { mutation = { kind: "insert", row }; return builder; },
      update(row) { mutation = { kind: "update", row }; return builder; },
      maybeSingle() { return Promise.resolve(result()); },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    }; return builder;
  } };
  const service = load("lib/data/menu-feedback.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => client },
    "@/lib/whatsapp/green-api": {
      isGreenApiConfigured: () => true,
      sendGreenApiMenuFeedback: async value => { sent.push(value); if (failProvider) throw Error("secret provider URL"); return { providerMessageId: "queued-test" }; },
    },
  });
  return { ...service, sent, tables, submit: value => service.submitMenuFeedback("double-b-bistro", value ?? input, "test-client") };
}
async function run() {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-test-secret";
  const originalNow = Date.now;
  Date.now = () => 1800000000000;
  try {
    for (const status of ["active", "suspended", "inactive"]) {
      const f = fixture({ status });
      assert.deepEqual(await f.submit(), { status: "queued" });
      assert.equal(f.sent[0].recipient, "966531293437");
      assert.equal(f.sent[0].rating, 5);
      assert.deepEqual(await f.submit(), { status: "queued" });
      assert.equal(f.sent.length, 1, "Idempotent retries never resend");
      await assert.rejects(f.submit({ ...input, rating: 1 }), e => e.status === 409);
      await assert.rejects(f.submit({ ...input, requestId: "bbbbbbbb-1234-4123-a123-abcdefabcdef" }), e => e.status === 429);
      await assert.rejects(f.submitMenuFeedback("double-b-bistro", { ...input, requestId: "cccccccc-1234-4123-a123-abcdefabcdef" }, "spoofed-ip"), e => e.status === 429);
      assert.ok(!JSON.stringify(f.tables.cafe_operation_events).includes("test-client"), "No raw IP retained");
    }
    for (const options of [{ published: false }, { phone: null }, { failStorage: true }]) {
      const f = fixture(options); await assert.rejects(f.submit()); assert.equal(f.sent.length, 0);
    }
    const f = fixture();
    for (const bad of [{ ...input, rating: 6 }, { ...input, rating: 0 }, { ...input, rating: 1.5 }, { ...input, notes: "x".repeat(1501) }, { ...input, website: "spam" }, { ...input, recipient: "attacker" }]) {
      await assert.rejects(f.submit(bad), e => e.status === 400);
    }
    assert.equal(f.sent.length, 0);
    const failed = fixture({ failProvider: true });
    await assert.rejects(failed.submit(), e => e.status === 502 && !e.message.includes("secret"));
    await assert.rejects(failed.submit(), e => e.status === 409);
    assert.equal(failed.sent.length, 1);
    const race = fixture();
    await Promise.allSettled([race.submit(), race.submit()]);
    assert.equal(race.sent.length, 1, "Concurrent duplicate must not send twice");
    const visitor = fixture();
    await visitor.submit();
    Date.now = () => 1800000020000;
    await assert.rejects(visitor.submit({ ...input, requestId: "dddddddd-1234-4123-a123-abcdefabcdef" }), e => e.status === 429);
    assert.equal(visitor.sent.length, 1, "Visitor cooldown survives a new brand window");

    let calls = 0;
    const { POST } = load("app/api/menu/[slug]/feedback/route.ts", { "@/lib/data/menu-feedback": { ...f, submitMenuFeedback: async () => { calls++; return { status: "queued" }; } } });
    const context = { params: Promise.resolve({ slug: "double-b-bistro" }) };
    const request = (body, origin = "https://menu.test", contentType = "application/json") => new Request("https://menu.test/api/menu/double-b-bistro/feedback", { method: "POST", headers: { origin, "content-type": contentType }, body });
    assert.equal((await POST(request(JSON.stringify(input), "https://attacker.test"), context)).status, 403);
    assert.equal((await POST(request(JSON.stringify(input), "https://menu.test", "text/plain"), context)).status, 415);
    assert.equal((await POST(request("invalid"), context)).status, 400);
    assert.equal((await POST(request("x".repeat(8193)), context)).status, 413);
    assert.equal(calls, 0);
    assert.equal((await POST(request(JSON.stringify(input)), context)).status, 200);
    assert.equal(calls, 1);

    const originalFetch = global.fetch;
    process.env.GREEN_API_API_URL = "https://provider.test";
    process.env.GREEN_API_ID_INSTANCE = "test";
    process.env.GREEN_API_API_TOKEN_INSTANCE = "test-token";
    try {
      let payload;
      global.fetch = async (_url, options) => { payload = JSON.parse(options.body); return Response.json({ idMessage: "test-queue-id" }); };
      const green = load("lib/whatsapp/green-api.ts");
      assert.deepEqual(await green.sendGreenApiMenuFeedback({ recipient: "966531293437", brandName: "Double B Bistro", rating: 3, notes: "Test" }), { providerMessageId: "test-queue-id" });
      assert.equal(payload.chatId, "966531293437@c.us");
      assert.equal(payload.linkPreview, false);
      assert.ok(payload.message.includes("Test"));
      await assert.rejects(green.sendGreenApiMenuFeedback({ recipient: "attacker", rating: 3, notes: "Test" }));
    } finally { global.fetch = originalFetch; }
    console.log("PASS: recipient isolation, suspended brands, publication, validation, durable rate limits, concurrent idempotency, uncertain sends, HTTP guards and mocked GREEN API contract");
  } finally { Date.now = originalNow; }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
