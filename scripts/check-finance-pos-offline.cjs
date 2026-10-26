const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name.startsWith('./')) return load(path.join(path.dirname(file), name + '.ts'));
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    return require(name);
  }, exports);
  return exports;
}

const { drainOfflineSales, pendingSales, posScope, projectOfflineSales } = load('lib/finance/pos-offline.ts');
const { createFinanceReceiptPreview } = load('lib/finance/receipt-preview.ts');
const clone = value => structuredClone(value);
const snapshot = {
  cafe: { id: 'brand-a', name: 'Brand', slug: 'brand' }, userId: 'employee-a',
  settings: { vat_rate: 15, tax_inclusive: true, currency: 'SAR' },
  documents: [], accounts: [{ id: 'cash', balance: 100 }, { id: 'bank', balance: 50 }],
  stock: [{ item_id: 'item', warehouse_id: 'warehouse', quantity: 10 }, { item_id: 'item', warehouse_id: 'another', quantity: 7 }],
};
function sale(id = 'request-one', amount = 48, scope = posScope(snapshot), time = '2026-10-26T08:00:00Z') {
  const document = createFinanceReceiptPreview({
    lines: [{ product: { id: 'product', itemId: 'item', name: 'Coffee', price: amount / 2 }, quantity: 2 }],
    settings: snapshot.settings, discount: 0, paymentKind: 'cash', accountId: 'cash', note: '', createdAt: time,
  });
  Object.assign(document, { id, warehouse_id: 'warehouse', shift_id: 'shift' });
  return { id, scope, command: { operation: 'sale', requestId: id, payload: { shiftId: 'shift', warehouseId: 'warehouse', accountId: 'cash', discount: 0, lines: [{ productId: 'product', quantity: 2 }] } }, document, status: 'queued', createdAt: time, localReference: `L-DEVICE-${id}` };
}
function queueHarness(rows) {
  const store = new Map(rows.map(row => [row.id, clone(row)]));
  const attempted = [], warnings = [];
  const api = {
    list: async () => clone([...store.values()]),
    send: async row => { attempted.push(row.id); return { ok: true, data: { id: `server-${row.id}`, number: 1 } }; },
    acknowledge: async (row, response) => store.set(row.id, { ...row, status: 'synced', result: response.data }),
    conflict: async (row, message) => store.set(row.id, { ...row, status: 'conflict', error: message }),
    authRequired: message => warnings.push(message),
  };
  return { store, attempted, warnings, api };
}

