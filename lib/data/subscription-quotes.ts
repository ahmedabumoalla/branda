import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionInvoice } from "@/lib/data/subscription-invoices";
import { convertSubscriptionQuoteSchema, previewSubscriptionQuote, saveSubscriptionQuoteSchema, subscriptionQuoteDraftSchema, type SubscriptionQuote, type SubscriptionQuoteList } from "@/lib/platform/subscription-quotes";

function quoteError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  const message = String(error.message ?? "");
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? "")) throw new Error("حفظ عروض الأسعار غير مفعّل حاليًا يمكنك معاينة العرض");
  if (message.includes("QUOTE_STALE")) throw new Error("تغير عرض السعر منذ فتحه افتحه من السجل مجددًا قبل الحفظ أو التحويل");
  if (message.includes("QUOTE_ALREADY_CONVERTED")) throw new Error("تم تحويل عرض السعر إلى فاتورة افتحه من السجل لعرض الفاتورة الصادرة");
  if (message.includes("QUOTE_REQUEST_CHANGED")) throw new Error("هذه المحاولة مرتبطة ببيانات مختلفة افتح عرض السعر من السجل قبل المتابعة");
  if (message.includes("INVALID_QUOTE")) throw new Error("راجع بيانات العميل والبنود والأسعار والتواريخ");
  throw new Error("تعذر تأكيد العملية أعد المحاولة بنفس البيانات لتجنب التكرار");
}

export async function listSubscriptionQuotes(input: unknown = { page: 0, search: "" }): Promise<SubscriptionQuoteList> {
  await requirePlatformAdmin();
  const { page, search } = z.object({ page: z.number().int().min(0).max(100000), search: z.string().trim().max(160) }).strict().parse(input);
  const db = await createClient();
  let query = db.from("platform_subscription_quotes").select("id,quote_number,created_at,customer_name,total_cents,revision,converted_invoice_id", { count: "exact" });
  if (search) {
    const safe = search.replace(/[\\%_]/g, character => "\\" + character);
    query = query.ilike(search.toUpperCase().startsWith("QT-") ? "quote_number" : "customer_name", `%${safe}%`);
  }
  const result = await query.order("created_at", { ascending: false }).order("id").range(page * 20, page * 20 + 19);
  quoteError(result.error);
  return { rows: result.data ?? [], total: result.count ?? 0, page, search };
}

export async function getSubscriptionQuote(input: unknown): Promise<SubscriptionQuote> {
  await requirePlatformAdmin();
  const id = z.uuid().parse(input), db = await createClient();
  const result = await db.from("platform_subscription_quotes").select("data").eq("id", id).maybeSingle();
  quoteError(result.error);
  if (!result.data) throw new Error("عرض السعر غير متاح");
  return result.data.data as SubscriptionQuote;
}

export async function prepareSubscriptionQuotePreview(input: unknown) {
  await requirePlatformAdmin();
  const parsed = subscriptionQuoteDraftSchema.safeParse(input);
  if (!parsed.success) throw new Error("راجع بيانات العميل والبنود والأسعار والتواريخ");
  return previewSubscriptionQuote(parsed.data, randomUUID());
}

export async function saveSubscriptionQuote(input: unknown): Promise<SubscriptionQuote> {
  await requirePlatformAdmin();
  const parsed = saveSubscriptionQuoteSchema.safeParse(input);
  if (!parsed.success) throw new Error("راجع بيانات عرض السعر قبل الحفظ");
  const { id, requestId, revision, draft } = parsed.data, db = await createClient();
  const result = await db.rpc("admin_save_subscription_quote", { p_id: id, p_request_id: requestId, p_revision: revision, p_input: draft });
  quoteError(result.error);
  return getSubscriptionQuote(result.data);
}

export async function convertSubscriptionQuote(input: unknown) {
  await requirePlatformAdmin();
  const parsed = convertSubscriptionQuoteSchema.safeParse(input);
  if (!parsed.success) throw new Error("راجع بيانات العميل وتاريخ استحقاق الفاتورة");
  const { id, requestId, revision, customer, dueDate } = parsed.data, db = await createClient();
  const result = await db.rpc("admin_convert_subscription_quote", { p_id: id, p_request_id: requestId, p_revision: revision, p_customer: customer, p_due_date: dueDate });
  quoteError(result.error);
  return getSubscriptionInvoice(result.data);
}
