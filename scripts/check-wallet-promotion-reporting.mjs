import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
const dependency = createRequire(import.meta.url);
const source = ts.transpileModule(fs.readFileSync("lib/wallet/index.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const passes = Array.from({ length: 1201 }, (_, i) => ({ provider: "google", card_id: `card-${i}` }));
passes.push({ provider: "apple", card_id: "card-0" });
async function scenario({ googleFails = false, trackingFails = false, previous } = {}) {
  const receipts = [], pushes = [], notifications = [], updates = [];
  const registrations = [{ push_token: "ok", card_id: "card-0" }, { push_token: "ok", card_id: "card-1" }, { push_token: "fail", card_id: "card-2" }, { push_token: "gone", card_id: "card-3" }];
  const db = {
    rpc: async (name, args) => {
      if (name === "enqueue_rast_wallet_announcement") return { data: { id: "announcement", created: true } };
      if (name === "claim_wallet_notification_jobs") return { data: [{ id: "announcement", cafe_id: "brand", kind: "message", title: "Title", body: "Body", attempts: 2, delivery_state: previous }] };
      assert.equal(name, "record_wallet_promotion_recipients");
      assert.equal(args.p_job, "announcement"); assert.equal(args.p_cafe, "brand");
      assert.ok(args.p_cards.length <= 500);
      if (trackingFails) return { error: { message: "offline" } };
      receipts.push(args); return { error: null };
    },
    from: table => {
      const state = {}; const q = {};
      for (const method of ["select", "eq", "order", "range", "maybeSingle", "delete", "update"]) q[method] = (...args) => { state[method] = args; return q; };
      q.then = resolve => {
        if (table === "wallet_passes") return Promise.resolve({ data: passes.slice(state.range[0], state.range[1] + 1) }).then(resolve);
        if (table === "cafe_loyalty_programs") return Promise.resolve({ data: { enabled: true, apple_wallet_enabled: true, google_wallet_enabled: true } }).then(resolve);
        if (table === "wallet_apple_registrations") return Promise.resolve({ data: state.delete ? null : registrations }).then(resolve);
        assert.equal(table, "wallet_notification_jobs"); updates.push(state.update[0]); return Promise.resolve({ error: null }).then(resolve);
      }; return q;
    },
  };
  const stubs = {
    "server-only": {}, "@/lib/supabase/admin": { createAdminClient: () => db },
    "./config": { getWalletReadiness: () => ({ apple: true, google: true }) },
    "./apple": { pushAppleDevice: async token => { pushes.push(token); if (token !== "ok") throw new Error(token === "gone" ? "apple_push_410" : "apple_push_500"); } },
    "./google": { notifyGoogleBrand: async (...args) => { notifications.push(args); if (googleFails) throw new Error("google_wallet_message_500"); } },
    "./update-tags": {}, "@/lib/data/feature-entitlements": { getCafeFeatureCodes: async () => ["loyalty"] },
    "@/lib/platform/feature-gates": { featureCodesAllow: () => true },
    "@/lib/data/loyalty-experience": {},
  };
  const exports = {};
  new Function("require", "exports", source)(name => stubs[name] ?? dependency(name), exports);
  if (previous) await exports.retryWalletNotificationJobs(); else await exports.notifyBrandWalletMembers("brand", "brand", "Title", "Body");
  return { receipts, pushes, notifications, updates };
}
const first = await scenario();
assert.equal(first.receipts.filter(r => r.p_provider === "google").flatMap(r => r.p_cards).length, 1201, "all audience pages are recorded");
assert.deepEqual(first.receipts.filter(r => r.p_provider === "apple").flatMap(r => r.p_cards), ["card-0", "card-1"], "only accepted tokens count, including partial provider success");
assert.equal(first.pushes.filter(t => t === "ok").length, 1, "shared device is pushed once");
assert.equal(first.updates[0].status, "pending", "failed provider remains retryable");
const failed = await scenario({ googleFails: true });
assert.ok(failed.receipts.every(r => r.p_provider === "apple"), "failed Google request never records recipients");
const offline = await scenario({ trackingFails: true });
assert.equal(offline.receipts.length, 0); assert.equal(offline.updates[0].status, "pending", "receipt storage failure is not silent success");
const retry = await scenario({ previous: { google: { status: "accepted", count: 1 }, apple: { status: "failed", count: 0 } } });
assert.equal(retry.notifications.length, 0); assert.ok(retry.receipts.every(r => r.p_provider === "apple"), "accepted historical provider audience is never reconstructed");
console.log("PASS wallet promotion reporting: paginated audience, partial success, failure exclusion, retries and no historical reconstruction; zero external messages");
