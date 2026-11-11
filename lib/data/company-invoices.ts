import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getBrandFinanceContext } from "./brand-finance";
import { buildCompanyInvoicePreviewPdf } from "@/lib/export/company-invoice-preview-pdf";
import { invoiceOptionsNote, type InvoiceDelivery, type InvoiceDeposit, type InvoiceFile, type ShippingMode } from "@/lib/finance/company-invoice-options";

export type IssuedCompanyInvoice = {
  id: string; number: number; type: "standard" | "simplified"; issuedAt: string; supplyDate: string;
  seller: { name: string; vatNumber: string; address: string };
  customer: { name: string; vatNumber: string; address: string; phone: string; email?: string };
  lines: { productId?: string; name: string; kind?: "product" | "service"; description: string; quantity: number; price: number; discount: number; net: number; tax: number; total: number; vatRate?: number; taxCategory?: string; exemptionReason?: string }[];
  subtotal: number; discount: number; tax: number; total: number; paid: number; taxInclusive: boolean;
  note: string; extraFields: { title: string; value: string }[]; template: "standard" | "thermal"; deliveryMethod: "print" | "whatsapp" | "email" | "both";
  displayNumber?: string; currency?: string; exchangeRate?: number; decimalDisplay?: "always" | "never" | "auto";
  documentType?: "invoice" | "debit"; sourceId?: string; sourceNumber?: string; reason?: string;
  sar?: { subtotal: number; discount: number; tax: number; total: number; paid: number; cashPaid: number; creditApplied: number };
  cashPaid?: number; creditApplied?: number; adjustment?: { typeId: string; amount: number; kind: "addition" | "deduction"; taxable: boolean; name: string; net: number; tax: number; total: number };
  deposit?: InvoiceDeposit & { amount: number };
  shipping?: { mode: ShippingMode; address: string };
  delivery?: InvoiceDelivery;
  attachments?: InvoiceFile[];
};

export async function readIssuedCompanyInvoice(slug: string, id: string) {
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_company_invoice", { p_cafe_id: cafe.id, p_id: id });
  if (error) throw new Error("تعذر قراءة الفاتورة أو لا تملك صلاحية الوصول إليها");
  return data as IssuedCompanyInvoice | null;
}

export async function issuedCompanyInvoicePdf(invoice: IssuedCompanyInvoice) {
  const [regular, bold] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/tajawal-regular.ttf"), "base64"),
    readFile(path.join(process.cwd(), "public/fonts/tajawal-bold.ttf"), "base64"),
  ]);
  return new Uint8Array(buildCompanyInvoicePreviewPdf({
    ...invoice, brand: invoice.seller.name, customer: invoice.customer.name, taxNumber: invoice.customer.vatNumber,
    thermal: invoice.template === "thermal",
    note: [invoice.note, ...invoice.extraFields.map(field => `${field.title}: ${field.value}`), invoiceOptionsNote(invoice.shipping, invoice.delivery, invoice.attachments)].filter(Boolean).join("\n"),
    issued: { id: invoice.id, number: invoice.number, displayNumber: invoice.displayNumber, invoiceType: invoice.type, issuedAt: invoice.issuedAt, supplyDate: invoice.supplyDate, sellerName: invoice.seller.name, sellerVat: invoice.seller.vatNumber, sellerAddress: invoice.seller.address, customerAddress: invoice.customer.address, taxInclusive: invoice.taxInclusive },
  }, { regular, bold }).output("arraybuffer"));
}
