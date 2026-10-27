import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildFinanceCustomerReceiptPdf } from "@/lib/export/finance-customer-receipt-pdf";
import type { FinanceCustomerReceipt } from "@/lib/finance/customer-receipt";

let fonts: Promise<{ regular: string; bold: string }> | undefined;
export async function createFinanceCustomerReceiptPdf(receipt: FinanceCustomerReceipt) {
  // Cache font assets only; customer invoice contents are never cached or made public.
  fonts ??= Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/tajawal-regular.ttf"), "base64"),
    readFile(path.join(process.cwd(), "public/fonts/tajawal-bold.ttf"), "base64"),
  ]).then(([regular,bold])=>({regular,bold})).catch(error=>{fonts=undefined;throw error;});
  return buildFinanceCustomerReceiptPdf(receipt,await fonts);
}
