"use server";

import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { readIssuedCompanyInvoice, issuedCompanyInvoicePdf, type IssuedCompanyInvoice } from "@/lib/data/company-invoices";
import { selectCompanyDocumentSender, sendCompanyDocument } from "@/lib/whatsapp/company-document";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionResult } from "@/lib/platform/action-result";
import { EmailProviderError, isBarndaksaEmailConfigured, sendBarndaksaEmail } from "@/lib/email/resend";

export async function companyInvoiceIssuerAction(slug: string) {
  return actionResult(async () => {
    const { cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية إصدار الفواتير");
    const { data, error } = await createAdminClient().from("cafe_settings").select("cafe_name,tax_number").eq("cafe_id", cafe.id).maybeSingle();
    if (error) throw new Error("تعذر تحميل بيانات البائع");
    return { name: data?.cafe_name || cafe.name, vatNumber: data?.tax_number || "", address: "" };
  }, "تعذر تحميل بيانات البائع");
}

export async function issueCompanyInvoiceAction(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = z.object({ id: z.uuid(), revision: z.number().int().positive(), expectedTotal: z.number().finite().positive().max(1_000_000_000) }).safeParse(input);
    if (!parsed.success) throw new Error("راجع بيانات الفاتورة والإجمالي قبل الإصدار");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية إصدار الفواتير");
    const { data, error } = await client.rpc("brand_finance_issue_company_invoice", { p_cafe_id: cafe.id, p_draft_id: parsed.data.id, p_revision: parsed.data.revision, p_expected_total: parsed.data.expectedTotal });
    if (error) {
      const settingErrors: Record<string, string> = {
        "Invoice settings: deposits disabled": "الدفعات المقدمة معطلة في إعدادات الفواتير راجع الدفعة قبل الإصدار",
        "Invoice settings: catalog line editing disabled": "تعديل سعر الصنف أو وصفه معطل أعد البنود إلى بيانات المنتجات المسجلة",
        "Invoice settings: line discounts disabled": "خصومات البنود معطلة في إعدادات الفواتير راجع الخصومات قبل الإصدار",
        "Invoice settings: invoice discounts disabled": "خصم إجمالي الفاتورة معطل في الإعدادات راجع الخصم قبل الإصدار",
        "Invoice settings: known inventory cost required": "أكمل تكلفة المخزون للبنود قبل الإصدار لأن البيع دون التكلفة غير مسموح",
        "Invoice settings: below inventory cost": "صافي سعر أحد البنود بعد الخصم أقل من تكلفته والبيع دون التكلفة غير مسموح",
      };
      throw new Error(Object.hasOwn(settingErrors, error.message) ? settingErrors[error.message] : /[\u0600-\u06ff]/.test(error.message) ? error.message : error.code === "40001" ? "تغيرت المسودة افتح أحدث نسخة قبل الإصدار" : "تعذر إصدار الفاتورة راجع بيانات البائع والعميل والبنود");
    }
    const invoice = data as IssuedCompanyInvoice;
    invalidateFinanceViews(slug);
    return { id: invoice.id, number: invoice.number, displayNumber: invoice.displayNumber, deliveryMethod: invoice.deliveryMethod };
  }, "تعذر تأكيد إصدار الفاتورة أعد المحاولة بالمسودة نفسها");
}

export async function findCompanyInvoiceAction(id: string, slug: string) {
  return actionResult(async () => {
    if (!z.uuid().safeParse(id).success) throw new Error("الفاتورة غير متاحة");
    const invoice = await readIssuedCompanyInvoice(slug, id);
    return invoice ? { id: invoice.id, number: invoice.number, displayNumber: invoice.displayNumber, deliveryMethod: invoice.deliveryMethod, attachments: invoice.attachments ?? [] } : null;
  }, "تعذر تحميل الفاتورة");
}

