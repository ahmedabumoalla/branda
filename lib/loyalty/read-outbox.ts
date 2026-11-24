import { getBrandCountry, normalizeBrandPhone, type BrandPhoneCountry } from "../auth/brand-phone";
import type { LoyaltyReadOperation } from "./read-operation-types";
import { parseBarndaksaQrPayload } from "./secure-qr-payload";
import { normalizeLoyaltyDigits, resolveReadMethod } from "./read-identifier";

export type ReadScope = { cafeId: string; cashierId: string };
export type ReadIntent = ReadScope & { requestId: string; method: "code" | "phone"; value: string; clientCreatedAt: string };
export type LocalRead = {
  requestId: string; scope: string; method: "code" | "phone"; value?: string;
  identifierHint: string; identifierKey?: string; createdAt: string; attempts: number; nextAttemptAt: number;
  leaseUntil: number; leaseOwner?: string; operation?: LoyaltyReadOperation;
  errorCode?: string; errorMessage?: string;
};
export interface ReadStore<Row = LocalRead> {
  read?(scope: string): Promise<Row[]>;
  change<T>(scope: string, change: (rows: Row[]) => { rows: Row[]; result: T }): Promise<T>;
}
export const readScopeKey = (scope: ReadScope) => JSON.stringify([scope.cafeId, scope.cashierId]);
const terminal = (row: LocalRead) => Boolean(row.errorCode?.startsWith("rejected:") || (row.operation && !["pending", "processing"].includes(row.operation.status)));
function latestOperation(current: LoyaltyReadOperation | undefined, incoming: LoyaltyReadOperation) {
  if (current && ["succeeded", "duplicate"].includes(current.status)) return current;
  if (current?.status === "failed" && ["pending", "processing"].includes(incoming.status) && incoming.attempts <= current.attempts) return current;
  return incoming;
}
const keepRows = (rows: LocalRead[], now: number) => {
  let completed = 0;
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter(row => !terminal(row) || (++completed <= 100 && now - Date.parse(row.createdAt) < 7 * 86400_000));
};
export function createIndexedReadStore<Row extends { requestId: string; scope: string } = LocalRead>(databaseName = "branda-loyalty-reads"): ReadStore<Row> {
  let database: Promise<IDBDatabase> | undefined;
  function open() {
    if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") { reject(new Error("storage_unavailable")); return; }
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("reads", { keyPath: "requestId" }).createIndex("scope", "scope");
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => reject(request.error ?? new Error("storage_unavailable"));
      request.onblocked = () => reject(new Error("storage_blocked"));
    });
    return database;
  }
  return {
    async read(scope) {
      const db = await open();
      return new Promise<Row[]>((resolve, reject) => {
        const request = db.transaction("reads", "readonly").objectStore("reads").index("scope").getAll(scope);
        request.onsuccess = () => resolve(request.result as Row[]);
        request.onerror = () => reject(request.error ?? new Error("storage_unavailable"));
      });
    },
    async change<T>(scope: string, change: (rows: Row[]) => { rows: Row[]; result: T }) {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("reads", "readwrite", { durability: "strict" });
      const table = tx.objectStore("reads");
      const request = table.index("scope").getAll(scope);
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("storage_unavailable"));
      request.onsuccess = () => {
        try {
          const previous = request.result as Row[];
          const next = change(previous);
          result = next.result;
          const ids = new Set(next.rows.map(row => row.requestId));
          for (const row of previous) if (!ids.has(row.requestId)) table.delete(row.requestId);
          for (const row of next.rows) table.put(row);
        } catch { tx.abort(); }
      };
    });
  } };
}

