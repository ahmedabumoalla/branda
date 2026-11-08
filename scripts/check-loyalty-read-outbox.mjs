import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
function load(relative) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", output)(name => load(path.join(path.dirname(relative), `${name}.ts`)), exports);
  return exports;
}
const { createReadOutbox, createIndexedReadStore, readScopeKey } = load("lib/loyalty/read-outbox.ts");
const { createBarndaksaQrPayload } = load("lib/loyalty/secure-qr-payload.ts");
const scope = { cafeId: "cafe-a", cashierId: "cashier-a" };
let now = Date.parse("2026-11-08T12:00:00Z"), serial = 0;
function memoryStore() {
  const data = new Map();
  return { data, async change(scope, change) { const next = change(structuredClone(data.get(scope) ?? [])); data.set(scope, structuredClone(next.rows)); return structuredClone(next.result); } };
}
const operation = (id, status = "pending", extra = {}) => ({ requestId: id, status, identifierHint: "••••4567", customerName: "Test customer", availableRewards: 0, rewardIssued: false, errorCode: null, errorMessage: null, retryable: false, attempts: 0, createdAt: new Date(now).toISOString(), completedAt: null, ...extra });
function make(store, overrides = {}) {
  return createReadOutbox({ scope, store, now: () => now, uuid: () => `request-${++serial}`, online: () => true, send: async input => ({ ok: true, operation: operation(input.requestId) }), load: async () => ({ ok: true, operations: [] }), ...overrides });
}
let checks = 0;
async function check(name, test) { await test(); checks++; console.log(`PASS ${name}`); }

