import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
function load(file, stubs) {
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", output)(name => {
    if (name in stubs) return stubs[name];
    return new Proxy({}, { get: (_, key) => () => { throw new Error(`Unexpected provider/database call: ${name}.${String(key)}`); } });
  }, exports);
  return exports;
}
const previous = process.env.ONLINE_PAYMENTS_ENABLED;
try {
  const availability = load("lib/payments/payment-availability.ts", { "server-only": {} });
  for (const value of [undefined, "false", "1", "true"]) {
    if (value === undefined) delete process.env.ONLINE_PAYMENTS_ENABLED;
    else process.env.ONLINE_PAYMENTS_ENABLED = value;
    assert.equal(availability.areOnlinePaymentsEnabled(), value === "true");
  }
} finally {
  if (previous === undefined) delete process.env.ONLINE_PAYMENTS_ENABLED;
  else process.env.ONLINE_PAYMENTS_ENABLED = previous;
}
for (const route of ["create-order", "paymob/create-intention", "capture-order", "return"]) {
  const handler = load(`app/api/payments/subscription/${route}/route.ts`, {
    "@/lib/payments/payment-availability": { areOnlinePaymentsEnabled: () => false },
    "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }), redirect: url => ({ redirect: url.toString() }) } },
  });
  const result = await (handler.POST ?? handler.GET)(new Request("https://barndaksa.com/api/payments/subscription/test"));
  if (route === "return") assert.equal(result.redirect, "https://barndaksa.com/dashboard/subscription?payment=bank_transfer");
  else assert.equal(result.status, 503);
}
console.log("PASS bank-only checkout: disabled gateway routes make zero provider/auth/database calls; explicit flag opt-in only.");
