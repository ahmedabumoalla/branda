// The actions receive neither a recipient nor an owner identity from the browser.
// Run without an account, database, provider credentials or network calls.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

function load(file, replacements = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", code)(name => replacements[name] ?? require(name), exports);
  return exports;
}

async function test() {
  const cafe = randomUUID();
  const actor = randomUUID();
  const request = randomUUID();
  const calls = [];
  let authorized = true;
  const actions = load("app/actions/admin-brand-password-delivery.ts", {
    "@/lib/platform/action-result": load("lib/platform/action-result.ts"),
    "@/lib/data/cafes": {
      requirePlatformAdmin: async () => {
        if (!authorized) throw new Error("Unauthorized");
        return { id: actor };
      },
    },
    "@/lib/data/brand-password-delivery": {
      getBrandPasswordDelivery: async (...args) => { calls.push(args); return null; },
      requestBrandPasswordDelivery: async (...args) => { calls.push(args); return { id: request, state: "queued" }; },
    },
  });
  const read = actions.fetchAdminBrandPasswordDeliveryAction;
  const start = actions.requestAdminBrandPasswordDeliveryAction;
  assert.deepEqual(await read(cafe), { ok: true, data: null });
  const expected = { ok: true, data: { id: request, state: "queued" } };
  assert.deepEqual(await start(cafe, request, "forged-actor"), expected);
  assert.deepEqual(await start(cafe, request), expected);
  assert.deepEqual(calls, [[cafe, actor], [cafe, request, actor], [cafe, request, actor]]);
  for (const [badCafe, badId] of [[cafe, ""], [{}, request], ["bad", request]]) {
    assert.equal((await start(badCafe, badId)).ok, false);
  }
  assert.equal((await read("bad")).ok, false);
  authorized = false;
  assert.equal((await read(cafe)).ok, false);
  assert.equal((await start(cafe, request)).ok, false);
  assert.equal(calls.length, 3);
  console.log("PASS admin owner password reads, requests, actor binding, retry keys, input validation and access control");
}

test().catch(error => { console.error(error); process.exitCode = 1; });
