import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { NextRequest } from "next/server.js";

const require = createRequire(import.meta.url);
function load(path, stubs = {}) {
  const output = ts.transpileModule(fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", output)(name => stubs[name] ?? require(name), exports);
  return exports;
}
let row = { expires_at: "2099-01-01T00:00:00Z", revoked_at: null }, error = null, reads = 0;
const query = { select() { return this; }, eq(key, token) { assert.equal(key, "token"); assert.equal(token, "test-session"); return this; }, async maybeSingle() { reads++; return { data: row, error }; } };
const { cashierSessionStatus, recoverExpiredCashierAction } = load("lib/cashier/session-recovery.ts", {
  "@/lib/supabase/admin": { createAdminClient: () => ({ from: table => { assert.equal(table, "cafe_cashier_sessions"); return query; } }) },
});
const request = (path = "/cashier", token = true, method = "POST", action = true) => new NextRequest(`https://example.test${path}`, {
  method, headers: { ...(token ? { cookie: "barndaksa_cashier_session=test-session" } : {}), ...(action ? { "next-action": "old-action-id" } : {}) },
});
assert.equal(await cashierSessionStatus(request()), "valid");
assert.equal(await recoverExpiredCashierAction(request()), null, "Healthy actions continue unchanged");
for (const value of [null, { expires_at: "2000-01-01", revoked_at: null }, { expires_at: "2099-01-01", revoked_at: "2026-01-01" }]) {
  row = value;
  const response = await recoverExpiredCashierAction(request());
  assert.equal(response.headers.get("x-action-redirect"), "/cashier/session/clear?reason=session;replace");
  assert.equal(await response.text(), "", "No Flight body forces a full navigation");
  assert.match(response.headers.get("cache-control"), /no-store/);
}
const before = reads;
assert.equal(await cashierSessionStatus(request("/cashier", false)), "expired");
assert.equal(reads, before, "Missing cookie does not query the database");
for (const path of ["/cashier/login", "/cashier/session/clear", "/finance/test/pos", "/dashboard"]) {
  assert.equal(await recoverExpiredCashierAction(request(path)), null, "Login and unrelated systems remain accessible");
}
assert.equal(await recoverExpiredCashierAction(request("/cashier", true, "GET")), null);
assert.equal(await recoverExpiredCashierAction(request("/cashier", true, "POST", false)), null);
error = { code: "timeout" };
assert.equal(await cashierSessionStatus(request()), "unavailable");
assert.equal(await recoverExpiredCashierAction(request()), null, "Outages do not clear sessions; action authorization still runs");

const { watchCashierSession } = load("lib/cashier/watch-session.ts");
const settle = () => new Promise(setImmediate);
function harness() {
  const target = new EventTarget(), document = new EventTarget(), navigations = [];
  let status = 200, failure = false, calls = 0, resolve;
  target.fetch = async () => { calls++; if (failure) throw new Error("offline"); return new Promise(done => { resolve = () => done({ status }); }); };
  target.location = { replace: path => navigations.push(path) };
  const stop = watchCashierSession(target, document);
  return { target, document, navigations, stop, finish: async value => { status = value; resolve(); await settle(); }, offline: () => { failure = true; }, calls: () => calls };
}
const healthy = harness();
healthy.document.dispatchEvent(new Event("click"));
healthy.document.dispatchEvent(new Event("submit"));
assert.equal(healthy.calls(), 1, "Concurrent interactions share a pending check");
await healthy.finish(200);
healthy.document.dispatchEvent(new Event("click")); await healthy.finish(503);
assert.deepEqual(healthy.navigations, []);
healthy.offline(); healthy.target.dispatchEvent(new Event("focus")); await settle();
assert.deepEqual(healthy.navigations, [], "Offline keeps pending operations intact"); healthy.stop();
const expired = harness(); await expired.finish(401);
assert.deepEqual(expired.navigations, ["/cashier/session/clear?reason=session"]);
expired.document.dispatchEvent(new Event("click")); assert.equal(expired.calls(), 1); expired.stop();
const disposed = harness(); disposed.stop(); await disposed.finish(401);
assert.deepEqual(disposed.navigations, [], "An unmounted guard never navigates away from login");
disposed.document.dispatchEvent(new Event("click")); assert.equal(disposed.calls(), 1);

// Pin the action response contract to the installed Next version used by production.
const reducer = fs.readFileSync(require.resolve("next/dist/client/components/router-reducer/reducers/server-action-reducer.js"), "utf8");
assert(reducer.includes("res.headers.get('x-action-redirect')"));
assert.match(reducer, /flightData === undefined && redirectLocation !== undefined/);
assert(reducer.includes("completeHardNavigation"));
console.log("PASS: expired/revoked/missing sessions, old action redirect, valid sessions, outage preservation, interaction checks, cleanup and installed Next hard-navigation contract");
