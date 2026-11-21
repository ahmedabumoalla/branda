import { isCashierLoyaltyCode, isLoyaltyDisplayNumber, normalizeLoyaltyDigits, resolveReadMethod } from "./read-identifier";
import { parseBarndaksaQrPayload } from "./secure-qr-payload";
import { readScopeKey, type ReadScope, type ReadStore } from "./read-outbox";

export type InvoiceTerms = { amountHalalas: number; rateSar: number; rateQuantity: number };
export type QueuedInvoice = InvoiceTerms & {
  requestId: string; scope: string; hint: string; createdAt: number; identifier?: string; cardCode?: string;
  state: "waiting" | "credited" | "rejected"; reason?: string; pointsAdded?: number; pointsBalance?: number;
  lease?: string; leaseUntil: number; attempts: number; nextAttempt: number;
};
type ScopeInput = { scope: ReadScope };
type CreditInput = ScopeInput & InvoiceTerms & { cardCode: string; requestId: string };
type Failure = { ok: false; reason: string };
type Dependencies = {
  store: ReadStore<QueuedInvoice>; scope: ReadScope; online: () => boolean;
  resolve: (input: ScopeInput & { identifier: string }) => Promise<Failure | { ok: true; cardCode: string }>;
  credit: (input: CreditInput) => Promise<Failure | { ok: true; pointsAdded: number; pointsBalance: number }>;
  now?: () => number;
};
const definitive = new Set(["invalid_input", "card_unavailable", "request_conflict", "points_rate_changed", "points_mode_changed", "zero_points", "points_limit", "approval_rejected"]);

export function invoiceOutbox({ store, scope, online, resolve, credit, now = Date.now }: Dependencies) {
  const key = readScopeKey(scope);
  let running = false;
  const keep = (rows: QueuedInvoice[]) => {
    let finished = 0;
    return rows.sort((a, b) => b.createdAt - a.createdAt).filter(r => r.state === "waiting" || (++finished <= 100 && now() - r.createdAt < 7 * 86400_000));
  };
  const list = async () => store.read ? keep(await store.read(key)) : store.change(key, rows => ({ rows, result: keep(rows) }));
  async function save(identifier: string, terms: InvoiceTerms) {
    const raw = normalizeLoyaltyDigits(identifier);
    const phone = resolveReadMethod("code", raw) === "phone";
    const code = phone ? raw : parseBarndaksaQrPayload(raw, "loyalty-card") ?? raw.toUpperCase();
    if (!raw || raw.length > 500 || (!phone && !isCashierLoyaltyCode(code))) throw new Error("invalid_identifier");
    const row: QueuedInvoice = { ...terms, requestId: crypto.randomUUID(), scope: key,
      hint: "••••" + code.slice(-4), createdAt: now(), attempts: 0, leaseUntil: 0, nextAttempt: 0, state: "waiting",
      ...(phone || isLoyaltyDisplayNumber(code) ? { identifier: code } : { cardCode: code }) };
    return store.change(key, rows => {
      if (rows.filter(r => r.state === "waiting").length >= 1000) throw new Error("outbox_full");
      // Equal amounts on the same card can be separate purchases. Retries of
      // one saved invoice always use its original UUID instead.
      return { rows: keep([row, ...rows]), result: row };
    });
  }
  async function sync(changed: () => void = () => {}) {
    if (running || !online()) return;
    running = true;
    try {
      for (let i = 0; i < 10 && online(); i++) {
        const lease = crypto.randomUUID();
        const row = await store.change(key, rows => {
          const next = rows.filter(r => r.state === "waiting" && r.leaseUntil <= now() && r.nextAttempt <= now())
            .sort((a,b) => a.createdAt - b.createdAt)[0];
          if (next) { next.lease = lease; next.leaseUntil = now() + 65_000; }
          return { rows, result: next };
        });
        if (!row) break;
        let result: Awaited<ReturnType<typeof credit>> = { ok: false, reason: "unavailable" };
        try {
          let code = row.cardCode;
          if (!code && row.identifier) {
            const target = await resolve({ scope, identifier: row.identifier });
            if (target.ok) {
              code = target.cardCode;
              const pinned = await store.change(key, rows => {
                const current = rows.find(r => r.requestId === row.requestId && r.lease === lease);
                if (current) { current.cardCode = target.cardCode; delete current.identifier; }
                return { rows, result: !!current };
              });
              if (!pinned) continue;
            } else result = target;
          }
          if (code) result = await credit({ scope, cardCode: code, requestId: row.requestId, amountHalalas: row.amountHalalas, rateSar: row.rateSar, rateQuantity: row.rateQuantity });
        } catch { /* A lost response is retried with the same card and UUID. */ }
        await store.change(key, rows => {
          const current = rows.find(r => r.requestId === row.requestId && r.lease === lease);
          if (current) {
            delete current.lease; current.leaseUntil = 0; current.attempts++;
            if (result.ok) {
              current.state = "credited"; current.pointsAdded = result.pointsAdded; current.pointsBalance = result.pointsBalance; delete current.reason;
            } else {
              current.reason = result.reason;
              if (definitive.has(result.reason)) current.state = "rejected";
              else current.nextAttempt = now() + Math.min(120_000, 2000 * 2 ** Math.min(current.attempts, 6));
            }
            if (current.state !== "waiting") { delete current.identifier; delete current.cardCode; }
          }
          return { rows, result: undefined };
        });
        changed();
      }
    } finally { running = false; }
  }
  const retry = () => store.change(key, rows => { for (const row of rows) if (row.state === "waiting") row.nextAttempt = 0; return { rows, result: undefined }; });
  return { save, sync, list, retry };
}
