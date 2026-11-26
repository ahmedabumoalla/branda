const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function load(file, dependencies, env, fetch) {
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", "process", "fetch", source)(name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error("Unexpected dependency " + name);
  }, exports, { env }, fetch);
  return exports;
}

async function main() {
  const profile = load("lib/commerce/meram-profile.ts", {}, {});
  const { MERAM_CAFE_ID } = profile;
  const other = "11111111-1111-4444-8888-111111111111";
  const env = {
    BRANDA_ACCESS_MESSAGES_ONLY: "true",
    GREEN_API_ID_INSTANCE: "111", GREEN_API_API_URL: "https://1100.api.greenapi.com", GREEN_API_API_TOKEN_INSTANCE: "fixture-primary",
  };
  const dedicated = { idInstance: "555", apiUrl: "https://7700.api.greenapi.com", apiTokenInstance: "fixture-dedicated" };
  let selected = dedicated;
  let providerRefuses = false;
  const posts = [];
  const transport = load("lib/whatsapp/green-api.ts", {
    "server-only": {}, "@/lib/commerce/meram-profile": profile,
    "@/lib/auth/brand-phone": { canonicalBrandMobile: /^9665\d{8}$/ },
    "@/lib/cashier/guide": {}, "@/lib/whatsapp/owner-guide": {},
    "@/lib/whatsapp/owner-guide-delivery": {}, "@/lib/whatsapp/notification-sender": {},
    "@/lib/whatsapp/customer-routing": {
      async selectVerifiedBrandWhatsAppSender(id) { assert.equal(id, MERAM_CAFE_ID); return selected; },
    },
  }, env, async (url, init) => {
    if (url.includes("/getStateInstance/")) return Response.json({ stateInstance: "authorized" });
    assert.equal(init.method, "POST");
    posts.push(new URL(url));
    return providerRefuses ? new Response(null, { status: 503 }) : Response.json({ idMessage: "accepted" });
  });

  const text = { phone: "966500000000", message: "test" };
  const pdf = { ...text, invoiceNumber: 1, pdf: new TextEncoder().encode("%PDF-fixture") };
  const notices = [
    () => transport.sendGreenApiFinanceShiftAlert(text, MERAM_CAFE_ID),
    () => transport.sendGreenApiPagerMessage(text, MERAM_CAFE_ID),
    () => transport.sendGreenApiMenuFeedback({ recipient: text.phone, rating: 4, notes: "", brandName: "test" }, MERAM_CAFE_ID),
    () => transport.sendGreenApiFinanceReceipt(pdf, MERAM_CAFE_ID),
    async () => transport.sendGreenApiCustomerMessage(await transport.selectOperationalDeliveryConfig(MERAM_CAFE_ID), text),
  ];
  for (const notice of notices) await notice();
  assert.equal(posts.length, notices.length);
  assert(posts.every(p => p.pathname.startsWith("/waInstance555/")));
  assert(posts.every(p => p.hostname === (p.pathname.includes("sendFileByUpload") ? "7700.media.greenapi.com" : "7700.api.greenapi.com")));

  const staff = { ...text, fullName: "Test", brandName: "Test", slug: "test", password: "fixture" };
  await assert.rejects(() => transport.sendGreenApiSalesCashierWelcome(staff, MERAM_CAFE_ID), /PAUSED/);
  await assert.rejects(() => transport.sendGreenApiLinkedSalesCashierWelcome(staff, MERAM_CAFE_ID), /PAUSED/);
  await assert.rejects(() => transport.sendGreenApiCashierWelcome({ ...staff, phone: "+" + text.phone }, MERAM_CAFE_ID), /PAUSED/);
  await assert.rejects(() => transport.sendGreenApiFinanceShiftAlert(text, other), /PAUSED/);
  for (const invalid of [null, { ...dedicated, idInstance: "111" }]) {
    selected = invalid;
    for (const notice of notices) await assert.rejects(notice, /BRAND_WHATSAPP_UNAVAILABLE/);
  }
  selected = dedicated;
  env.GREEN_API_TEMPORARY_BACKUP_ONLY = "true";
  for (const notice of notices) await assert.rejects(notice, /PAUSED/);
  assert.equal(posts.length, notices.length);
  delete env.GREEN_API_TEMPORARY_BACKUP_ONLY;
  providerRefuses = true;
  assert.equal((await transport.sendGreenApiFinanceReceipt(pdf, MERAM_CAFE_ID)).status, "unknown");
  assert.equal(posts.length, notices.length + 1);
  providerRefuses = false;
  env.BRANDA_ACCESS_MESSAGES_ONLY = "false";
  await transport.sendGreenApiFinanceShiftAlert(text, other);
  assert(posts.at(-1).pathname.startsWith("/waInstance111/"));
  console.log("PASS Meram operational texts and PDF, exclusive failure handling, cashier pause and other-brand routing (mock provider)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
