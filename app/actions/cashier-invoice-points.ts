"use server";

import { after } from "next/server";
import { z } from "zod";
import { requireCashierPermission } from "@/lib/data/cashier";
import { resolveCashierLoyaltyPhone } from "@/lib/data/cashier-loyalty-phone";
import { lookupRastCashierCard, resolveCashierCardNumber } from "@/lib/data/loyalty-experience";
import { assertRastLoyaltyEntitlement } from "@/lib/data/rast-loyalty-access";
import { isCashierLoyaltyCode, normalizeLoyaltyDigits, normalizeLoyaltyReadPhone, resolveReadMethod } from "@/lib/loyalty/read-identifier";
import { invoiceCreditSchema, invoiceScopeSchema } from "@/lib/loyalty/invoice-points-input";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncWalletCardByCode } from "@/lib/wallet";

type Scope = z.infer<typeof invoiceScopeSchema>;
const affordableRewards = z.array(z.object({ points: z.number().int().positive(), reward: z.string() }));
const cardCode = z.string().min(1).max(100).refine(isCashierLoyaltyCode);

function refreshWallet(code: string) {
  after(async () => {
    try { await syncWalletCardByCode(code); } catch { console.warn("[loyalty-wallet-sync] deferred"); }
  });
}

async function pointsSession(scope: Scope) {
  const session = await requireCashierPermission("loyalty");
  if (session.cafeId !== scope.cafeId || session.cashierId !== scope.cashierId) {
    throw new Error("تغيرت جلسة الكاشير افتح القارئ مجددًا");
  }
  await assertRastLoyaltyEntitlement(session.cafeId);
  return session;
}

async function resolveIdentifier(cafeId: string, identifier: string) {
  const raw = normalizeLoyaltyDigits(z.string().trim().min(1).max(500).parse(identifier));
  const code = resolveReadMethod("code", raw) === "phone" ? await resolveCashierLoyaltyPhone(raw)
    : await resolveCashierCardNumber(parseBarndaksaQrPayload(raw, "loyalty-card") ?? raw.toUpperCase(), cafeId);
  if (!isCashierLoyaltyCode(code)) throw new Error("رمز البطاقة غير صالح");
  return code;
}

export async function resolveInvoiceCardAction(scope: Scope, identifier: string) {
  const session = await pointsSession(invoiceScopeSchema.parse(scope));
  const phone = normalizeLoyaltyReadPhone(z.string().trim().min(1).max(500).parse(identifier));
  if (phone) return `+${phone}`;
  return resolveIdentifier(session.cafeId, identifier);
}

export async function inspectPointsCardAction(scope: Scope, identifier: string) {
  const session = await pointsSession(invoiceScopeSchema.parse(scope));
  const code = await resolveIdentifier(session.cafeId, identifier);
  const [card, options] = await Promise.all([
    lookupRastCashierCard(code),
    createAdminClient().rpc("get_loyalty_points_options", { p_session_token: session.token, p_card_code: code }),
  ]);
  if (options.error || options.data?.ok !== true) throw new Error("تعذر قراءة رصيد البطاقة");
  const current = z.object({ pointsBalance: z.number().int().nonnegative(), affordableRewards }).parse(options.data);
  return { code, customerName: card.customerName, ...current };
}

const award = z.object({
  ok: z.literal(true), status: z.literal("points_added"), pointsAdded: z.number().int().nonnegative(),
  pointsBalance: z.number().int().nonnegative(), cardCode: z.string(),
  affordableRewards,
});

export async function addCashierInvoicePointsAction(input: z.input<typeof invoiceCreditSchema>) {
  const parsed = invoiceCreditSchema.parse(input);
  const session = await pointsSession(parsed.scope);
  const args = {
    p_session_token: session.token, p_request_id: parsed.requestId,
    p_amount_sar: parsed.amountHalalas / 100, p_expected_rate_sar: parsed.rateSar, p_expected_rate_quantity: parsed.rateQuantity,
  };
  const client = createAdminClient();
  const { data, error } = "phone" in parsed
    ? await client.rpc("scan_loyalty_invoice_points_by_phone", { ...args, p_phone: parsed.phone })
    : await client.rpc("scan_loyalty_invoice_points", { ...args, p_card_code: parsed.cardCode });
  if (error?.message?.includes("Scan request conflict")) return { ok: false as const, reason: "request_conflict" };
  if (error?.code === "42501") return { ok: false as const, reason: "unauthorized" };
  if (error) throw new Error("تعذر تأكيد تسجيل النقاط");
  if (data?.ok === false || data?.status === "approval_pending" || data?.status === "approval_rejected") {
    return { ok: false as const, reason: String(data.errorCode ?? data.status) };
  }
  const result = award.parse(data);
  refreshWallet(result.cardCode);
  return { ok: true as const, pointsAdded: result.pointsAdded, pointsBalance: result.pointsBalance, affordableRewards: result.affordableRewards };
}

const redemption = z.object({
  scope: invoiceScopeSchema, cardCode, requestId: z.string().uuid(), cost: z.number().int().positive(),
  reward: z.string().min(1).max(120), expectedBalance: z.number().int().nonnegative(),
}).strict();

export async function redeemCashierPointsAction(input: z.infer<typeof redemption>) {
  const parsed = redemption.parse(input);
  const session = await pointsSession(parsed.scope);
  const { data, error } = await createAdminClient().rpc("redeem_loyalty_points_reward", {
    p_session_token: session.token, p_card_code: parsed.cardCode, p_request_id: parsed.requestId,
    p_cost: parsed.cost, p_reward: parsed.reward, p_expected_balance: parsed.expectedBalance,
  });
  if (error) throw new Error("تعذر تأكيد استبدال النقاط");
  if (data?.ok === false) return { ok: false as const, reason: String(data.errorCode ?? data.status) };
  const result = z.object({ ok: z.literal(true), status: z.literal("points_redeemed"), cardCode,
    pointsSpent: z.number().int().positive(), pointsBalance: z.number().int().nonnegative(), reward: z.string(),
    affordableRewards, replayed: z.boolean().optional(),
  }).parse(data);
  refreshWallet(result.cardCode);
  return { ok: true as const, pointsSpent: result.pointsSpent, pointsBalance: result.pointsBalance, reward: result.reward,
    replayed: result.replayed === true, affordableRewards: result.affordableRewards };
}
