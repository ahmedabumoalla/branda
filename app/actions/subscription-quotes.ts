"use server";
import { revalidatePath } from "next/cache";
import { actionResult } from "@/lib/platform/action-result";
import { convertSubscriptionQuote, getSubscriptionQuote, listSubscriptionQuotes, prepareSubscriptionQuotePreview, saveSubscriptionQuote } from "@/lib/data/subscription-quotes";
import { createSubscriptionQuotePdf } from "@/lib/export/subscription-quote-pdf";

export async function fetchSubscriptionQuotesAction(input: unknown) {
  return actionResult(() => listSubscriptionQuotes(input), "تعذر تحميل عروض الأسعار");
}
export async function getSubscriptionQuoteAction(id: unknown) {
  return actionResult(() => getSubscriptionQuote(id), "تعذر تحميل عرض السعر");
}
export async function previewSubscriptionQuoteAction(input: unknown) {
  return actionResult(async () => {
    const quote = await prepareSubscriptionQuotePreview(input);
    return { pdf: Buffer.from(await createSubscriptionQuotePdf(quote, true)).toString("base64") };
  }, "تعذر تجهيز معاينة عرض السعر حاول مجددًا");
}
export async function saveSubscriptionQuoteAction(input: unknown) {
  return actionResult(async () => {
    const quote = await saveSubscriptionQuote(input);
    revalidatePath("/admin/subscription-invoices");
    return quote;
  }, "تعذر تأكيد حفظ عرض السعر أعد المحاولة بنفس البيانات");
}
export async function convertSubscriptionQuoteAction(input: unknown) {
  return actionResult(async () => {
    const invoice = await convertSubscriptionQuote(input);
    revalidatePath("/admin/subscription-invoices");
    return invoice;
  }, "تعذر تأكيد إصدار الفاتورة أعد المحاولة بنفس البيانات");
}
