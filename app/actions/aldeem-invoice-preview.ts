"use server";

import { z } from "zod";
import { readAldeemSalesInvoicePreview, createAldeemSalesInvoicePreviewPdf } from "@/lib/data/aldeem-invoice-preview";
import { brandAllowsNewWork } from "@/lib/data/account-cancellation";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionResult } from "@/lib/platform/action-result";
import { sendGreenApiFinanceReceipt, isGreenApiFinanceReceiptConfigured } from "@/lib/whatsapp/green-api";
import { sendCompanyInvoiceWhatsAppAction } from "./finance-company-invoices";

export async function sendSalesInvoiceWhatsAppAction(id: string, slug: string) {
  return actionResult(async () => {
    const preview = await readAldeemSalesInvoicePreview(id, slug);
    if (!await brandAllowsNewWork(preview.cafe.id)) throw new Error("إرسال الفواتير غير متاح لهذا الحساب");
    if (preview.invoice) {
      const result = await sendCompanyInvoiceWhatsAppAction(preview.invoice.id, slug);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    }
    const receipt = preview.receipt!;
    if (!receipt.customerPhone || !/^9665\d{8}$/.test(receipt.customerPhone)) throw new Error("لا يوجد رقم جوال صالح محفوظ في الفاتورة لإرسالها عبر الواتساب");
    if (!isGreenApiFinanceReceiptConfigured()) throw new Error("إرسال الواتساب غير مهيأ حاليًا ويمكنك تنزيل الفاتورة");
    // Render before claiming so a PDF failure cannot consume a send attempt.
    const pdf = await createAldeemSalesInvoicePreviewPdf(preview);
    const claimed = await preview.client.rpc("aldeem_claim_sales_invoice_delivery", { p_cafe_id: preview.cafe.id, p_id: id });
    if (claimed.error || !claimed.data) throw new Error("تعذر بدء الإرسال أعد المحاولة");
    const claim = z.discriminatedUnion("claimed", [
      z.object({ claimed: z.literal(true), id: z.uuid(), leaseToken: z.uuid() }),
      z.object({ claimed: z.literal(false), status: z.enum(["sending", "queued", "rejected", "unknown"]) }),
    ]).parse(claimed.data);
    if (!claim.claimed) return { status: claim.status, repeated: true };
    let outcome: { status: "queued" | "rejected" | "unknown"; providerMessageId?: string } = { status: "unknown" };
    try {
      if (!await brandAllowsNewWork(preview.cafe.id)) outcome = { status: "rejected" };
      else {
        const result = await sendGreenApiFinanceReceipt({ phone: receipt.customerPhone, pdf, invoiceNumber: receipt.number, message: `فاتورتك رقم ${receipt.number} من ${receipt.brandName.slice(0, 100)}\nنسخة فاتورتك مرفقة مع الرسالة` });
        outcome = result.errorCode === "customer_media_http_408" ? { status: "unknown" } : result;
      }
    } catch { /* An unconfirmed provider request must never be retried automatically. */ }
    const finished = await createAdminClient().rpc("aldeem_finish_sales_invoice_delivery", { p_id: claim.id, p_lease_token: claim.leaseToken, p_status: outcome.status, p_provider_message_id: outcome.providerMessageId ?? null });
    if (finished.error || finished.data !== true) throw new Error("تعذر تأكيد حالة الإرسال ولن نكرر الرسالة تلقائيًا");
    return { status: outcome.status, repeated: false };
  }, "تعذر إرسال الفاتورة عبر الواتساب");
}