type Result = { ok: true; operation: LoyaltyReadOperation } | { ok: false; message: string; code?: string; retryable?: boolean };
type LoadResult = { ok: true; operations: LoyaltyReadOperation[] } | { ok: false; message: string; code?: string; retryable?: boolean };
async function withDeadline<T>(request: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([request, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("network_timeout")), 25_000); })]); }
  finally { clearTimeout(timeout); }
}
export function createReadOutbox(options: {
  phoneCountry?: BrandPhoneCountry;
  scope: ReadScope; store: ReadStore; send: (input: ReadIntent) => Promise<Result>;
  load: (ids: string[], scope: ReadScope) => Promise<LoadResult>;
  now?: () => number; uuid?: () => string; online?: () => boolean;
}) {
  const { scope, store } = options;
  const key = readScopeKey(scope), now = options.now ?? Date.now, uuid = options.uuid ?? (() => crypto.randomUUID());
  const owner = uuid();
  let busy = false;
  let paused = false;
  const isAuth = (code?: string) => ["session_scope_changed", "session_invalid", "unauthorized", "scope_mismatch", "auth_required", "session_expired"].includes(code ?? "");
  const isPermanent = (code?: string) => ["invalid_input", "request_conflict", "invalid_code", "invalid_phone"].includes(code ?? "");
  const list = () => store.change(key, rows => { const retained = keepRows(rows, now()); return { rows: retained, result: retained }; });
  async function save(method: "code" | "phone", value: string) {
    const clean = value.trim();
    method = resolveReadMethod(method, clean, options.phoneCountry);
    if (!clean || clean.length > (method === "phone" ? 30 : 500)) throw new Error("invalid_identifier");
    const digits = normalizeLoyaltyDigits(clean);
    let canonical = method === "code" ? parseBarndaksaQrPayload(digits, "loyalty-card") ?? digits.toUpperCase() : digits.replace(/\D/g, "");
    if (method === "phone") {
      const country = options.phoneCountry ?? "SA";
      const rule = getBrandCountry(country);
      const phone = normalizeBrandPhone(clean, country);
      // Retain the national-number fingerprint used by existing Saudi/Palestinian queues
      canonical = phone ? phone.slice(rule.callingCode.length) : canonical.replace(new RegExp(`^(?:00${rule.callingCode}|${rule.callingCode}${rule.prefix ? "|" + rule.prefix : ""})`), "");
    }
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${key}:${method}:${canonical}`));
    const identifierKey = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
    const row: LocalRead = { requestId: uuid(), scope: key, method, value: clean, identifierKey, identifierHint: `••••${canonical.slice(-4)}`, createdAt: new Date(now()).toISOString(), attempts: 0, nextAttemptAt: 0, leaseUntil: 0 };
    return store.change(key, rows => {
      const duplicate = rows.find(item => !terminal(item) && item.identifierKey === identifierKey);
      if (duplicate) return { rows, result: { row: duplicate, duplicate: true } };
      if (rows.filter(item => !terminal(item)).length >= 1000) throw new Error("outbox_full");
      return { rows: keepRows([...rows, row], now()), result: { row, duplicate: false } };
    });
  }
  async function sync() {
    if (busy || paused || options.online?.() === false) return;
    busy = true;
    try {
      for (let count = 0; count < 5; count++) {
        const row = await store.change(key, rows => {
          const candidate = rows.find(item => item.value && !item.errorCode?.startsWith("rejected:") && item.nextAttemptAt <= now() && item.leaseUntil <= now());
          if (candidate) { candidate.leaseUntil = now() + 60_000; candidate.leaseOwner = owner; }
          return { rows, result: candidate };
        });
        if (!row?.value) break;
        let response: Result;
        try { response = await withDeadline(options.send({ ...scope, requestId: row.requestId, method: row.method, value: row.value, clientCreatedAt: row.createdAt })); }
        catch { response = { ok: false, code: "network_error", message: "تعذر الاتصال بخدمة المزامنة ستتم إعادة المحاولة تلقائيًا" }; }
        if (!response.ok && (isAuth(response.code) || (response.retryable === false && !isPermanent(response.code)))) paused = true;
        await store.change(key, rows => {
          const current = rows.find(item => item.requestId === row.requestId);
          // Another tab can reclaim an expired lease; only its owner changes failure state.
          if (current && (response.ok || current.leaseOwner === owner)) {
            current.leaseUntil = 0; delete current.leaseOwner;
            if (response.ok) {
              current.operation = latestOperation(current.operation, response.operation); current.identifierHint = response.operation.identifierHint;
              delete current.value; delete current.errorCode; delete current.errorMessage;
              if (terminal(current)) delete current.identifierKey;
            } else {
              current.attempts += 1; current.errorCode = isPermanent(response.code) ? `rejected:${response.code}` : response.code; current.errorMessage = response.message;
              if (isPermanent(response.code)) { delete current.value; delete current.identifierKey; }
              current.nextAttemptAt = now() + Math.min(300_000, 2000 * 2 ** Math.min(current.attempts, 8));
            }
          }
          return { rows, result: undefined };
        });
        if (paused || !response.ok) break;
      }
      if (!paused) {
        const rows = await list();
        const ids = rows.filter(row => row.operation && (["pending", "processing"].includes(row.operation.status) || (row.operation.status === "failed" && row.operation.retryable))).map(row => row.requestId).slice(0, 100);
        if (ids.length) {
          const response = await withDeadline(options.load(ids, scope));
          if (response.ok) await store.change(key, current => ({ rows: current.map(row => { const operation = response.operations.find(op => op.requestId === row.requestId); if (!operation) return row; const updated = { ...row, operation: latestOperation(row.operation, operation) }; if (terminal(updated)) delete updated.identifierKey; return updated; }), result: undefined }));
          else if (isAuth(response.code) || response.retryable === false) paused = true;
        }
      }
    } finally { busy = false; }
  }
  async function retryUnsent() {
    await store.change(key, rows => {
      for (const row of rows) {
        if (row.value && !terminal(row) && !row.leaseOwner && (!row.errorCode || row.errorCode === "network_error")) row.nextAttemptAt = 0;
      }
      return { rows, result: undefined };
    });
  }
  return { save, list, sync, retryUnsent, get authPaused() { return paused; } };
}
