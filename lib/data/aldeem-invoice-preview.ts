import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getBrandFinanceContext } from "./brand-finance";
import { readIssuedCompanyInvoice, issuedCompanyInvoicePdf } from "./company-invoices";
import { buildFinanceCustomerReceiptPdf } from "@/lib/export/finance-customer-receipt-pdf";
import { financeCustomerReceiptSchema } from "@/lib/finance/customer-receipt";

/** Both invoice sources use the saved invoice, never client-supplied amounts or recipients. */
export async function readAldeemSalesInvoicePreview(id: string, slug: string) {
  if (slug !== "khayal-aldeem" || !z.uuid().safeParse(id).success) throw new Error("الفاتورة غير متاحة");
  const context = await getBrandFinanceContext(slug);
  if (context.cafe.slug !== slug || context.cafe.role !== "owner") throw new Error("لا تملك صلاحية عرض الفاتورة");
  const [invoice, result] = await Promise.all([
    readIssuedCompanyInvoice(slug, id),
    context.client.rpc("aldeem_sales_invoice_receipt", { p_cafe_id: context.cafe.id, p_id: id }),
  ]);
  if (invoice) return { ...context, invoice, receipt: null };
  if (result.error || !result.data) throw new Error("تعذر تحميل نسخة الفاتورة");
  const receipt = financeCustomerReceiptSchema.parse(result.data);
  if (receipt.cafeId !== context.cafe.id) throw new Error("الفاتورة غير متاحة");
  return { ...context, invoice: null, receipt };
}

let fonts: Promise<{ regular: string; bold: string }> | undefined;
export async function createAldeemSalesInvoicePreviewPdf(preview: Awaited<ReturnType<typeof readAldeemSalesInvoicePreview>>) {
  if (preview.invoice) return issuedCompanyInvoicePdf(preview.invoice);
  fonts ??= Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/tajawal-regular.ttf"), "base64"),
    readFile(path.join(process.cwd(), "public/fonts/tajawal-bold.ttf"), "base64"),
  ]).then(([regular, bold]) => ({ regular, bold })).catch(error => { fonts = undefined; throw error; });
  return buildFinanceCustomerReceiptPdf(preview.receipt!, await fonts, { includeIdentity: true });
}