export async function sendCompanyInvoiceWhatsAppAction(id: string, slug: string) {
  return actionResult(async () => {
    if (!z.uuid().safeParse(id).success) throw new Error("الفاتورة غير متاحة");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية إرسال الفواتير");
    const invoice = await readIssuedCompanyInvoice(slug, id);
    if (!invoice) throw new Error("أصدر الفاتورة أولًا قبل إرسالها");
    if (!/^9665\d{8}$/.test(invoice.customer.phone)) throw new Error("رقم جوال العميل المحفوظ في الفاتورة غير صالح للواتساب");
    const [pdf, sender] = await Promise.all([issuedCompanyInvoicePdf(invoice), selectCompanyDocumentSender(cafe.id)]);
    if (!sender) throw new Error("رقم الواتساب غير متصل حاليًا الفاتورة محفوظة ويمكن إعادة محاولة إرسالها لاحقًا");
    const { data: claim, error: claimError } = await client.rpc("brand_finance_claim_company_delivery", { p_cafe_id: cafe.id, p_id: id });
    if (claimError || !claim) throw new Error("تعذر بدء الإرسال الفاتورة محفوظة");
    if (!claim.claimed) return { status: claim.status as string, repeated: true };
    let outcome: { status: "queued" | "rejected" | "unknown"; providerMessageId?: string };
    try { outcome = await sendCompanyDocument(sender, { phone: invoice.customer.phone, draftId: invoice.id, pdf }); }
    catch { outcome = { status: "rejected" }; }
    const { data: finished, error: finishError } = await createAdminClient().rpc("brand_finance_finish_company_delivery", { p_id: claim.id, p_lease_token: claim.leaseToken, p_status: outcome.status, p_provider_message_id: outcome.providerMessageId ?? null });
    if (finishError || finished !== true) throw new Error("تعذر تأكيد حالة الإرسال الفاتورة محفوظة ولن نكرر إرسالها تلقائيًا");
    invalidateFinanceViews(slug);
    return { status: outcome.status, repeated: false };
  }, "تعذر إرسال الفاتورة عبر الواتساب");
}

export async function sendCompanyInvoiceEmailAction(id: string, slug: string) {
  return actionResult(async () => {
    if (!z.uuid().safeParse(id).success) throw new Error("الفاتورة غير متاحة");
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية إرسال الفواتير");
    const invoice = await readIssuedCompanyInvoice(slug, id);
    if (!invoice) throw new Error("أصدر الفاتورة أولًا قبل إرسالها");
    if (!isBarndaksaEmailConfigured()) throw new Error("خدمة البريد غير مهيأة حاليًا الفاتورة محفوظة ويمكن تنزيلها");
    const pdf = await issuedCompanyInvoicePdf(invoice);
    const { data: claim, error } = await client.rpc("brand_finance_claim_company_email", { p_cafe_id: cafe.id, p_id: id });
    if (error || !claim) throw new Error("تعذر بدء الإرسال راجع البريد الإلكتروني للعميل وإعدادات الإرسال");
    if (!claim.claimed) return { status: String(claim.status), repeated: true };
    let status: "sent" | "failed" | "unknown" = "unknown", providerId: string | null = null;
    try {
      if (!z.email().safeParse(claim.email).success) throw new EmailProviderError(422);
      const result = await sendBarndaksaEmail({ to: claim.email, subject: `${invoice.documentType === "debit" ? "إشعار مدين" : "فاتورة"} ${invoice.displayNumber ?? invoice.number} — ${invoice.seller.name}`, text: `مرفق المستند الصادر من ${invoice.seller.name}`, attachments: [{ filename: `invoice-${invoice.number}.pdf`, content: Buffer.from(pdf).toString("base64") }], idempotencyKey: claim.idempotencyKey });
      providerId = result.id ?? null; status = providerId ? "sent" : "unknown";
    } catch (sendError) {
      // A timeout, network failure, 409 or server error may follow provider acceptance.
      status = sendError instanceof EmailProviderError && [400, 401, 403, 404, 413, 422, 429].includes(sendError.status) ? "failed" : "unknown";
    }
    const { data: finished, error: finishError } = await createAdminClient().rpc("brand_finance_finish_company_email", { p_id: claim.id, p_lease_token: claim.leaseToken, p_status: status, p_provider_id: providerId });
    if (finishError || finished !== true) throw new Error("تعذر تأكيد حالة الإرسال الفاتورة محفوظة ولن نكرر إرسالها تلقائيًا");
    invalidateFinanceViews(slug);
    return { status, repeated: false };
  }, "تعذر إرسال الفاتورة عبر البريد الإلكتروني");
}
