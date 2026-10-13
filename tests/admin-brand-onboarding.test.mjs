import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { z } from "zod";
import * as crypto from "node:crypto";

const base = new URL("../", import.meta.url);
const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, base), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function module(path, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(compile(path), { exports, Buffer, Date, Error, ...globals, require: name => {
    if (name === "server-only") return {};
    assert(name in imports, name); return imports[name];
  } });
  return exports;
}
const phone = module("lib/auth/phone-utils.ts", {});
const schema = module("lib/platform/brand-onboarding.ts", { zod: { z }, "@/lib/auth/phone-utils": phone });
const secrets = module("lib/auth/brand-welcome-secret.ts", { "node:crypto": crypto, "@/lib/barndaksa/env": { getSupabaseServiceRoleKey: () => "synthetic-server-secret-not-a-real-key" } });
const id = "f0000000-0000-4000-8000-000000000301";
const cafeId = "f0000000-0000-4000-8000-000000000302";
const input = { requestId: id, brandName: "Fixture", brandNameEn: "Fixture", slug: "fixture", category: "cafes_coffee", ownerName: "Owner", phone: "0500000099", email: "", password: "SyntheticP@ss8" };

test("credential encryption is randomized, tenant-bound and authenticated", () => {
  const a = secrets.sealWelcomePassword(input.password, id), b = secrets.sealWelcomePassword(input.password, id);
  assert.notEqual(a, b); assert(!a.includes(input.password));
  assert.equal(secrets.openWelcomePassword(a, id), input.password);
  assert.throws(() => secrets.openWelcomePassword(a, cafeId));
  const parts = a.split("."); parts[3] = "AAAA" + parts[3].slice(4);
  assert.throws(() => secrets.openWelcomePassword(parts.join("."), id));
});
test("phone normalization and account validation reject invalid input", () => {
  assert.equal(schema.adminBrandAccountSchema.parse(input).phone, "966500000099");
  for (const change of [{ phone: "123" }, { password: "short" }, { slug: "../admin" }, { category: "unknown" }]) {
    assert.equal(schema.adminBrandAccountSchema.safeParse({ ...input, ...change }).success, false);
  }
});

function service({ authorized = true, sendError = null, sent = false, finalizeFailures = 0, createError = false } = {}) {
  const calls = []; let preparedCount = 0, finishCount = 0;
  const db = { rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === "admin_prepare_brand_account") return { data: { proof: "proof", cafeId: preparedCount++ ? cafeId : null }, error: null };
    if (name === "admin_claim_brand_welcome") return { data: { sent, requestId: id, phone: "966500000099", brandName: "Fixture", ciphertext: secrets.sealWelcomePassword(input.password, id) }, error: null };
    if (name === "admin_finish_brand_welcome") return { error: finishCount++ < finalizeFailures ? { message: "temporary" } : null };
    if (name === "admin_fail_brand_welcome") return { error: null };
    throw Error(name);
  }, auth: { admin: { createUser: async args => { calls.push({ name: "createUser", args }); return { data: { user: { id } }, error: createError ? Error("network ambiguity") : null }; } } } };
  const api = module("lib/data/admin-brand-onboarding.ts", {
    "node:crypto": crypto, zod: { z }, "@/lib/platform/brand-onboarding": schema, "@/lib/auth/brand-welcome-secret": secrets,
    "@/lib/data/cafes": { requirePlatformAdmin: async () => { if (!authorized) throw Error("forbidden"); return { id: "admin-fixture" }; } },
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/whatsapp/green-api": { isGreenApiConfigured: () => true, sendGreenApiOwnerWelcome: async args => {
      calls.push({ name: "send", args }); if (sendError) throw Error(sendError); return { providerMessageId: "provider-fixture" };
    } },
  });
  return { api, calls };
}
test("authorization precedes account creation and delivery", async () => {
  const { api, calls } = service({ authorized: false });
  await assert.rejects(api.createAdminBrandAccount(input), /forbidden/);
  await assert.rejects(api.sendBrandOwnerWelcome(cafeId), /forbidden/);
  assert.equal(calls.length, 0);
});
test("creation provisions phone/password without sending or starting the clock", async () => {
  const { api, calls } = service();
  assert.equal(await api.createAdminBrandAccount(input), cafeId);
  assert.deepEqual(calls.map(c => c.name), ["admin_prepare_brand_account", "createUser", "admin_prepare_brand_account"]);
  const auth = calls[1].args;
  assert.equal(auth.phone, "+966500000099"); assert.equal(auth.password, input.password);
  assert(!JSON.stringify(calls[0].args).includes(input.password));
  assert.equal(auth.app_metadata.admin_brand_onboarding_id, id);
});
test("ambiguous Auth response recovers existing brand without duplicate create", async () => {
  const { api, calls } = service({ createError: true });
  assert.equal(await api.createAdminBrandAccount(input), cafeId);
  assert.equal(calls.filter(c => c.name === "createUser").length, 1);
});
for (const code of ["OWNER_WELCOME_REJECTED", "timeout"]) test(`failed send ${code} never starts trial`, async () => {
  const { api, calls } = service({ sendError: code });
  await assert.rejects(api.sendBrandOwnerWelcome(cafeId));
  assert(!calls.some(c => c.name === "admin_finish_brand_welcome"));
  assert.equal(calls.at(-1).args.p_uncertain, code !== "OWNER_WELCOME_REJECTED");
});
test("acknowledgement retries do not send a second message", async () => {
  const { api, calls } = service({ finalizeFailures: 2 });
  await api.sendBrandOwnerWelcome(cafeId);
  assert.equal(calls.filter(c => c.name === "send").length, 1);
  assert.equal(calls.filter(c => c.name === "admin_finish_brand_welcome").length, 3);
  assert.equal(calls.find(c => c.name === "send").args.password, input.password);
});
test("already notified brand does not resend or reset trial", async () => {
  const { api, calls } = service({ sent: true }); await api.sendBrandOwnerWelcome(cafeId);
  assert.deepEqual(calls.map(c => c.name), ["admin_claim_brand_welcome"]);
});
test("actual provider payload is short and contains exact login links and phone", async () => {
  let body;
  const provider = module("lib/whatsapp/green-api.ts", {}, { process: { env: { GREEN_API_API_URL: "https://example.invalid", GREEN_API_ID_INSTANCE: "fixture", GREEN_API_API_TOKEN_INSTANCE: "fixture" } }, AbortSignal,
    fetch: async (_, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ idMessage: "synthetic" }) }; },
  });
  await provider.sendGreenApiOwnerWelcome({ phone: "966500000099", brandName: "Fixture", password: input.password });
  assert.equal(body.chatId, "966500000099@c.us"); assert.equal(body.linkPreview, false);
  assert(body.message.includes("https://barndaksa.com/login")); assert(body.message.includes(input.password));
  assert.equal(body.message.split("\n").length, 6);
});
test("prepared trial has access but no displayed start or expiry", () => {
  const active = module("lib/platform/active-subscription.ts", {});
  const summary = module("lib/platform/admin-subscription-status.ts", { "@/lib/platform/active-subscription": active });
  const row = { status: "trialing", started_at: "2026-10-01T00:00:00Z", expires_at: null, platform_plans: { active: true }, activation_source: "admin_prepared_trial" };
  const result = summary.adminSubscriptionSummary([row], Date.parse("2027-10-01T00:00:00Z"));
  assert.equal(result.hasActivePlan, true); assert.equal(result.trialAwaitingDelivery, true);
  assert.equal(result.planStartedAt, null); assert.equal(result.planExpiresAt, null);
});
