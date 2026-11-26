import { canonicalBrandMobile } from "@/lib/auth/brand-phone";
import "server-only";
import { brandAllowsNewWork } from '@/lib/data/account-cancellation';
import { MERAM_CAFE_ID } from "@/lib/commerce/meram-profile";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGreenApiFinanceReceiptConfigured, selectOperationalDeliveryConfig, sendGreenApiCustomerMessage, sendGreenApiFinanceReceipt } from "@/lib/whatsapp/green-api";
import { syncWalletCardByCode } from "@/lib/wallet";
import { financeCustomerReceiptSchema } from "@/lib/finance/customer-receipt";
import { createFinanceCustomerReceiptPdf } from "./finance-customer-receipt";

const jobSchema = z.object({
  id: z.uuid(), leaseToken: z.uuid(), phone: z.string().regex(canonicalBrandMobile),
  brandName: z.string().min(1).max(300), slug: z.string().regex(/^[a-z0-9-]{1,120}$/),
  invoiceNumber: z.union([z.number().int().positive(), z.string().min(1).max(120)]),
  loyaltyStatus: z.enum(["stamped", "pending_enrollment", "unavailable"]),
  includeCardLink: z.boolean().optional(),
  invoiceEnabled: z.boolean().optional(),
  cardCode: z.string().regex(/^[A-Z0-9_-]{4,100}$/).nullish(),
  receipt: financeCustomerReceiptSchema,
}).refine(row=>String(row.receipt.number)===String(row.invoiceNumber)&&row.receipt.brandName===row.brandName,"Invoice identity mismatch");
type CustomerMessageJob = z.infer<typeof jobSchema>;

export function financePosCustomerMessage(job: CustomerMessageJob) {
  const row = jobSchema.parse(job);
  return [
    `شكرًا لزيارتك ${row.brandName.slice(0,100)}`,
    ...(row.invoiceEnabled !== false ? [`فاتورتك رقم ${row.invoiceNumber}`, "نسخة فاتورتك مرفقة مع الرسالة"] : []),
    ...(row.loyaltyStatus === "stamped" ? ["تم تسجيل ختم مشترياتك على بطاقة الولاء"] : row.loyaltyStatus === "pending_enrollment" ? ["ختم مشترياتك محفوظ ويُضاف إلى بطاقتك بعد تسجيل اسمك ورقم جوالك"] : []),
    ...(row.loyaltyStatus !== "unavailable" && row.includeCardLink !== false ? ["افتح بطاقة الولاء وأضفها إلى محفظة جوالك", `https://barndaksa.com/loyalty/${encodeURIComponent(row.slug)}`] : []),
    `أُرسلت عبر برندة نيابة عن ${row.brandName.slice(0,100)}`,
  ].join("\n");
}

/** SQL claims are single-use; ambiguous sends and expired leases require review, never automatic resend */
export async function dispatchFinancePosCustomerMessages(cafeId?: string) {
  if (cafeId) z.uuid().parse(cafeId);
  const sharedConfigured = isGreenApiFinanceReceiptConfigured();
  if (!sharedConfigured && cafeId && cafeId !== MERAM_CAFE_ID) return { configured: false, claimed: 0, queued: 0, needsReview: 0 };
  const claimCafeId = cafeId ?? (sharedConfigured ? null : MERAM_CAFE_ID);
  const client = createAdminClient();
  // One receipt leaves room for rendering, primary retries and the four-minute lease.
  const { data, error } = await client.rpc("brand_finance_claim_customer_messages", { p_cafe_id: claimCafeId, p_limit: 1 });
  if (error || !Array.isArray(data)) throw new Error("FINANCE_CUSTOMER_QUEUE_UNAVAILABLE");
  let queued = 0; let needsReview = 0;
  const walletCodes = new Set<string>();
  for (const value of data) {
    const parsed = jobSchema.safeParse(value);
    let status: "queued" | "rejected" | "unknown" = "rejected";
    let messageId: string | undefined;
    let errorCode = "customer_receipt_invalid";
    // The receipt projection carries the invoice owner's immutable ID. Older projections need a lease lookup.
    let jobCafeId = claimCafeId ?? parsed.data?.receipt.cafeId;
    if (parsed.success && !jobCafeId) {
      const job = await client.from("bf_customer_message_jobs").select("cafe_id")
        .eq("id", parsed.data.id).eq("lease_token", parsed.data.leaseToken).single();
      if (job.error || !job.data?.cafe_id) throw new Error("FINANCE_CUSTOMER_QUEUE_UNAVAILABLE");
      jobCafeId = String(job.data.cafe_id);
    }
    const allowed = parsed.success && jobCafeId && await brandAllowsNewWork(jobCafeId);
    if (parsed.success && !allowed) errorCode = 'brand_archived_before_dispatch';
    if (parsed.success && jobCafeId && allowed) {
      if (parsed.data.loyaltyStatus === "stamped" && parsed.data.cardCode) walletCodes.add(parsed.data.cardCode);
      let pdf: Uint8Array | undefined;
      const renderStarted = Date.now();
      try {
        if (parsed.data.invoiceEnabled !== false) pdf = await createFinanceCustomerReceiptPdf(parsed.data.receipt);
      } catch {
        // Only quick pre-send renderer failures can safely retry within this lease.
        if (Date.now() - renderStarted < 5000) {
          try { pdf = await createFinanceCustomerReceiptPdf(parsed.data.receipt); } catch { /* No provider request occurred */ }
        }
      }
      errorCode = "customer_receipt_render_failed";
      if (pdf || parsed.data.invoiceEnabled === false && parsed.data.includeCardLink !== false) {
        if (!await brandAllowsNewWork(jobCafeId)) {
          errorCode = 'brand_archived_before_dispatch';
          if(parsed.data.cardCode)walletCodes.delete(parsed.data.cardCode);
        } else try {
          const result = parsed.data.invoiceEnabled === false
            ? await sendGreenApiCustomerMessage(await selectOperationalDeliveryConfig(jobCafeId), { phone: parsed.data.phone, message: financePosCustomerMessage(parsed.data) })
            : await sendGreenApiFinanceReceipt({ phone: parsed.data.phone, message: financePosCustomerMessage(parsed.data), pdf: pdf!, invoiceNumber: parsed.data.receipt.number }, jobCafeId);
          status = result.status; messageId = result.providerMessageId;
          errorCode = ("errorCode" in result && typeof result.errorCode === "string" ? result.errorCode : undefined) ?? `customer_message_${status}`;
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
