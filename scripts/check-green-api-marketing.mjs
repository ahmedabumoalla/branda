import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const brandId = "00000000-0000-4000-8000-000000000001";
const token = "mock-private-instance-token";
const credentials = { idInstance: "7103999999", apiTokenInstance: token, apiUrl: "https://7103.api.greenapi.com" };
const webhook = { webhookUrl: "https://barndaksa.com/api/webhooks/marketing/connection-id", webhookToken: "a".repeat(64) };
const instance = { idInstance: Number(credentials.idInstance), apiTokenInstance: token, name: `branda-marketing-${brandId}`, tariff: "PARTNER", isPartner: true, deleted: false, isExpired: false };
function harness(reply, envOverrides = {}) {
  const calls = [], cache = new Map();
  const env = { GREEN_API_PARTNER_TOKEN: "gac.mock-partner-secret", GREEN_API_PARTNER_API_URL: "https://api.greenapi.com", GREEN_API_ID_INSTANCE: "7103000000", ...envOverrides };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function("require", "exports", "process", "fetch", js)(name => {
      if (name === "server-only") return {};
      if (name.startsWith("@/")) return load(path.resolve(`${name.slice(2)}.ts`));
      throw new Error(`Unexpected module: ${name}`);
    }, exports, { env }, async (url, init) => {
      assert.equal(init.cache, "no-store");
      assert.equal(init.redirect, "error");
      assert.ok(init.signal instanceof AbortSignal);
      const call = { url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined };
      calls.push(call);
      const payload = await reply(call, calls.length);
      return payload instanceof Response ? payload : Response.json(payload);
    });
    return exports;
  }
  return { ...load(path.resolve("lib/whatsapp/green-api-marketing.ts")), calls };
}
let checks = 0;
async function test(run) { await run(); checks++; }
function errorIs(uncertain, code) { return error => { assert.equal(error.uncertain, uncertain); if (code) assert.ok(error.code.endsWith(code)); assert.ok(!error.stack.includes(token)); assert.equal(error.cause, undefined); return true; }; }

await test(async () => {
  for (const denied of [new Response("Unauthorized", { status: 401 }), { code: 401 }]) {
    const h = harness(call => call.url.startsWith(credentials.apiUrl) ? denied : { type: "qrCode", message: "aGVsbG8=" });
    assert.equal((await h.getGreenApiMarketingQr(credentials)).type, "qrCode");
    assert.equal(h.calls.length, 2);
    assert(h.calls[1].url.startsWith("https://api.greenapi.com/waInstance"));
    assert(h.calls.every(call => call.method === "GET"));
  }
  const denied = harness(() => new Response("Unauthorized", { status: 401 }));
  await assert.rejects(() => denied.getGreenApiMarketingQr(credentials), errorIs(false, "401"));
  assert.equal(denied.calls.length, 2, "universal fallback is bounded to one read retry");
  const mutation = harness(() => new Response("Unauthorized", { status: 401 }));
  await assert.rejects(() => mutation.configureGreenApiMarketingWebhook(credentials, webhook), errorIs(false, "401"));
  assert.equal(mutation.calls.length, 1, "mutations never use the read fallback");
});

