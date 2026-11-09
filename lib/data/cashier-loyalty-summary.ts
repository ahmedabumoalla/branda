import "server-only";

import { z } from "zod";
import { getCashierToken, requireCashierPermission } from "@/lib/data/cashier";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCashierLoyaltyCode, normalizeLoyaltyDigits, resolveReadMethod } from "@/lib/loyalty/read-identifier";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";

const inputSchema = z.object({
  cafeId: z.string().uuid(), cashierId: z.string().uuid(),
  method: z.enum(["code", "phone"]), value: z.string().trim().min(1).max(500),
}).strict();
const summarySchema = z.object({
  customerName: z.string(), stampsInCycle: z.number().int().nonnegative(),
  purchasesRequired: z.number().int().positive(), availableRewards: z.number().int().nonnegative(),
});
const publicCodeSchema = z.enum(["not_found", "invalid_input", "session_invalid", "session_scope_changed", "permission_denied", "unavailable"]);
export type CashierLoyaltySummary = z.infer<typeof summarySchema>;
export type CashierLoyaltySummaryResult = { ok: true; summary: CashierLoyaltySummary } | { ok: false; code: z.infer<typeof publicCodeSchema> };

async function withinDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let rejectOnAbort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    rejectOnAbort = () => reject(new Error("summary_timeout"));
    signal.addEventListener("abort", rejectOnAbort, { once: true });
  });
  try { return await Promise.race([work, interrupted]); }
  finally { signal.removeEventListener("abort", rejectOnAbort); }
}

/** Normal staff use one RPC; owner sessions retain live Auth/maintenance verification. */
export async function getCashierLoyaltySummary(raw: unknown, signal?: AbortSignal): Promise<CashierLoyaltySummaryResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const input = parsed.data, digits = normalizeLoyaltyDigits(input.value);
  const method = resolveReadMethod(input.method, digits);
  const value = method === "phone"
    ? (/^[+\d\s()-]+$/.test(digits) ? normalizeSaudiPhone(digits) : null)
    : parseBarndaksaQrPayload(digits, "loyalty-card") ?? digits.toUpperCase();
  if (!value || (method === "code" && !isCashierLoyaltyCode(value))) return { ok: false, code: "invalid_input" };
  const token = await getCashierToken();
  if (!token) return { ok: false, code: "session_invalid" };
  const abort = signal ? AbortSignal.any([signal, AbortSignal.timeout(1500)]) : AbortSignal.timeout(1500);
  const admin = createAdminClient();
  const run = (ownerVerified: boolean) => admin.rpc("get_cashier_loyalty_summary", {
    p_session_token: token, p_expected_cafe_id: input.cafeId, p_expected_cashier_id: input.cashierId,
    p_method: method, p_value: value, p_owner_verified: ownerVerified,
  }).abortSignal(abort);
  try {
    let response = await run(false);
    if (!response.error && response.data?.code === "owner_auth_required") {
      // Never trust a client-provided owner flag or skip the established extra gates.
      const session = await withinDeadline(requireCashierPermission("loyalty", admin), abort);
      if (session.cafeId !== input.cafeId || session.cashierId !== input.cashierId || session.token !== token) {
        return { ok: false, code: "session_scope_changed" };
      }
      if (abort.aborted) return { ok: false, code: "unavailable" };
      response = await run(true);
    }
    if (response.error) return { ok: false, code: response.error.code === "42501" ? "permission_denied" : "unavailable" };
    if (response.data?.ok === true) {
      const summary = summarySchema.safeParse(response.data.summary);
      return summary.success ? { ok: true, summary: summary.data } : { ok: false, code: "unavailable" };
    }
    const code = publicCodeSchema.safeParse(response.data?.code);
    return { ok: false, code: code.success ? code.data : "unavailable" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
