import { z } from "zod";
import { invoiceDraftSchema, type InvoiceDraftPayload } from "./invoice-draft";

export const importedInvoiceSchema = z.object({
  invoiceNumber: z.string().max(80), customerName: z.string().max(160),
  currency: z.enum(["SAR", "USD", "EUR", "GBP", "AED"]), taxInclusive: z.boolean(),
  total: z.number().finite().min(0).max(1e9).nullable(), notes: z.string().max(500),
  lines: z.array(z.object({
    name: z.string().trim().min(1).max(160), quantity: z.number().finite().positive().max(9999),
    price: z.number().finite().min(0).max(1e9), discount: z.number().finite().min(0).max(1e9),
    vatRate: z.number().finite().min(0).max(100),
  }).strict().refine(row => row.discount <= row.price * row.quantity, "خصم البند أكبر من قيمته")).min(1).max(100),
}).strict();
export type ImportedInvoice = z.infer<typeof importedInvoiceSchema>;

const aliases = {
  name: ["name", "item", "اسم الصنف", "الصنف", "الوصف"], quantity: ["quantity", "qty", "الكمية"],
  price: ["price", "unit price", "سعر الوحدة", "السعر"], discount: ["discount", "خصم البند", "الخصم"],
  vatRate: ["vat", "vat rate", "نسبة الضريبة", "الضريبة"],
};
const normalize = (value: string) => value.trim().toLowerCase().replace(/^\uFEFF/, "");
function numeric(value: string) {
  const clean = value.trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/٫/g, ".").replace(/٬/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(clean)) throw new Error("استخدم أرقامًا موجبة دون رموز عملة أو فواصل آلاف");
  return Number(clean);
}
export function invoiceFromRows(rows: string[][]): ImportedInvoice {
  const headings = rows[0]?.map(normalize) || [];
  const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, headings.findIndex(h => names.includes(h))])) as Record<keyof typeof aliases, number>;
  if ([columns.name, columns.quantity, columns.price].some(i => i < 0)) throw new Error("يجب أن يحتوي الملف على اسم الصنف والكمية وسعر الوحدة استخدم النموذج المرفق");
  if (headings.some((h, i) => h && headings.indexOf(h) !== i)) throw new Error("عناوين الأعمدة مكررة");
  const lines = rows.slice(1).filter(row => row.some(cell => cell.trim())).map((row, index) => {
    try {
      return { name: row[columns.name]?.trim() || "", quantity: numeric(row[columns.quantity] || ""), price: numeric(row[columns.price] || ""),
        discount: numeric(columns.discount < 0 ? "0" : row[columns.discount] || "0"), vatRate: numeric(columns.vatRate < 0 ? "0" : row[columns.vatRate] || "0") };
    } catch { throw new Error(`راجع الأرقام في الصف ${index + 2}`); }
  });
  const result = importedInvoiceSchema.safeParse({ invoiceNumber: "", customerName: "", currency: "SAR", taxInclusive: false, total: null, notes: "", lines });
  if (!result.success) throw new Error("راجع أسماء البنود والكميات والأسعار والخصومات الحد الأقصى مائة بند");
  return result.data;
}
export function importedInvoiceDraft(value: ImportedInvoice): InvoiceDraftPayload {
  const data = importedInvoiceSchema.parse(value);
  return invoiceDraftSchema.parse({
    invoice: { lines: data.lines.map((line, key) => ({ ...line, key, productId: "", kind: "product", discountKind: "amount", taxCategory: line.vatRate ? "S" : "Z" })),
      warehouseId: "", partyId: "", accountId: "", paymentKind: "credit", discountValue: 0, discountKind: "amount", discountEnabled: false,
      taxInclusive: data.taxInclusive, note: [data.invoiceNumber && `رقم المستند المصدر: ${data.invoiceNumber}`, data.customerName && `اسم العميل في المصدر: ${data.customerName}`, data.notes].filter(Boolean).join("\n").slice(0, 500),
      currency: data.currency, exchangeRate: 1, applyCredit: false },
    template: "standard", deliveryMethod: "print", extraFields: [], attachments: [],
    deposit: { kind: "amount", value: 0, paid: false }, shipping: "none", delivery: { confirmed: false, date: "" },
  });
}
