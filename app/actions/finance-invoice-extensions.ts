"use server";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { actionResult } from "@/lib/platform/action-result";
import { customerCreditStateSchema, invoiceExtensionsStateSchema } from "@/lib/finance/invoice-extensions";

async function context(slug: string, write: boolean) {
  const result = await getBrandFinanceContext(slug);
  if (!canFinance(result.cafe.role, write ? "accounting_write" : "reports")) throw new Error("لا تملك صلاحية إدارة أرصدة العملاء والفواتير");
  return result;
}
function fail(error: { message?: string; code?: string }) {
  if (error.code === "40001") throw new Error("تغيرت البيانات أعد تحميلها قبل المحاولة مجددًا");
  throw new Error(error.message && /[\u0600-\u06ff]/.test(error.message) && error.message.length < 400 ? error.message : "تعذر تنفيذ الطلب راجع البيانات والصلاحيات ثم أعد المحاولة");
}
export async function getCustomerCredit(slug: string, partyId: string) {
  return actionResult(async () => {
    if (!z.uuid().safeParse(partyId).success) throw new Error("اختر عميلًا مسجلًا");
    const { client, cafe } = await context(slug, false);
    const { data, error } = await client.rpc("brand_finance_customer_credit", { p_cafe_id: cafe.id, p_action: "list", p_input: { partyId } });
    if (error) fail(error);
    const parsed = customerCreditStateSchema.safeParse(data);
    if (!parsed.success) throw new Error("تعذر قراءة رصيد العميل");
    return parsed.data;
  }, "تعذر تحميل رصيد العميل");
}
const creditMutation = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["receive", "refund"]), partyId: z.uuid(), requestId: z.uuid(), accountId: z.uuid(), amount: z.number().finite().positive().max(1e9).multipleOf(.01), note: z.string().trim().min(3).max(500) }).strict(),
  z.object({ action: z.literal("unapply"), partyId: z.uuid(), requestId: z.uuid(), paymentId: z.uuid(), note: z.string().trim().min(3).max(500) }).strict(),
]);
export async function changeCustomerCredit(slug: string, input: unknown) {
  return actionResult(async () => {
    const parsed = creditMutation.safeParse(input);
    if (!parsed.success) throw new Error("راجع مبلغ الرصيد وحساب التحصيل وبيان العملية");
    const { client, cafe } = await context(slug, true);
    const { action, ...payload } = parsed.data;
    const { data, error } = await client.rpc("brand_finance_customer_credit", { p_cafe_id: cafe.id, p_action: action, p_input: payload });
    if (error) fail(error);
    const result = z.object({ id: z.uuid() }).safeParse(data);
    if (!result.success) throw new Error("تعذر تأكيد تسجيل الرصيد أعد المحاولة بنفس البيانات");
    return result.data;
  }, "تعذر تأكيد عملية الرصيد أعد المحاولة بنفس البيانات");
}
export async function getInvoiceExtensions(slug: string, documentId: string) {
  return actionResult(async () => {
    if (!z.uuid().safeParse(documentId).success) throw new Error("اختر فاتورة صحيحة");
    const { client, cafe } = await context(slug, false);
    const { data, error } = await client.rpc("brand_finance_invoice_extensions", { p_cafe_id: cafe.id, p_document_id: documentId, p_action: "read", p_input: {} });
    if (error) fail(error);
    const parsed = invoiceExtensionsStateSchema.safeParse(data);
    if (!parsed.success) throw new Error("تعذر قراءة بيانات الفاتورة الإضافية");
    return parsed.data;
  }, "تعذر تحميل بيانات الفاتورة الإضافية");
}
const invoiceMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), statusId: z.union([z.uuid(), z.literal("")]), revision: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal("debit"), requestId: z.uuid(), amount: z.number().finite().positive().max(1e9).multipleOf(.01), description: z.string().trim().min(3).max(500), vatRate: z.union([z.literal(0), z.literal(15)]), reason: z.string().max(250) }).strict(),
]);
export async function changeInvoiceExtensions(slug: string, documentId: string, input: unknown) {
  return actionResult(async () => {
    const parsed = invoiceMutation.safeParse(input);
    if (!z.uuid().safeParse(documentId).success || !parsed.success) throw new Error("راجع بيانات حالة الفاتورة أو الإشعار المدين");
    const { client, cafe } = await context(slug, true);
    const { action, ...payload } = parsed.data;
    const { data, error } = await client.rpc("brand_finance_invoice_extensions", { p_cafe_id: cafe.id, p_document_id: documentId, p_action: action, p_input: payload });
    if (error) fail(error);
    const result = z.object({ id: z.uuid().optional(), revision: z.number().int().nonnegative().optional() }).safeParse(data);
    if (!result.success || (action === "debit" ? !result.data.id : result.data.revision === undefined)) throw new Error("تعذر تأكيد التغيير أعد المحاولة بنفس البيانات");
    return result.data;
  }, "تعذر تأكيد التغيير أعد المحاولة بنفس البيانات");
}