async function main() {
  const first = sale(), second = sale('request-two', 24, posScope(snapshot), '2026-10-26T08:01:00Z');
  assert.equal(first.document.total, 48); assert.equal(first.document.tax, 6.26);
  assert.equal(first.document.lines[0].net, 41.74);
  const source = JSON.stringify({ snapshot, first });
  const projected = projectOfflineSales(snapshot, [first]);
  assert.equal(projected.accounts[0].balance, 148); assert.equal(projected.accounts[1].balance, 50);
  assert.equal(projected.stock[0].quantity, 8); assert.equal(projected.stock[1].quantity, 7);
  assert.equal(projected.documents.length, 1); assert.equal(projected.documents[0].local_reference, first.localReference);
  assert.equal(projected.documents[0].tax, 6.26);
  const twice = projectOfflineSales(projected, [first]);
  assert.equal(twice.accounts[0].balance, 148); assert.equal(twice.stock[0].quantity, 8); assert.equal(twice.documents.length, 1);
  assert.equal(JSON.stringify({ snapshot, first }), source, 'Projection never changes persisted source objects');
  const otherBrand = sale('foreign-brand', 1000, 'brand-b:employee-a');
  const otherEmployee = sale('foreign-employee', 1000, 'brand-a:employee-b');
  assert.deepEqual(projectOfflineSales(snapshot, [otherBrand, otherEmployee]), snapshot, 'No cross-brand or cross-employee offline rows');
  const conflict = { ...first, status: 'conflict' };
  assert.equal(projectOfflineSales(snapshot, [conflict]).accounts[0].balance, 148, 'A conflicting already-collected sale remains visible');
  const synced = { ...first, status: 'synced', reflected: true, document: { ...first.document, id: 'server-one' } };
  const authoritative = { ...snapshot, accounts: [{ id: 'cash', balance: 148 }, snapshot.accounts[1]], stock: [{ ...snapshot.stock[0], quantity: 8 }, snapshot.stock[1]], documents: [synced.document] };
  assert.equal(projectOfflineSales(authoritative, [synced]).accounts[0].balance, 148);
  assert.equal(projectOfflineSales(authoritative, [synced]).documents.length, 1);
  assert.equal(projectOfflineSales(authoritative, [synced]).stock[0].quantity, 8);
  const acknowledgedByReference = { ...authoritative, documents: [{ ...synced.document, local_reference: first.localReference }] };
  assert.equal(projectOfflineSales(acknowledgedByReference, [first]).accounts[0].balance, 148, 'A lost acknowledgement cannot reapply a sale already found by its immutable local reference');
  assert.equal(projectOfflineSales(acknowledgedByReference, [first]).documents.length, 1);
  assert.equal(projectOfflineSales(snapshot, [{ ...synced, reflected: false }]).accounts[0].balance, 148, 'Ack without a fresh snapshot still projects once');
  assert.equal(projectOfflineSales({ ...authoritative, documents: [] }, [synced]).accounts[0].balance, 148, 'Paginated documents do not reapply acknowledged balance');
  assert.equal(pendingSales([first, conflict, synced]).length, 2);

  // The following queue tests use a deterministic in-memory durable-store boundary, not a real browser DB.
  const fifo = queueHarness([second, first]); await drainOfflineSales(fifo.api);
  assert.deepEqual(fifo.attempted, [first.id, second.id]); assert.equal(pendingSales([...fifo.store.values()]).length, 0);
  const lost = queueHarness([first, second]), ledger = new Map(), payloads = [];
  let loseResponse = true;
  lost.api.send = async row => {
    payloads.push(JSON.stringify(row.command));
    if (!ledger.has(row.command.requestId)) ledger.set(row.command.requestId, { id: `server-${row.id}`, number: ledger.size + 1 });
    if (loseResponse) { loseResponse = false; throw Error('response lost after server commit'); }
    return { ok: true, data: ledger.get(row.command.requestId) };
  };
  await drainOfflineSales(lost.api);
  assert.equal(ledger.size, 1); assert.equal(lost.store.get(first.id).status, 'queued'); assert.equal(lost.store.get(second.id).status, 'queued');
  await drainOfflineSales(lost.api);
  assert.equal(ledger.size, 2, 'Lost responses reuse the same request identity instead of duplicating a server sale');
  assert.equal(payloads[0], payloads[1]); assert.equal(pendingSales([...lost.store.values()]).length, 0);
  const storageFailure = queueHarness([first]);
  const acknowledge = storageFailure.api.acknowledge;
  storageFailure.api.acknowledge = async () => { throw Error('device storage unavailable'); };
  await assert.rejects(drainOfflineSales(storageFailure.api), /storage/);
  assert.equal(storageFailure.store.get(first.id).status, 'queued');
  storageFailure.api.acknowledge = acknowledge; await drainOfflineSales(storageFailure.api);
  assert.deepEqual(storageFailure.attempted, [first.id, first.id], 'Ack failure retains retry identity');
  const blocked = queueHarness([second, first]);
  blocked.api.send = async row => { blocked.attempted.push(row.id); return { ok: false, kind: 'conflict', message: 'review required' }; };
  await drainOfflineSales(blocked.api); await drainOfflineSales(blocked.api);
  assert.deepEqual(blocked.attempted, [first.id]); assert.equal(blocked.store.size, 2);
  assert.equal(blocked.store.get(first.id).status, 'conflict'); assert.equal(blocked.store.get(second.id).status, 'queued');
  for (const kind of ['auth', 'retry']) {
    const retained = queueHarness([first, second]);
    retained.api.send = async row => { retained.attempted.push(row.id); return { ok: false, kind, message: 'retain queue' }; };
    await drainOfflineSales(retained.api);
    assert.deepEqual(retained.attempted, [first.id]); assert.equal(pendingSales([...retained.store.values()]).length, 2);
    assert.equal(retained.warnings.length, kind === 'auth' ? 1 : 0);
  }
  let indexedDb;
  try { indexedDb = require('fake-indexeddb'); } catch { /* Do not install dependencies merely for this check. */ }
  if (indexedDb) {
    global.indexedDB = indexedDb.indexedDB;
    const storage = load('lib/finance/pos-offline-storage.ts');
    await storage.saveOfflineSnapshot(snapshot, true);
    await storage.storeOfflineSale(posScope(snapshot), first.command.payload, first.document, first.id);
    await storage.storeOfflineSale(posScope(snapshot), first.command.payload, first.document, first.id);
    assert.equal((await storage.listOfflineSales(posScope(snapshot))).length, 1);
    assert.equal((await storage.listOfflineSales('brand-b:employee-a')).length, 0);
    assert.equal((await storage.activeOfflineSession()).scope, posScope(snapshot));
    const emptyStock = {...snapshot,products:[{id:'product',itemId:'item',stockTracked:true}],stock:[{...snapshot.stock[0],quantity:0},snapshot.stock[1]]};
    await storage.saveOfflineSnapshot(emptyStock,true);
    const shortage = sale('negative-stock');
    await storage.storeOfflineSale(posScope(snapshot), shortage.command.payload, shortage.document, shortage.id);
    await storage.storeOfflineSale(posScope(snapshot), shortage.command.payload, shortage.document, shortage.id);
    const reopened = load('lib/finance/pos-offline-storage.ts');
    const persisted = await reopened.listOfflineSales(posScope(snapshot));
    assert.equal(persisted.length, 2, 'Negative stock sale persists and retry deduplicates across connections');
    assert.equal(projectOfflineSales(emptyStock,persisted).stock[0].quantity,-4,'Pending sales show a negative inventory balance');
    await storage.lockOfflineSession(); assert.equal(await storage.activeOfflineSession(), undefined);
    console.log('PASS IndexedDB adapter transactions using fake-indexeddb (not physical browser persistence)');
  } else console.log('NOT RUN IndexedDB adapter persistence: fake-indexeddb is not installed; memory boundary tests cannot verify transaction lifetime, quota, browser eviction or multi-tab locks');
  console.log('PASS offline POS: scoped projection, no double counting, VAT rounding, FIFO stop-on-conflict, retained auth/retry queues, lost response identity and durable acknowledgement failure');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
