import { canonicalBrandMobile } from "@/lib/auth/brand-phone";
import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLoyaltySessionToken, loyaltyIdentityHash } from "@/lib/auth/loyalty-session-token";
import { getGoogleWalletSaveState } from "@/lib/wallet/google";
import { financeCustomerReceiptSchema } from "@/lib/finance/customer-receipt";
import { createFinanceCustomerReceiptPdf } from "@/lib/data/finance-customer-receipt";
import { isGreenApiFinanceReceiptConfigured, selectGreenApiPlatformSender, sendGreenApiCustomerMessage, sendGreenApiFinanceReceipt } from "@/lib/whatsapp/green-api";

const contextSchema = z.object({
  kind: z.enum(["account", "invoice", "loyalty_card"]), phone: z.string().regex(canonicalBrandMobile), customerName: z.string().max(300),
  brand: z.object({ name: z.string().min(1).max(300), slug: z.literal("mind-hospital") }),
  document: financeCustomerReceiptSchema.nullish(), invoiceEnabled: z.boolean(),
  cafeId: z.uuid().optional(), profileId: z.uuid().nullish(), cardId: z.uuid().nullish(), googleIssued: z.boolean().optional(),
  cardCode: z.string().max(100).nullish(),
});
type CustomerContext = z.infer<typeof contextSchema>;

/** Distinct message kinds prevent account/card links from appearing on every invoice. */
export function hospitalCustomerMessage(context: CustomerContext) {
  const row = contextSchema.parse(context);
  if (row.kind === "account") return [
    `أهلًا ${row.customerName}`,
    "حسابك في MND جاهز",
    "من هنا تقدر تراجع فواتيرك ومدفوعاتك والمبالغ المتبقية وتدخل برقم جوالك",
    `https://barndaksa.com/c/${row.brand.slug}/hospital-account`,
  ].join("\n\n");
  if (row.kind === "invoice") {
    if (!row.document) throw new Error("Hospital invoice missing");
    return ["شكرًا لاختيارك MND", "سعدنا بطلبك ونتمنى لك يومًا جميلًا", `فاتورتك رقم ${row.document.number} مرفقة مع الرسالة`].join("\n\n");
  }
  if (!row.cafeId || !row.profileId || !row.cardId) throw new Error("Hospital loyalty identity missing");
  const token = createLoyaltySessionToken({ slug: row.brand.slug, cafeId: row.cafeId, profileId: row.profileId, phoneHash: loyaltyIdentityHash(row.phone) });
  return ["يا هلا فيك في MND", "بطاقة الولاء جاهزة لك", "افتح بطاقتك وأضفها إلى محفظة جوالك", `https://barndaksa.com/loyalty/${row.brand.slug}/access?token=${encodeURIComponent(token)}`].join("\n\n");
}

/** Customer delivery is enabled on production; explicit false is an emergency stop. Local and preview never dispatch. */
export async function runHospitalCustomerMessages(cafeId?: string) {
  if (process.env.NODE_ENV !== "production" || process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "production" || process.env.HOSPITAL_NOTIFICATIONS_ENABLED === "false") return { disabled: true, claimed: 0, queued: 0 };
  if (cafeId) z.uuid().parse(cafeId);
  const client = createAdminClient();
  const claimed = await client.rpc("hospital_customer_messages_claim", { p_limit: 1, p_cafe: cafeId ?? null });
  if (claimed.error || !Array.isArray(claimed.data)) throw new Error("Hospital customer queue unavailable");
  let queued = 0;
  for (const value of claimed.data) {
    const identity = z.object({ id: z.uuid(), lease_token: z.uuid() }).parse(value);
    const params = { p_id: identity.id, p_lease: identity.lease_token };
    const finish = async (outcome: "queued" | "rejected" | "unknown" | "not_sent" | "skipped", messageId: string | null = null) => {
      const result = await client.rpc("hospital_customer_message_finish", { ...params, p_outcome: outcome, p_message_id: messageId });
      if (result.error || result.data !== true) throw new Error("Hospital customer acknowledgement unavailable");
      if (outcome === "queued") queued++;
    };
    const loaded = await client.rpc("hospital_customer_message_context", params);
    if (loaded.error) { await finish("not_sent"); continue; }
    const parsed = contextSchema.safeParse(loaded.data);
    if (!parsed.success) { await finish("skipped"); continue; }
    const row = parsed.data;
    let sender: Awaited<ReturnType<typeof selectGreenApiPlatformSender>> | undefined;
    let pdf: Uint8Array | undefined;
    let message: string;
    try {
      if (row.kind === "loyalty_card" && row.googleIssued) {
        if (!row.cafeId || !row.cardId) { await finish("skipped"); continue; }
        if (await getGoogleWalletSaveState({ cafeId: row.cafeId, cardId: row.cardId })) { await finish("skipped"); continue; }
      }
      if (row.kind === "invoice") {
        if (!row.invoiceEnabled || !row.document) { await finish("skipped"); continue; }
        if (!isGreenApiFinanceReceiptConfigured()) { await finish("not_sent"); continue; }
        pdf = await createFinanceCustomerReceiptPdf(row.document);
      } else sender = await selectGreenApiPlatformSender();
      message = hospitalCustomerMessage(row);
    } catch { await finish("not_sent"); continue; }
    // Recheck live owner preference and wallet-download state immediately before dispatch
    const approved = await client.rpc("hospital_customer_message_authorize", params);
    if (approved.error) { await finish("not_sent"); continue; }
    if (approved.data !== true) continue;
    let outcome: "queued" | "rejected" | "unknown" = "unknown", messageId: string | null = null;
    try {
      const result = row.kind === "invoice"
        ? await sendGreenApiFinanceReceipt({ phone: row.phone, message, pdf: pdf!, invoiceNumber: row.document!.number })
        : await sendGreenApiCustomerMessage(sender!, { phone: row.phone, message });
      outcome = result.status; messageId = result.providerMessageId ?? null;
    } catch { /* An ambiguous provider call is never retried automatically. */ }
    await finish(outcome, messageId);
  }
  return { disabled: false, claimed: claimed.data.length, queued };
}
