import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = ts.transpileModule(fs.readFileSync("lib/payments/subscription-activation.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ enabled = true, targetStatus = "past_due", targetCafe = "brand", failActivation = false } = {}) {
  const rows = [
    { id: "new", cafe_id: targetCafe, plan_id: "menu", status: targetStatus },
    { id: "old", cafe_id: "brand", plan_id: "menu", status: "active" },
    { id: "loyalty", cafe_id: "brand", plan_id: "loyalty", status: "active" },
    { id: "other-brand", cafe_id: "other", plan_id: "menu", status: "active" },
  ];
  let writes = 0, mails = 0;
  const rpcCalls = [];
  const admin = {
    from(table) {
      assert.equal(table, "subscriptions");
      let payload;
      const predicates = [];
      const execute = () => {
        if (failActivation && payload.status === "active") return { data: null, error: new Error("activation failed") };
        const matches = rows.filter(row => predicates.every(predicate => predicate(row)));
        for (const row of matches) { Object.assign(row, payload); writes++; }
        return { data: matches[0] ?? null, error: null };
      };
      const builder = {
        update(value) { payload = value; return builder; },
        eq(key, value) { predicates.push(row => row[key] === value); return builder; },
        neq(key, value) { predicates.push(row => row[key] !== value); return builder; },
        in(key, values) { predicates.push(row => values.includes(row[key])); return builder; },
        select() { return builder; },
        async maybeSingle() { return execute(); },
        then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
      };
      return builder;
    },
    async rpc(name) { rpcCalls.push(name); return { error: null }; },
  };
  const stubs = {
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/payments/payment-availability": { areOnlinePaymentsEnabled: () => enabled },
    "@/lib/email/subscription-invoice": { sendSubscriptionInvoiceEmail: async () => { mails++; } },
  };
  const exports = {};
  new Function("require", "exports", source)(name => {
    assert.ok(Object.hasOwn(stubs, name), `unexpected dependency ${name}`);
    return stubs[name];
  }, exports);
  return { rows, activate: exports.activatePaidSubscription, counts: () => ({ writes, mails, rpcCalls }) };
}

const input = { cafeId: "brand", subscriptionId: "new" };
for (const options of [{ enabled: false }, { targetStatus: "active" }, { targetStatus: "cancelled" }, { targetCafe: "other" }]) {
  const context = fixture(options);
  assert.equal(await context.activate(input), false);
  assert.equal(context.counts().writes, 0, "unvalidated/replayed payment never cancels subscriptions");
  assert.equal(context.counts().mails, 0);
}
const failed = fixture({ failActivation: true });
await assert.rejects(failed.activate(input), /activation failed/);
assert.equal(failed.counts().writes, 0, "activation failure preserves all existing subscriptions");
const success = fixture();
assert.equal(await success.activate(input), true);
assert.equal(success.rows.find(row => row.id === "new").status, "active");
assert.equal(success.rows.find(row => row.id === "old").status, "cancelled");
assert.equal(success.rows.find(row => row.id === "loyalty").status, "active");
assert.equal(success.rows.find(row => row.id === "other-brand").status, "active");
assert.deepEqual(success.counts(), { writes: 2, mails: 1, rpcCalls: ["record_subscription_finance_distribution"] });
assert.equal(await success.activate(input), false);
assert.equal(success.counts().writes, 2, "duplicate callback does not mutate unrelated active subscriptions");
console.log("PASS payment activation: disabled gateway, invalid/replayed/foreign target, failed activation and same-package-only replacement");
