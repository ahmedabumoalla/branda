import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const dependency = createRequire(import.meta.url);
function load(relative, stubs, cache = new Map()) {
  if (cache.has(relative)) return cache.get(relative);
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {}; cache.set(relative, exports);
  new Function("require", "exports", code)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      return load(`${name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relative), name)}.ts`, stubs, cache);
    }
    return dependency(name);
  }, exports);
  return exports;
}
const { createBarndaksaQrPayload } = load("lib/loyalty/secure-qr-payload.ts", {});
const cafeId = "rast-cafe", cardId = "card-one", customerId = "customer-one";
const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const reward = (rewardCode, changes = {}) => ({
  id: rewardCode, cafe_id: cafeId, customer_id: customerId, loyalty_card_id: cardId,
  source_type: "loyalty", status: "available", reward_code: rewardCode, reward_title: "Earned coffee",
  issued_at: future(-10), expires_at: future(10), customer_profiles: { full_name: "Test customer" },
  metadata: { termsSnapshot: { terms: "Earned terms" } }, ...changes,
});
function fixture() {
  const state = { authorized: true, entitled: true, slug: "rast", cardAllowed: true, rewardAllowed: true, failQuery: false, queries: [], rpcs: [],
    cards: [{ id: cardId, customer_profile_id: customerId, cafe_id: cafeId, card_code: "CARD123" }],
    rewards: [reward("REWARDLATE"), reward("REWARDFIRST", { expires_at: future(2) })],
  };
  const admin = {
    from(table) {
      const filters = [], orders = []; let limit = Infinity, availableAt;
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        or(value) { assert(value.startsWith("expires_at.is.null,expires_at.gt.")); availableAt = value.split("expires_at.gt.")[1]; return query; },
        order(key, options) { orders.push([key, options]); return query; },
        limit(value) { limit = value; return query; },
        async maybeSingle() {
          state.queries.push({ table, filters, orders, limit });
          if (state.failQuery) return { data: null, error: new Error("Unavailable") };
          let rows = table === "loyalty_cards" ? state.cards : table === "customer_reward_instances" ? state.rewards : [{ cafe_id: cafeId, enabled: true }];
          rows = rows.filter((row) => filters.every(([key, value]) => row[key] === value));
          if (availableAt) rows = rows.filter((row) => row.expires_at === null || row.expires_at > availableAt);
          rows = [...rows].sort((a, b) => {
            for (const [key, options] of orders) {
              if (a[key] === b[key]) continue;
              if (a[key] === null) return options.nullsFirst ? -1 : 1;
              if (b[key] === null) return options.nullsFirst ? 1 : -1;
              return (a[key] < b[key] ? -1 : 1) * (options.ascending ? 1 : -1);
            }
            return 0;
          }).slice(0, limit);
          assert(rows.length <= 1, "Expected a unique or explicitly bounded lookup");
          return { data: rows[0] ?? null, error: null };
        },
      };
      return query;
    },
    async rpc(name, args) {
      state.rpcs.push([name, args]);
      assert.equal(args.p_session_token, "valid-session");
      assert(["preview_loyalty_card", "preview_loyalty_reward"].includes(name), "Inspection must never call a mutation RPC");
      return { data: { ok: name === "preview_loyalty_card" ? state.cardAllowed : state.rewardAllowed }, error: null };
    },
  };
  const stubs = {
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/data/cashier": { requireCashierSessionContext: async () => { if (!state.authorized) throw new Error("No session"); return { cafeId, cafeSlug: state.slug, token: "valid-session" }; } },
    "@/lib/data/rast-loyalty-access": { assertRastLoyaltyEntitlement: async (id) => { assert.equal(id, cafeId); if (!state.entitled) throw new Error("Denied"); } },
    "@/lib/data/operation-events": {}, "@/lib/data/cafes": {},
  };
  return { state, ...load("lib/data/customer-rewards.ts", stubs) };
}
let passed = 0;
async function test(name, run) { try { await run(fixture()); passed++; } catch (error) { throw new Error(name, { cause: error }); } }
for (const input of ["CARD123", " card123 ", createBarndaksaQrPayload("loyalty-card", "CARD123")]) {
  await test("membership resolves one earliest-expiring earned reward", async ({ state, lookupRastCashierReward: lookup }) => {
    const result = await lookup(input);
    assert.equal(result.rewardCode, "REWARDFIRST"); assert.equal(result.canRedeem, true);
    assert.equal(result.metadata.termsSnapshot.terms, "Earned terms");
    const selection = state.queries.find((q) => q.limit === 1);
    for (const filter of [["cafe_id", cafeId], ["loyalty_card_id", cardId], ["customer_id", customerId], ["source_type", "loyalty"], ["status", "available"]]) assert(selection.filters.some((f) => JSON.stringify(f) === JSON.stringify(filter)));
  });
}
for (const changes of [{ status: "redeemed" }, { status: "cancelled" }, { expires_at: future(-1) }, { cafe_id: "foreign" }, { loyalty_card_id: "foreign" }, { customer_id: "foreign" }, { source_type: "experience" }]) {
  await test("unavailable or foreign rewards cannot be selected", async ({ state, lookupRastCashierReward: lookup }) => {
    state.rewards = [reward("REWARD123", changes)]; await assert.rejects(() => lookup("CARD123"));
    assert(!state.rpcs.some(([name]) => name === "preview_loyalty_reward"));
  });
}
for (const changes of [{ authorized: false }, { entitled: false }, { slug: "other" }]) {
  await test("authorization fails before any customer query", async ({ state, lookupRastCashierReward: lookup }) => {
    Object.assign(state, changes); await assert.rejects(() => lookup("CARD123")); assert.equal(state.queries.length, 0);
  });
}
for (const key of ["cardAllowed", "rewardAllowed"]) {
  await test("database preview denial fails closed", async ({ state, lookupRastCashierReward: lookup }) => { state[key] = false; await assert.rejects(() => lookup("CARD123")); });
}
await test("database errors do not fall back to another target", async ({ state, lookupRastCashierReward: lookup }) => { state.failQuery = true; await assert.rejects(() => lookup("CARD123")); assert.equal(state.rpcs.length, 0); });
await test("no-expiry rewards sort after expiring rewards", async ({ state, lookupRastCashierReward: lookup }) => { state.rewards.unshift(reward("PERMANENT", { expires_at: null })); assert.equal((await lookup("CARD123")).rewardCode, "REWARDFIRST"); });
await test("direct reward QR remains supported", async ({ lookupRastCashierReward: lookup }) => { assert.equal((await lookup(createBarndaksaQrPayload("customer-reward", "REWARDLATE"))).rewardCode, "REWARDLATE"); });
await test("foreign direct reward cannot expose customer details", async ({ state, lookupRastCashierReward: lookup }) => {
  state.rewards = [reward("FOREIGN123", { cafe_id: "foreign" })];
  await assert.rejects(() => lookup(createBarndaksaQrPayload("customer-reward", "FOREIGN123")));
  assert(state.queries.every((q) => q.filters.some(([key, value]) => key === "cafe_id" && value === cafeId)));
  assert.equal(state.rpcs.length, 0);
});
for (const input of [createBarndaksaQrPayload("invoice", "CARD123"), createBarndaksaQrPayload("experience-reward", "CARD123"), "BARNDAKSA_QR:v1:broken", "A".repeat(501)]) {
  await test("wrong-kind and malformed inputs fail before database reads", async ({ state, lookupRastCashierReward: lookup }) => { await assert.rejects(() => lookup(input)); assert.equal(state.queries.length, 0); });
}
await test("depleted balance returns no reward", async ({ state, lookupRastCashierReward: lookup }) => { state.rewards = []; await assert.rejects(() => lookup("CARD123"), /لا توجد مكافأة/); });
console.log(`PASS: ${passed} Rast membership/reward lookup, isolation, eligibility, ordering and fail-closed cases.`);
