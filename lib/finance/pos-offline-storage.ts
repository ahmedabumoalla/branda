import type { FinanceDocument, FinanceSnapshot } from "./brand-finance";
import { offlineStockDeductions, posScope, type OfflineSale, type OfflineSession, type PosSyncResponse } from "./pos-offline";

const DB = "branda-pos-v1";
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("sessions", { keyPath: "scope" });
      const sales = db.createObjectStore("sales", { keyPath: "id" }); sales.createIndex("scope", "scope");
      db.createObjectStore("meta");
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error("أغلق صفحات الكاشير القديمة ثم أعد المحاولة")); };
  });
}
const read = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
const completed = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("تعذر حفظ البيانات على الجهاز")); });

export async function getOfflineSession(scope: string) {
  const db = await openDatabase(); return read<OfflineSession | undefined>(db.transaction("sessions").objectStore("sessions").get(scope));
}
export async function activeOfflineSession() {
  const db = await openDatabase(); const scope = await read<string | undefined>(db.transaction("meta").objectStore("meta").get("active"));
  return scope ? getOfflineSession(scope) : undefined;
}
export async function saveOfflineSnapshot(snapshot: FinanceSnapshot, validated = false, reflectConfirmed = false) {
  const db = await openDatabase(), scope = posScope(snapshot);
  const old = await getOfflineSession(scope);
  const tx = db.transaction(["sessions", "meta", "sales"], "readwrite"), done = completed(tx);
  tx.objectStore("sessions").put({ ...old, scope, snapshot, validatedAt: validated ? Date.now() : old?.validatedAt ?? Date.now() } satisfies OfflineSession);
  if (validated) tx.objectStore("meta").put(scope, "active");
  if (reflectConfirmed) {
    const sales = tx.objectStore("sales");
    for (const sale of await read<OfflineSale[]>(sales.index("scope").getAll(scope))) if (sale.status === "synced") sales.put({ ...sale, reflected: true });
  }
  await done;
}
export async function lockOfflineSession() {
  const db = await openDatabase(), tx = db.transaction("meta", "readwrite"), done = completed(tx);
  tx.objectStore("meta").delete("active"); await done;
}
export async function listOfflineSales(scope: string) {
  const db = await openDatabase(); return read<OfflineSale[]>(db.transaction("sales").objectStore("sales").index("scope").getAll(scope));
}

export async function storeOfflineSale(scope: string, payload: Record<string, unknown>, document: FinanceDocument, requestId: string): Promise<OfflineSale> {
  const db = await openDatabase(), tx = db.transaction(["sales", "meta", "sessions"], "readwrite"), done = completed(tx);
  const sales = tx.objectStore("sales"), meta = tx.objectStore("meta");
  const existing = await read<OfflineSale | undefined>(sales.get(requestId));
  if (existing) { await done; if (existing.scope !== scope) throw new Error("الفاتورة مرتبطة بحساب آخر"); return existing; }
  const session = await read<OfflineSession | undefined>(tx.objectStore("sessions").get(scope));
  const active = await read<string | undefined>(meta.get("active"));
  if (!session || active !== scope) { await done; throw new Error("سجل الدخول بنفس حساب الكاشير لحفظ الفاتورة"); }
  const device = await read<string | undefined>(meta.get("device")) ?? crypto.randomUUID().slice(0, 8).toUpperCase();
  const counter = (await read<number | undefined>(meta.get("counter")) ?? 0) + 1;
  const localReference = `L-${device}-${String(counter).padStart(6, "0")}`;
  const sale: OfflineSale = { id: requestId, scope, sequence: counter, command: { operation: "sale", requestId, payload: { ...payload, offlineExpectedVatRate: document.vat_rate, offlineExpectedTaxInclusive: document.tax_inclusive, localReceiptReference: localReference, localCreatedAt: document.created_at } }, document: { ...document, id: requestId, local_reference: localReference, sync_status: "queued" }, status: "queued", createdAt: document.created_at, localReference };
  sale.stockDeductions = offlineStockDeductions(session.snapshot, document);
  meta.put(device, "device"); meta.put(counter, "counter"); sales.add(sale);
  await done; return sale;
}
export async function acknowledgeOfflineSale(sale: OfflineSale, response: Extract<PosSyncResponse, { ok: true }>) {
  if (response.snapshot && posScope(response.snapshot) !== sale.scope) throw new Error("بيانات المزامنة لا تطابق حساب الكاشير");
  const db = await openDatabase(), tx = db.transaction(["sales", "sessions"], "readwrite"), done = completed(tx);
  const serverDocument = response.snapshot?.documents.find(document => document.id === response.data.id);
  tx.objectStore("sales").put({ ...sale, status: "synced", reflected: !!response.snapshot, error: undefined, result: response.data, document: { ...(serverDocument ?? sale.document), id: response.data.id, number: response.data.number ?? sale.document.number, local_reference: sale.localReference, sync_status: "synced" } } satisfies OfflineSale);
  if (response.snapshot && posScope(response.snapshot) === sale.scope) tx.objectStore("sessions").put({ scope: sale.scope, snapshot: response.snapshot, validatedAt: Date.now() } satisfies OfflineSession);
  await done;
}
export async function flagOfflineConflict(sale: OfflineSale, error: string) {
  const db = await openDatabase(), tx = db.transaction("sales", "readwrite"), done = completed(tx);
  tx.objectStore("sales").put({ ...sale, status: "conflict", error } satisfies OfflineSale); await done;
}
export async function retryOfflineConflicts(scope: string) {
  const db = await openDatabase(), rows = await listOfflineSales(scope), tx = db.transaction("sales", "readwrite"), done = completed(tx);
  for (const sale of rows.filter(row => row.status === "conflict")) tx.objectStore("sales").put({ ...sale, status: "queued", error: undefined } satisfies OfflineSale);
  await done;
}

/** IndexedDB lease serializes sync across tabs even where navigator.locks is unavailable. */
export async function withOfflineSyncLease(scope: string, work: () => Promise<void>) {
  const db = await openDatabase(), owner = crypto.randomUUID(), key = `lease:${scope}`;
  const acquire = async (renew = false) => {
    const tx = db.transaction("meta", "readwrite"), done = completed(tx), store = tx.objectStore("meta");
    const lease = await read<{ owner: string; expires: number } | undefined>(store.get(key));
    const allowed = renew ? lease?.owner === owner : !lease || lease.expires < Date.now();
    if (allowed) store.put({ owner, expires: Date.now() + 60_000 }, key);
    await done; return allowed;
  };
  if (!await acquire()) return;
  const timer = setInterval(() => void acquire(true).catch(() => {}), 15_000);
  try { await work(); }
  finally {
    clearInterval(timer);
    const tx = db.transaction("meta", "readwrite"), done = completed(tx), store = tx.objectStore("meta");
    const lease = await read<{ owner: string } | undefined>(store.get(key));
    if (lease?.owner === owner) store.delete(key);
    await done;
  }
}
