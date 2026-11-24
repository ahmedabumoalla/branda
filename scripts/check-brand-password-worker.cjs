const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
const { compare } = require("bcryptjs");
const ts = require("typescript");

function load(file, overrides) {
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exported = {};
  new Function("require", "exports", source)(name => {
    if (name === "server-only") return {};
    if (Object.hasOwn(overrides, name)) return overrides[name];
    return require(name);
  }, exported);
  return exported;
}

async function main() {
  const secrets = load("lib/auth/brand-welcome-secret.ts", {
    "@/lib/barndaksa/env": { getSupabaseServiceRoleKey: () => "local synthetic encryption fixture" },
  });
  const id = randomUUID();
  const token = randomUUID();
  const queued = { id, status: "queued", attempt: 0, nextAttemptAt: new Date().toISOString() };
  let claim, enclosed, hash, sentPassword, sendCount = 0, canSend = true, result = "accepted", retries = 0;
  const callbacks = [], receipts = [], lanes = [];
  const worker = load("lib/data/brand-password-delivery.ts", {
    "next/server": { after: fn => callbacks.push(fn) },
    "@/lib/auth/brand-welcome-secret": secrets,
    "@/lib/supabase/admin": { createAdminClient: () => ({
      rpc: async (name, args) => {
        switch (name) {
          case "brand_password_reset_enqueue":
            enclosed = args.p_ciphertext;
            hash = args.p_password_hash;
            assert.deepEqual(Object.keys(args).sort(), ["p_actor","p_cafe","p_ciphertext","p_password_hash","p_request"]);
            return { data: queued };
          case "brand_password_reset_claim":
            return { data: claim && { id, claimToken: token, phone: "966500000000", ciphertext: enclosed, ...claim } };
          case "brand_password_reset_can_send":
            assert.deepEqual(args, { p_request: id, p_claim: token });
            return { data: canSend };
          case "brand_password_reset_finish":
            receipts.push(args);
            return { error: retries-- > 0 ? { code: "unavailable" } : null };
          case "brand_password_reset_status":
            return { data: { ...queued, status: "sent", attempt: 4, nextAttemptAt: null } };
          default: throw Error("Unexpected RPC");
        }
      },
    }) },
    "@/lib/whatsapp/green-api": { sendBrandPasswordAttempt: async input => {
      if (!(await input.authorize())) return { status: "rejected" };
      lanes.push(input.lane);
      sendCount++;
      sentPassword = input.password;
      if (result === "throw") throw Error("simulated lost response");
      return { status: result };
    } },
  });

  const status = await worker.requestBrandPasswordDelivery(randomUUID(), id, randomUUID());
  assert.deepEqual(status, { id, state: "queued", lane: "notifications", attempt: 1, nextAttemptAt: queued.nextAttemptAt });
  assert.equal(callbacks.length, 1);
  claim = { attempt: 1 };
  retries = 2;
  await callbacks[0]();
  assert.equal(sendCount, 1);
  assert.equal(receipts.length, 3);
  assert(receipts.every(r => r.p_outcome === "accepted" && r.p_claim === token));
  assert.match(sentPassword, /^[1-9][0-9]{7}$/, "Temporary password must contain exactly eight digits");
  assert(await compare(sentPassword, hash));
  assert(!enclosed.includes(sentPassword));
  assert.throws(() => secrets.openWelcomePassword(enclosed, randomUUID()));
  result = "rejected";
  for (let attempt = 2; attempt <= 9; attempt++) {
    claim = { attempt };
    await worker.runBrandPasswordAttempt(id);
  }
  assert.deepEqual(lanes, [...Array(3).fill("notifications"), ...Array(3).fill("primary"), ...Array(3).fill("standby")]);
  result = "throw";
  await worker.runBrandPasswordAttempt(id);
  assert.equal(receipts.at(-1).p_outcome, "unknown");
  canSend = false;
  const prior = sendCount;
  await worker.runBrandPasswordAttempt(id);
  assert.equal(receipts.at(-1).p_outcome, "rejected");
  enclosed = "invalid-envelope";
  await worker.runBrandPasswordAttempt(id);
  assert.equal(receipts.at(-1).p_outcome, "abort");
  assert.equal(sendCount, prior);
  claim = null;
  assert.deepEqual(await worker.runBrandPasswordJobs(), { processed: 0 });
  assert.deepEqual(await worker.getBrandPasswordDelivery(randomUUID(), randomUUID()), {
    id, state: "sent", lane: "primary", attempt: 1, nextAttemptAt: null,
  });

  const route = load("app/api/admin/brand-password/jobs/route.ts", {
    "@/lib/data/brand-password-delivery": worker,
  });
  const secret = randomUUID();
  process.env.CRON_SECRET = secret;
  for (const authorization of ["", "Bearer " + randomUUID()]) {
    assert.equal((await route.GET(new Request("https://example.test", { headers: { authorization } }))).status, 401);
  }
  const valid = await route.GET(new Request("https://example.test", { headers: { authorization: "Bearer " + secret } }));
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { processed: 0 });
  const crons = JSON.parse(readFileSync("vercel.json")).crons;
  assert(crons.some(c => c.path === "/api/admin/brand-password/jobs" && c.schedule === "* * * * *"));
  console.log("PASS brand password generation, bound encryption, bcrypt, sender progression, authorization, uncertain outcome, acknowledgement retries and protected cron");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
