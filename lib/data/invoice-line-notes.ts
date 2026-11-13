import "server-only";
import type { getBrandFinanceContext } from "./brand-finance";
import type { IssuedCompanyInvoice } from "./company-invoices";
import { issuedInvoiceLineNotesSchema } from "@/lib/finance/invoice-line-notes";

/** Enrich presentation from immutable companion rows; never rewrite the fiscal snapshot. */
export async function withInvoiceLineNotes(client: Awaited<ReturnType<typeof getBrandFinanceContext>>["client"], cafeId: string, invoice: IssuedCompanyInvoice) {
  const { data, error } = await client.rpc("brand_finance_issued_line_notes", { p_cafe_id: cafeId, p_document_id: invoice.id });
  if (error) throw new Error("تعذر قراءة ملاحظات الفاتورة المحفوظة أعد المحاولة");
  const result = issuedInvoiceLineNotesSchema.safeParse(data);
  if (!result.success || result.data.lines.some(line => line.lineIndex >= invoice.lines.length)) throw new Error("تعذر مطابقة ملاحظات الفاتورة مع بنودها");
  if (!result.data.recorded) return invoice;
  const notes = new Map(result.data.lines.map(line => [line.lineIndex, line.notes]));
  return { ...invoice, lines: invoice.lines.map((line, index) => ({ ...line, notes: notes.get(index) ?? [] })) };
}
