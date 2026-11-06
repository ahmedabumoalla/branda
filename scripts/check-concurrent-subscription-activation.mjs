import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = ts.transpileModule(fs.readFileSync("lib/payments/subscription-activation.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ enabled = true, activations = [{ activated: true }], activationError = null, invoiceError = null, missingInvoice = false, coupon = "coupon", mailError = null } = {}) {
  const invoice = { id: "new", cafe_id: "brand", plan_id: "menu", platform_coupon_id: coupon };
  const calls = [], queries = [], mails = [], logs = [];
  let clients = 0;
  const admin = {
    from(table) {
      assert.equal(table, "subscriptions");
      const query = { table, filters: [], selection: null };
      queries.push(query);
      const builder = {
        select(value) { query.selection = value; return builder; },
        eq(key, value) { query.filters.push([key, value]); return builder; },
        async maybeSingle() {
          assert.deepEqual(query.filters, [["id", "new"], ["cafe_id", "brand"]], "invoice must be scoped to subscription and brand");
          return { data: missingInvoice ? null : invoice, error: invoiceError };
        },
        update() { assert.fail("subscription writes and cancellations belong inside the atomic RPC"); },
        insert() { assert.fail("no direct subscription or finance writes"); },
        delete() { assert.fail("subscription history must be preserved"); },
      };
      return builder;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "activate_paid_brand_subscription") return { data: activations.shift() ?? { activated: false }, error: activationError };
      assert.equal(name, "increment_platform_coupon_redemption", "finance records belong inside the atomic RPC");
      return { data: null, error: null };
    },
  };
  const stubs = {
    "@/lib/supabase/admin": { createAdminClient: () => { clients++; return admin; } },
    "@/lib/payments/payment-availability": { areOnlinePaymentsEnabled: () => enabled },
    "@/lib/email/subscription-invoice": { sendSubscriptionInvoiceEmail: async data => { mails.push(data); if (mailError) throw mailError; } },
  };
  const exports = {};
  new Function("require", "exports", "console", source)(name => {
    assert.ok(Object.hasOwn(stubs, name), `unexpected dependency ${name}`);
    return stubs[name];
  }, exports, { error: (...args) => logs.push(args) });
  return { invoice, activate: exports.activatePaidSubscription, calls, queries, mails, logs, clients: () => clients };
}

const input = { cafeId: "brand", subscriptionId: "new" };
let passed = 0;
async function test(label, run) { await run(); passed++; console.log(`PASS ${label}`); }
function noPostActivation(context) {
  assert.equal(context.queries.length, 0);
  assert.equal(context.mails.length, 0);
  assert(context.calls.every(call => call.name === "activate_paid_brand_subscription"));
}
await test("disabled gateway never acquires a client or invokes RPC", async () => {
  const context = fixture({ enabled: false });
  assert.equal(await context.activate(input), false);
  assert.equal(context.clients(), 0);
  assert.equal(context.calls.length, 0);
  noPostActivation(context);
});
await test("only literal activated true permits invoice or coupon effects", async () => {
  // Real SQL tests separately cover past_due, foreign brands and replay under locks.
  for (const activation of [{ activated: false }, null, {}, { activated: "true" }, { activated: 1 }]) {
    const context = fixture({ activations: [activation] });
    assert.equal(await context.activate(input), false);
    assert.equal(context.calls.length, 1);
    noPostActivation(context);
  }
});
await test("RPC failure propagates before downstream effects", async () => {
  const failure = new Error("activation failed"), context = fixture({ activationError: failure });
  await assert.rejects(context.activate(input), error => error === failure);
  noPostActivation(context);
});
await test("PayPal details reach atomic RPC before scoped invoice and coupon", async () => {
  const context = fixture();
  const payment = { captureId: "capture", orderId: "order", amount: 129.5, currency: "SAR", paymentMethodLabel: "PayPal card" };
  assert.equal(await context.activate({ ...input, ...payment }), true);
  assert.deepEqual(context.calls, [
    { name: "activate_paid_brand_subscription", args: { p_cafe_id: "brand", p_subscription_id: "new", p_payment: { provider: "paypal", ...payment, paymobTransactionId: null, paymobOrderId: null } } },
    { name: "increment_platform_coupon_redemption", args: { p_coupon_id: "coupon" } },
  ]);
  assert.equal(context.queries.length, 1);
  assert(context.queries[0].selection.includes("cafes(name,owner_email,tax_number,commercial_register)"));
  assert.deepEqual(context.mails, [context.invoice]);
});
await test("Paymob identifiers and default label are preserved without PayPal identifiers", async () => {
  const context = fixture({ coupon: null });
  assert.equal(await context.activate({ ...input, provider: "paymob", paymobTransactionId: "transaction", paymobOrderId: "paymob-order", amount: 0, currency: "SAR" }), true);
  assert.deepEqual(context.calls, [{ name: "activate_paid_brand_subscription", args: {
    p_cafe_id: "brand", p_subscription_id: "new", p_payment: {
      provider: "paymob", paymentMethodLabel: "Paymob", captureId: null, orderId: null,
      amount: 0, currency: "SAR", paymobTransactionId: "transaction", paymobOrderId: "paymob-order",
    },
  } }]);
  assert.equal(context.mails.length, 1);
});
await test("default PayPal null metadata and RPC replay do not repeat invoice or coupon", async () => {
  const context = fixture({ activations: [{ activated: true }, { activated: false }] });
  assert.equal(await context.activate(input), true);
  assert.deepEqual(context.calls[0].args.p_payment, { provider: "paypal", paymentMethodLabel: "PayPal", captureId: null, orderId: null, amount: null, currency: null, paymobTransactionId: null, paymobOrderId: null });
  assert.equal(await context.activate(input), false);
  assert.equal(context.queries.length, 1);
  assert.equal(context.mails.length, 1);
  assert.equal(context.calls.filter(call => call.name === "increment_platform_coupon_redemption").length, 1);
  assert.equal(context.calls.filter(call => call.name === "activate_paid_brand_subscription").length, 2);
});
await test("missing or failed invoice read prevents coupon and mail", async () => {
  for (const missingInvoice of [true, false]) {
    const failure = missingInvoice ? null : new Error("invoice read failed");
    const context = fixture({ missingInvoice, invoiceError: failure });
    if (failure) await assert.rejects(context.activate(input), error => error === failure);
    else assert.equal(await context.activate(input), false);
    assert.equal(context.queries.length, 1);
    assert.equal(context.calls.length, 1);
    assert.equal(context.mails.length, 0);
  }
});
await test("email failure cannot undo or retry committed activation", async () => {
  const failure = new Error("mail unavailable"), context = fixture({ coupon: null, mailError: failure });
  assert.equal(await context.activate(input), true);
  assert.equal(context.calls.length, 1);
  assert.equal(context.mails.length, 1);
  assert.deepEqual(context.logs, [["[activatePaidSubscription:invoice]", failure]]);
});
console.log(`Atomic payment activation: ${passed} groups passed`);
