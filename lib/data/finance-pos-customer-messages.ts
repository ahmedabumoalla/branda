import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGreenApiFinanceReceiptConfigured, sendGreenApiFinanceReceipt } from "@/lib/whatsapp/green-api";
import { syncWalletCardByCode } from "@/lib/wallet";
import { financeCustomerReceiptSchema } from "@/lib/finance/customer-receipt";
import { createFinanceCustomerReceiptPdf } from "./finance-customer-receipt";

const jobSchema = z.object({
  id: z.uuid(), leaseToken: z.uuid(), phone: z.string().regex(/^9665\d{8}$/),
  brandName: z.string().min(1).max(300), slug: z.string().regex(/^[a-z0-9-]{1,120}$/),
  invoiceNumber: z.union([z.number().int().positive(), z.string().min(1).max(120)]),
  loyaltyStatus: z.enum(["stamped", "pending_enrollment"]),
  cardCode: z.string().regex(/^[A-Z0-9_-]{4,100}$/).nullish(),
  receipt: financeCustomerReceiptSchema,
}).refine(row=>String(row.receipt.number)===String(row.invoiceNumber)&&row.receipt.brandName===row.brandName,"Invoice identity mismatch");
type CustomerMessageJob = z.infer<typeof jobSchema>;

export function financePosCustomerMessage(job: CustomerMessageJob) {
  const row = jobSchema.parse(job);
  return [
    `شكرًا لزيارتك ${row.brandName.slice(0,100)}`,
    `فاتورتك رقم ${row.invoiceNumber}`,
    "نسخة فاتورتك مرفقة مع الرسالة",
    row.loyaltyStatus === "stamped" ? "تم تسجيل ختم مشترياتك على بطاقة الولاء" : "ختم مشترياتك محفوظ ويُضاف إلى بطاقتك بعد تسجيل اسمك ورقم جوالك",
    "افتح بطاقة الولاء وأضفها إلى محفظة جوالك",
    `https://barndaksa.com/loyalty/${encodeURIComponent(row.slug)}`,
    `أُرسلت عبر برندة نيابة عن ${row.brandName.slice(0,100)}`,
  ].join("\n");
}

/** SQL claims are single-use; ambiguous sends and expired leases require review, never automatic resend */
export async function dispatchFinancePosCustomerMessages(cafeId?: string) {
  if (cafeId) z.uuid().parse(cafeId);
  if (!isGreenApiFinanceReceiptConfigured()) return { configured: false, claimed: 0, queued: 0, needsReview: 0 };
  const client = createAdminClient();
  // A cold thermal renderer must finish before the two-minute database lease expires.
  const { data, error } = await client.rpc("brand_finance_claim_customer_messages", { p_cafe_id: cafeId ?? null, p_limit: 1 });
  if (error || !Array.isArray(data)) throw new Error("FINANCE_CUSTOMER_QUEUE_UNAVAILABLE");
  let queued = 0; let needsReview = 0;
  const walletCodes = new Set<string>();
  for (const value of data) {
    const parsed = jobSchema.safeParse(value);
    let status: "queued" | "rejected" | "unknown" = "rejected";
    let messageId: string | undefined;
    let errorCode = "customer_receipt_invalid";
    if (parsed.success) {
      if (parsed.data.loyaltyStatus === "stamped" && parsed.data.cardCode) walletCodes.add(parsed.data.cardCode);
      let pdf: Uint8Array | undefined;
      const renderStarted = Date.now();
      try {
        pdf = await createFinanceCustomerReceiptPdf(parsed.data.receipt);
      } catch {
        // Only quick pre-send renderer failures can safely retry within this lease.
        if (Date.now() - renderStarted < 5000) {
          try { pdf = await createFinanceCustomerReceiptPdf(parsed.data.receipt); } catch { /* No provider request occurred */ }
        }
      }
      errorCode = "customer_receipt_render_failed";
      if (pdf) {
        try {
          const result = await sendGreenApiFinanceReceipt({ phone: parsed.data.phone, message: financePosCustomerMessage(parsed.data), pdf, invoiceNumber: parsed.data.receipt.number });
          status = result.status; messageId = result.providerMessageId;
          errorCode = result.errorCode ?? `customer_message_${status}`;
        } catch { status = "unknown"; errorCode = "customer_media_exception"; }
      }
    }
    // Invalid queue rows never reach the provider; persist a safe rejection if their lease identity is valid
    const identity = z.object({ id: z.uuid(), leaseToken: z.uuid() }).safeParse(value);
    if (!identity.success) { needsReview++; continue; }
    if (status !== "queued") console.warn("FINANCE_CUSTOMER_MESSAGE_FAILED", { jobId: identity.data.id, code: errorCode });
    try {
      const { data: completed, error: finishError } = await client.rpc("brand_finance_finish_customer_message", {
        p_job_id: identity.data.id, p_lease_token: identity.data.leaseToken, p_status: status,
        p_provider_message_id: messageId ?? null, p_error_code: status === "queued" ? null : errorCode,
      });
      if (finishError || completed !== true || status !== "queued") needsReview++;
      else queued++;
    } catch { needsReview++; }
  }
  // Persist every WhatsApp outcome before wallet provider fan-out can consume the lease window
  // Wallet failures retain their existing durable retry jobs and cannot change the message outcome
  await Promise.allSettled([...walletCodes].map(code => syncWalletCardByCode(code)));
  return { configured: true, claimed: data.length, queued, needsReview };
}