await test(async () => {
  const h = harness(call => call.url.includes("getInstances") ? [] : { ...credentials, idInstance: Number(credentials.idInstance) });
  assert.deepEqual(await h.provisionGreenApiMarketingInstance({ brandId, ...webhook, allowCreate: true }), { credentials, reused: false });
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].method, "POST");
  assert.equal(h.calls[1].body.name, instance.name);
  assert.equal(h.calls[1].body.webhookUrlToken, `Bearer ${webhook.webhookToken}`);
  assert.equal(h.calls[1].body.delaySendMessagesMilliseconds, 60000);
  assert.equal(h.calls[1].body.incomingWebhook, "yes");
  assert.equal(h.calls[1].body.outgoingWebhook, "yes");
  assert.equal(h.calls[1].body.outgoingAPIMessageWebhook, "yes");
  assert.equal(h.calls[1].body.outgoingMessageWebhook, "no");
});
await test(async () => {
  const h = harness(() => [instance]);
  const result = await h.provisionGreenApiMarketingInstance({ brandId, ...webhook, allowCreate: false });
  assert.equal(result.reused, true);
  assert.equal(result.credentials.idInstance, credentials.idInstance);
  assert.equal(result.credentials.apiUrl, "https://api.greenapi.com", "recovery uses documented universal host when inventory omits apiUrl");
  assert.ok(h.calls.every(call => call.method === "GET"));
  const empty = harness(() => []);
  await assert.rejects(() => empty.provisionGreenApiMarketingInstance({ brandId, ...webhook, allowCreate: false }), errorIs(true, "PROVISION_UNCERTAIN"));
  assert.equal(empty.calls.length, 1, "uncertain provisioning cannot create a second billed instance");
});
await test(async () => {
  for (const rows of [[instance, instance], [{ ...instance, isPartner: false }], [{ ...instance, isExpired: true }], [{ ...instance, apiTokenInstance: null }]]) {
    const h = harness(() => rows);
    await assert.rejects(() => h.provisionGreenApiMarketingInstance({ brandId, ...webhook, allowCreate: true }));
    assert.equal(h.calls.length, 1);
  }
});
await test(async () => {
  const h = harness(call => { if (call.url.includes("getInstances")) return []; throw new Error(`${call.url} ${token}`); });
  await assert.rejects(() => h.provisionGreenApiMarketingInstance({ brandId, ...webhook, allowCreate: true }), errorIs(true));
  assert.equal(h.calls.length, 2, "create POST is never automatically retried");
  const rejected = harness(call => call.url.includes("getInstances") ? [] : { code: 401, description: token });
  await assert.rejects(() => rejected.provisionGreenApiMarketingInstance({ brandId, ...webhook, allowCreate: true }), errorIs(false, "401"));
});
await test(async () => {
  for (const apiUrl of ["http://api.greenapi.com", "https://7103.api.greenapi.com.attacker.test", "https://api.greenapi.com/?q=secret", "https://user:pass@api.greenapi.com", "https://api.greenapi.com:8443", "https://localhost", "https://api.greenapi.com/path"]) {
    const h = harness(() => { throw new Error("Must not fetch"); });
    await assert.rejects(() => h.getGreenApiMarketingState({ ...credentials, apiUrl }));
    assert.equal(h.calls.length, 0);
  }
  const operational = harness(() => { throw new Error("Must not fetch"); });
  await assert.rejects(() => operational.sendGreenApiMarketingMessage({ ...credentials, idInstance: "7103000000" }, { phone: "966500000001", message: "Example" }), errorIs(false, "OPERATIONAL_INSTANCE_FORBIDDEN"));
  assert.equal(operational.calls.length, 0);
});
await test(async () => {
  for (const state of [null, "notAuthorized", "authorized", "blocked", "starting", "suspended"]) {
    const h = harness(() => state === null ? null : { stateInstance: state });
    assert.equal(await h.getGreenApiMarketingState(credentials), state);
  }
  const unknown = harness(() => ({ stateInstance: token }));
  await assert.rejects(() => unknown.getGreenApiMarketingState(credentials), errorIs(false, "STATE_INVALID"));
  const qr = harness(() => ({ type: "qrCode", message: "aGVsbG8=" }));
  assert.deepEqual(await qr.getGreenApiMarketingQr(credentials), { type: "qrCode", message: "aGVsbG8=" });
  const qrError = harness(() => ({ type: "error", message: token }));
  assert.deepEqual(await qrError.getGreenApiMarketingQr(credentials), { type: "error", message: "" });
});
await test(async () => {
  const h = harness(() => ({ stateInstance: "authorized", phone: "+966500000001", avatar: "private", chatId: "123@lid" }));
  assert.deepEqual(await h.getGreenApiMarketingAccount(credentials), { phone: "966500000001" });
  const unauthorized = harness(() => ({ stateInstance: "notAuthorized", phone: "" }));
  await assert.rejects(() => unauthorized.getGreenApiMarketingAccount(credentials), errorIs(false, "ACCOUNT_NOT_AUTHORIZED"));
});
await test(async () => {
  const h = harness(() => ({ idMessage: "MOCK_MESSAGE_ID" }));
  assert.deepEqual(await h.sendGreenApiMarketingMessage(credentials, { phone: "966500000001", message: "Example" }), { providerMessageId: "MOCK_MESSAGE_ID" });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, `${credentials.apiUrl}/waInstance${credentials.idInstance}/sendMessage/${token}`);
  assert.deepEqual(h.calls[0].body, { chatId: "966500000001@c.us", message: "Example", linkPreview: false });
  for (const input of [{ phone: "9665@g.us", message: "Example" }, { phone: "966500000001", message: " " }, { phone: "966500000001", message: "a".repeat(20001) }]) {
    await assert.rejects(() => h.sendGreenApiMarketingMessage(credentials, input), errorIs(false, "MESSAGE_INVALID"));
  }
  assert.equal(h.calls.length, 1);
});
await test(async () => {
  for (const response of [new Response("failure", { status: 503 }), new Response("failure", { status: 408 }), new Response("invalid-json"), {}, { code: 500 }, { code: 0 }, { code: 200 }, { idMessage: null }]) {
    const h = harness(() => response);
    await assert.rejects(() => h.sendGreenApiMarketingMessage(credentials, { phone: "966500000001", message: "Example" }), errorIs(true));
    assert.equal(h.calls.length, 1);
  }
  const lost = harness(call => { throw new Error(call.url); });
  await assert.rejects(() => lost.sendGreenApiMarketingMessage(credentials, { phone: "966500000001", message: "Example" }), errorIs(true));
  for (const response of [new Response(token, { status: 429 }), { code: 401, description: token }]) {
    const h = harness(() => response);
    await assert.rejects(() => h.sendGreenApiMarketingMessage(credentials, { phone: "966500000001", message: "Example" }), errorIs(false));
  }
});
await test(async () => {
  const h = harness(() => ({ saveSettings: true }));
  await h.configureGreenApiMarketingWebhook(credentials, webhook);
  assert.equal(h.calls[0].body.webhookUrlToken, `Bearer ${webhook.webhookToken}`);
  const failed = harness(() => ({ saveSettings: false }));
  await assert.rejects(() => failed.configureGreenApiMarketingWebhook(credentials, webhook), errorIs(true));
});
await test(async () => {
  const h = harness(call => {
    if (call.url.includes("getInstances")) return [instance];
    if (call.url.includes("clearMessagesQueue")) return { isCleared: true };
    if (call.url.includes("getStateInstance")) return { stateInstance: "authorized" };
    if (call.url.includes("logout")) return { isLogout: true };
    if (call.url.includes("deleteInstanceAccount")) return { deleteInstanceAccount: true };
    throw new Error("Unexpected method");
  });
  await h.deleteGreenApiMarketingInstance(credentials);
  assert.deepEqual(h.calls.map(call => new URL(call.url).pathname.split("/")[2]), ["getInstances", "clearMessagesQueue", "getStateInstance", "logout", "deleteInstanceAccount"]);
  assert.deepEqual(h.calls.at(-1).body, { idInstance: Number(credentials.idInstance) });
  const alreadyDeleted = harness(() => [{ ...instance, deleted: true }]);
  await alreadyDeleted.deleteGreenApiMarketingInstance(credentials);
  assert.equal(alreadyDeleted.calls.length, 1);
});
await test(async () => {
  const h = harness(call => call.url.includes("getInstances") ? [instance] : { isCleared: false });
  await assert.rejects(() => h.deleteGreenApiMarketingInstance(credentials), errorIs(true, "QUEUE_NOT_CLEARED"));
  assert.equal(h.calls.length, 2, "failed queue clearing cannot log out or delete instance");
  const wrong = harness(() => [{ ...instance, name: "Existing operational account" }]);
  await assert.rejects(() => wrong.deleteGreenApiMarketingInstance(credentials), errorIs(false, "DELETE_FORBIDDEN"));
  assert.equal(wrong.calls.length, 1);
});
await test(async () => {
  const media = { phone: "966500000001", caption: "Caption", url: "https://project.supabase.co/storage/v1/object/sign/marketing-media/brand/ready/file.mp4?token=signed", fileName: "campaign.mp4" };
  const h = harness(() => ({ idMessage: "media-one" }), { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" });
  assert.equal((await h.sendGreenApiMarketingMedia(credentials, media)).providerMessageId, "media-one");
  assert.equal(h.calls.length, 1);assert(h.calls[0].url.includes('/sendFileByUrl/'));
  assert.deepEqual(h.calls[0].body, { chatId: "966500000001@c.us", urlFile: media.url, fileName: "campaign.mp4", caption: "Caption" });
  for (const changes of [{ url: 'https://evil.test/file.mp4' },{ url: media.url.replace('/object/sign/','/object/public/') },{ caption: 'x'.repeat(1025) },{ fileName: '../secret.txt' }]) await assert.rejects(()=>h.sendGreenApiMarketingMedia(credentials,{...media,...changes}));
  assert.equal(h.calls.length, 1);
  const uncertain=harness(()=>{throw new Error('network');},{NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co'});
  await assert.rejects(()=>uncertain.sendGreenApiMarketingMedia(credentials,media),errorIs(true,'REQUEST_FAILED'));assert.equal(uncertain.calls.length,1);
});
console.log(`PASS GREEN-API marketing provider: ${checks} groups; all requests mocked, zero live sends/provision/deletions`);
