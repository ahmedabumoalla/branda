"use server";
import { revalidatePath } from "next/cache";
import { actionResult } from "@/lib/platform/action-result";
import { issueSubscriptionInvoice, listSubscriptionInvoices, prepareSubscriptionInvoicePreview } from "@/lib/data/subscription-invoices";
import { createSubscriptionInvoicePdf } from "@/lib/export/subscription-invoice-pdf";
export async function fetchSubscriptionInvoicesAction(input:unknown){return actionResult(()=>listSubscriptionInvoices(input),'تعذر تحميل الفواتير');}
export async function previewSubscriptionInvoiceAction(input:unknown){return actionResult(async()=>{const invoice=await prepareSubscriptionInvoicePreview(input);return {pdf:Buffer.from(await createSubscriptionInvoicePdf(invoice,true)).toString('base64')};},'تعذر تجهيز المعاينة حاول مجددًا');}
export async function issueSubscriptionInvoiceAction(input:unknown){return actionResult(async()=>{const invoice=await issueSubscriptionInvoice(input);revalidatePath('/admin/subscription-invoices');return invoice;},'تعذر تأكيد إصدار الفاتورة أعد المحاولة بنفس البيانات');}