await check("persist before send, offline save and reload", async () => {
  const store = memoryStore(), sent = [];
  const offline = make(store, { online: () => false, send: async input => { sent.push(input); throw Error(); } });
  const saved = await offline.save("phone", "0501234567");
  assert.equal(sent.length, 0); assert.equal((await offline.list())[0].value, "0501234567");
  await offline.sync(); assert.equal(sent.length, 0);
  const restored = make(store, { send: async input => { assert.equal(store.data.get(readScopeKey(scope))[0].requestId, input.requestId); sent.push(input); return { ok: true, operation: operation(input.requestId) }; } });
  await restored.sync(); assert.equal(sent[0].requestId, saved.row.requestId);
  assert.equal((await restored.list())[0].value, undefined, "Raw phone removed only after server acknowledgement");
});
await check("storage failure never sends or claims a save", async () => {
  let sent = 0;
  const queue = make({ change: async () => { throw Error("disk full"); } }, { send: async () => { sent++; } });
  await assert.rejects(queue.save("code", "CARD123")); assert.equal(sent, 0);
  await assert.rejects(createIndexedReadStore().change("scope", rows => ({ rows, result: true })), /storage_unavailable/);
});
await check("IndexedDB adapter waits for transaction commit and rejects an aborted write", async () => {
  const previous = globalThis.indexedDB;
  let tx, read; const written = [];
  const db = { transaction(name, mode) {
    assert.equal(name, "reads"); assert.equal(mode, "readwrite");
    tx = { objectStore: () => ({ index: () => ({ getAll: () => { read = { result: [] }; return read; } }), put: row => written.push(row), delete() {} }), abort() { tx.onabort(); } };
    return tx;
  } };
  globalThis.indexedDB = { open() { const request = { result: db }; queueMicrotask(() => request.onsuccess()); return request; } };
  try {
    const store = createIndexedReadStore(); let resolved = false;
    const saved = store.change("scope-a", () => ({ rows: [{ requestId: "test" }], result: "saved" })).then(value => { resolved = true; return value; });
    await new Promise(setImmediate); read.onsuccess(); await new Promise(setImmediate);
    assert.equal(written.length, 1); assert.equal(resolved, false, "Request success alone is not a durable commit");
    tx.oncomplete(); assert.equal(await saved, "saved");
    const aborted = store.change("scope-a", () => ({ rows: [], result: "saved" }));
    await new Promise(setImmediate); tx.error = Error("Quota exceeded"); tx.onabort(); await assert.rejects(aborted, /Quota exceeded/);
  } finally { if (previous === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = previous; }
});
await check("lost response keeps UUID and respects retry backoff", async () => {
  const store = memoryStore(), ids = [];
  const queue = make(store, { send: async input => { ids.push(input.requestId); throw Error("response lost"); } });
  const saved = await queue.save("code", "CARD123"); await queue.sync(); await queue.sync();
  assert.equal(ids.length, 1); assert.equal((await queue.list())[0].value, "CARD123");
  now += 6000;
  const reloaded = make(store, { send: async input => { ids.push(input.requestId); return { ok: true, operation: operation(input.requestId, "succeeded") }; } });
  await reloaded.sync(); assert.deepEqual(ids, [saved.row.requestId, saved.row.requestId]);
  assert.equal((await reloaded.list())[0].operation.status, "succeeded");
});
await check("pending phone variants and QR/card double scans coalesce", async () => {
  const queue = make(memoryStore());
  const phone = await queue.save("phone", "0501234567");
  assert.equal((await queue.save("phone", "+966 50 123 4567")).row.requestId, phone.row.requestId);
  const card = await queue.save("code", "card123");
  assert.equal((await queue.save("code", createBarndaksaQrPayload("loyalty-card", "CARD123"))).row.requestId, card.row.requestId);
  await queue.sync();
  assert.equal((await queue.save("code", "CARD123")).row.requestId, card.row.requestId, "Acknowledged pending row still guards rapid duplicates without raw identifiers");
});
await check("phone in card tab persists phone method and deduplicates across tabs", async () => {
  const sent = [], queue = make(memoryStore(), { send: async input => { sent.push(input); return { ok: true, operation: operation(input.requestId) }; } });
  const saved = await queue.save("code", "٠٥٠١٢٣٤٥٦٧");
  assert.equal(saved.row.method, "phone");
  assert.equal((await queue.save("phone", "+966 50 123 4567")).row.requestId, saved.row.requestId);
  await queue.sync(); assert.equal(sent.length, 1); assert.equal(sent[0].method, "phone");
  assert.equal((await queue.save("phone", "14401")).row.method, "code");
  assert.equal((await queue.save("phone", "0123456789123456")).row.method, "code");
});
await check("short card numbers coalesce across tabs and Arabic or Persian digits", async () => {
  const sent = [], queue = make(memoryStore(), { send: async input => { sent.push(input); return { ok: true, operation: operation(input.requestId) }; } });
  const saved = await queue.save("phone", "١");
  assert.equal(saved.row.method, "code");
  for (const value of ["1", "١", "۱"]) assert.equal((await queue.save("code", value)).row.requestId, saved.row.requestId);
  await queue.sync(); assert.equal(sent.length, 1); assert.equal(sent[0].method, "code");
});
await check("different cafe or cashier never uploads another scope", async () => {
  const store = memoryStore(), sent = [];
  await make(store).save("phone", "0501234567");
  for (const other of [{ ...scope, cashierId: "cashier-b" }, { ...scope, cafeId: "cafe-b" }]) {
    const queue = make(store, { scope: other, send: async input => { sent.push(input); } });
    await queue.sync(); assert.equal((await queue.list()).length, 0);
  }
  assert.equal(sent.length, 0);
});
await check("two tabs claim one upload atomically", async () => {
  const store = memoryStore(); let release, calls = 0;
  const send = input => { calls++; return new Promise(resolve => { release = () => resolve({ ok: true, operation: operation(input.requestId) }); }); };
  const first = make(store, { send }), second = make(store, { send });
  await first.save("code", "CARD123"); const pending = first.sync();
  await new Promise(setImmediate); await second.sync(); assert.equal(calls, 1);
  release(); await pending;
});
await check("late acknowledgement cannot regress another tab's confirmed stamp", async () => {
  const store = memoryStore(); let release;
  const first = make(store, { send: input => new Promise(resolve => { release = () => resolve({ ok: true, operation: operation(input.requestId) }); }) });
  await first.save("code", "CARD123"); const pending = first.sync(); await new Promise(setImmediate);
  now += 61_000;
  const second = make(store, { send: async input => ({ ok: true, operation: operation(input.requestId, "succeeded") }) });
  await second.sync(); release(); await pending;
  assert.equal((await first.list())[0].operation.status, "succeeded");
});
await check("session change pauses and preserves unsent payload for same-account recovery", async () => {
  const store = memoryStore(); let calls = 0;
  const queue = make(store, { send: async () => { calls++; return { ok: false, code: "session_scope_changed", message: "Sign in again" }; } });
  const saved = await queue.save("code", "CARD123"); await queue.sync(); now += 400_000; await queue.sync();
  assert.equal(calls, 1); assert.equal(queue.authPaused, true); assert.equal((await queue.list())[0].value, "CARD123");
  const restored = make(store); await restored.sync(); assert.equal((await restored.list())[0].requestId, saved.row.requestId);
});
await check("permanent input failure stops retry and keeps readable masked history", async () => {
  let calls = 0;
  const queue = make(memoryStore(), { send: async () => { calls++; return { ok: false, code: "invalid_phone", message: "Invalid phone" }; } });
  await queue.save("phone", "1234"); await queue.sync(); now += 400_000; await queue.sync();
  assert.equal(calls, 1); const [row] = await queue.list(); assert.equal(row.value, undefined); assert.equal(row.identifierKey, undefined); assert.equal(row.errorCode, "rejected:invalid_phone");
});
await check("reward result stays associated with exact operation and duplicate is not success", async () => {
  const queue = make(memoryStore(), { load: async ids => ({ ok: true, operations: ids.map(id => operation(id, "succeeded", { rewardIssued: true, availableRewards: 1 })) }) });
  const saved = await queue.save("code", "CARD123"); await queue.sync();
  const [row] = await queue.list(); assert.equal(row.operation.requestId, saved.row.requestId); assert.equal(row.operation.rewardIssued, true); assert.equal(row.identifierKey, undefined);
  const duplicate = make(memoryStore(), { send: async input => ({ ok: true, operation: operation(input.requestId, "duplicate") }) });
  await duplicate.save("code", "CARD123"); await duplicate.sync(); assert.equal((await duplicate.list())[0].operation.status, "duplicate");
});
await check("terminal history bounded while pending work is retained", async () => {
  const store = memoryStore();
  store.data.set(readScopeKey(scope), Array.from({ length: 120 }, (_, i) => ({ requestId: `done-${i}`, scope: readScopeKey(scope), createdAt: new Date(now - i).toISOString(), operation: operation(`done-${i}`, "succeeded") })));
  const queue = make(store); await queue.save("code", "CARD123"); assert.equal((await queue.list()).length, 101);
  now += 8 * 86400_000; assert.equal((await queue.list()).length, 1);
});
console.log(`PASS ${checks} loyalty read outbox behavior checks (isolated store; no customer operations)`);
