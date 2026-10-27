import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { FinanceReceipt } from "@/components/finance/finance-ui";
import { thermalReceiptCss, type ReceiptBrand } from "@/components/finance/finance-receipt-print";
import type { FinanceDocument, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { financeCustomerReceiptSchema, type FinanceCustomerReceipt, type FinanceCustomerReceiptFonts } from "@/lib/finance/customer-receipt";

/** The same React customer receipt and print stylesheet used by the order dialog. */
export function buildFinanceThermalReceiptHtml(receipt: FinanceCustomerReceipt, fonts: FinanceCustomerReceiptFonts, logoDataUrl: string | null = null) {
  const data = financeCustomerReceiptSchema.parse(receipt);
  if (![fonts.regular, fonts.bold].every(font => /^[a-z0-9+/=]+$/i.test(font))) throw new Error("INVALID_RECEIPT_FONT");
  if (logoDataUrl && !/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(logoDataUrl)) throw new Error("INVALID_RECEIPT_LOGO");
  const document: FinanceDocument = {
    id: "receipt", kind: "sale", number: data.number, created_at: data.createdAt,
    local_reference: data.localReference ?? undefined, customer_phone: data.customerPhone,
    party_id: data.customerName ? "customer" : null, account_id: data.paymentMethod || null,
    shift_id: null, warehouse_id: null, reference_id: null,
    subtotal: data.subtotal, discount: data.discount, tax: data.tax, total: data.total, paid: data.paid,
    outstanding: data.outstanding ?? Math.max(0, data.total - data.paid),
    refunded: data.refunded ?? false, refunded_total: data.refundedTotal ?? 0,
    note: data.note ?? "", vat_rate: data.vatRate, tax_inclusive: data.taxInclusive,
    lines: data.lines.map((line, index) => ({ id: String(index), name: line.name, quantity: line.quantity, unit_price: line.unitPrice, net: line.net, tax: line.tax, cost: 0, item_id: null, product_id: null })),
  };
  const snapshot: FinanceSnapshot = {
    cafe: { id: data.cafeId ?? "", name: data.brandName, slug: "" }, userId: "", canManage: false, canAdminister: false, role: "cashier",
    settings: { vat_rate: data.vatRate ?? 0, tax_inclusive: data.taxInclusive ?? true, currency: "SAR", closed_through: null },
    parties: data.customerName ? [{ id: "customer", name: data.customerName, tax_number: data.customerTaxNumber ?? "", kind: "customer", phone: "", email: "", balance: 0, active: true }] : [],
    accounts: data.paymentMethod ? [{ id: data.paymentMethod, kind: data.paymentMethod, name: "", code: "", balance: 0, active: true }] : [],
    products: [], items: [], warehouses: [], stock: [], documents: [], shifts: [], staff: [], journal: [], movements: [], trialBalance: [], truncated: false,
    summary: { sales: 0, purchases: 0, expenses: 0, profit: 0, receivables: 0, payables: 0, inventoryValue: 0 },
  };
  const brand: ReceiptBrand = { name: data.brandName, logoUrl: logoDataUrl, color: "#3a2117" };
  const article = renderToStaticMarkup(createElement(FinanceReceipt, { document, snapshot, brand, copy: "customer" }));
  const css = thermalReceiptCss("80", "https://barndaksa.com")
    .replace('https://barndaksa.com/fonts/tajawal-regular.ttf', `data:font/ttf;base64,${fonts.regular}`)
    .replace('https://barndaksa.com/fonts/tajawal-bold.ttf', `data:font/ttf;base64,${fonts.bold}`);
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><title>الفاتورة</title><style>${css}</style></head><body>${article}</body></html>`;
}
