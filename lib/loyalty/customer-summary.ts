import { isCashierLoyaltyCode, isLoyaltyDisplayNumber, normalizeLoyaltyDigits, resolveReadMethod } from "./read-identifier";
import { parseBarndaksaQrPayload } from "./secure-qr-payload";

export type CustomerSummary = {
  customerName: string;
  stampsInCycle: number;
  purchasesRequired: number;
  availableRewards: number;
};
export type CustomerSummaryState = {
  id: number | null;
  status: "idle" | "loading" | "slow" | "ready" | "not_found" | "unavailable" | "unauthorized";
  summary: CustomerSummary | null;
  confirmed: boolean;
};
type SummaryInput = { cafeId: string; cashierId: string; method: "code" | "phone"; value: string };
const EMPTY: CustomerSummaryState = { id: null, status: "idle", summary: null, confirmed: false };

/** Only complete identifiers leave the device; partial phones are never card lookups. */
export function customerSummaryIdentifier(method: "code" | "phone", raw: string) {
  const value = normalizeLoyaltyDigits(raw.trim());
  if (!value || value.length > 500) return null;
  method = resolveReadMethod(method, value);
  if (method === "phone") {
    if (!/^[+\d\s()-]+$/.test(value)) return null;
    const digits = value.replace(/\D/g, "");
    if (!/^(?:05\d{8}|5\d{8}|9665\d{8}|009665\d{8})$/.test(digits)) return null;
    return { method, value: `966${digits.replace(/^(?:00966|966|0)/, "")}` };
  }
  const parsed = parseBarndaksaQrPayload(value, "loyalty-card");
  const code = parsed ?? value.toUpperCase();
  if (value.startsWith("BARNDAKSA_QR:") && !parsed) return null;
  if (/^\d+$/.test(code) && !isLoyaltyDisplayNumber(code) && !/^\d{16}$/.test(code)) return null;
  return isCashierLoyaltyCode(code) ? { method, value: code } : null;
}

function summaryValue(value: unknown): CustomerSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.customerName !== "string" || !row.customerName.trim() || row.customerName.length > 500) return null;
  for (const field of ["stampsInCycle", "purchasesRequired", "availableRewards"] as const) {
    if (typeof row[field] !== "number" || !Number.isSafeInteger(row[field]) || row[field] < (field === "purchasesRequired" ? 1 : 0)) return null;
  }
  return { customerName: row.customerName, stampsInCycle: row.stampsInCycle as number,
    purchasesRequired: row.purchasesRequired as number, availableRewards: row.availableRewards as number };
}

/** Per-mounted-cashier memory only; never persisted or shared across scopes. */
export function createCustomerSummaryController(options: {
  scope: { cafeId: string; cashierId: string };
  fetch?: typeof fetch;
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
}) {
  const send = options.fetch ?? fetch;
  // Native browser timers require Window as receiver; never copy them as methods
  // onto an ordinary object (that throws Illegal invocation before lookup starts).
  const timers = options.timers ?? {
    setTimeout: (handler: () => void, delay: number) => globalThis.setTimeout(handler, delay),
    clearTimeout: (id: ReturnType<typeof setTimeout> | undefined) => globalThis.clearTimeout(id),
  };
  const listeners = new Set<() => void>();
  let state = EMPTY, serial = 0, identifierKey: string | null = null;
  let queued: ReturnType<typeof setTimeout> | undefined;
  let slow: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let active: AbortController | null = null;
  let startQueued: (() => void) | null = null;
  let restart: (() => void) | null = null;
  let suspended: (() => void) | null = null;
  function publish(next: CustomerSummaryState) { state = next; for (const listener of listeners) listener(); }
  function stop() {
    timers.clearTimeout(queued); timers.clearTimeout(slow); timers.clearTimeout(deadline);
    queued = slow = deadline = undefined; startQueued = null;
    restart = suspended = null;
    active?.abort(); active = null;
  }
  function clear() { serial++; stop(); identifierKey = null; publish(EMPTY); }
  function pause() {
    const resume = state.status === "loading" || state.status === "slow" ? restart : null;
    stop(); suspended = resume;
  }
  function resume() { const start = suspended; suspended = null; start?.(); }
  function lookup(method: "code" | "phone", value: string, settings: { immediate?: boolean } = {}): number | null {
    const identifier = customerSummaryIdentifier(method, value);
    if (!identifier) { clear(); return null; }
    const key = JSON.stringify([identifier.method, identifier.value]);
    if (key === identifierKey && ["loading", "slow", "ready"].includes(state.status)) {
      if (settings.immediate && startQueued) { timers.clearTimeout(queued); startQueued(); }
      return state.id;
    }
    stop(); identifierKey = key;
    const id = ++serial;
    publish({ id, status: "loading", summary: null, confirmed: false });
    const start = () => {
      startQueued = null; queued = undefined;
      if (state.id !== id) return;
      restart = start;
      const controller = new AbortController(); active = controller;
      const current = () => state.id === id && active === controller;
      slow = timers.setTimeout(() => { if (current()) publish({ ...state, status: "slow" }); }, 500);
      deadline = timers.setTimeout(() => {
        if (!current()) return;
        stop(); publish({ id, status: "unavailable", summary: null, confirmed: false });
      }, 1800);
      const body: SummaryInput = { ...options.scope, ...identifier };
      void (async () => {
        try {
          const response = await send("/api/loyalty/customer-summary", {
            method: "POST", credentials: "same-origin", cache: "no-store",
            headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal,
          });
          const result: unknown = await response.json();
          if (!current()) return;
          const payload = result && typeof result === "object" ? result as Record<string, unknown> : {};
          const summary = response.ok && payload.ok === true ? summaryValue(payload.summary) : null;
          const code = String(payload.code ?? "");
          const status: CustomerSummaryState["status"] = summary ? "ready"
            : code === "not_found" ? "not_found"
              : response.status === 401 || response.status === 403 || ["session_invalid", "session_scope_changed", "permission_denied", "unauthorized"].includes(code) ? "unauthorized" : "unavailable";
          stop(); publish({ id, status, summary, confirmed: false });
        } catch {
          if (!current()) return;
          stop(); publish({ id, status: "unavailable", summary: null, confirmed: false });
        }
      })();
    };
    restart = start;
    if (settings.immediate) start();
    else { startQueued = start; queued = timers.setTimeout(start, 150); }
    return id;
  }
  function confirm(id: number, value: CustomerSummary) {
    const summary = summaryValue(value);
    if (state.id !== id || !summary) return false;
    if (state.confirmed && state.summary?.customerName === summary.customerName
      && state.summary.stampsInCycle === summary.stampsInCycle
      && state.summary.purchasesRequired === summary.purchasesRequired
      && state.summary.availableRewards === summary.availableRewards) return true;
    stop(); publish({ id, status: "ready", summary, confirmed: true }); return true;
  }
  return { lookup, clear, confirm, pause, resume, getSnapshot: () => state, getServerSnapshot: () => EMPTY,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}
