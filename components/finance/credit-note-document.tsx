import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { creditNoteAmounts, type CreditNotePayload, type CreditNoteRecord } from "@/lib/finance/credit-note";
import type { CompanyInvoicePreview } from "@/lib/export/company-invoice-preview-pdf";
import { Numeric } from "./finance-ui";
import css from "./finance-credit-notes.module.css";

export function creditNotePreview(payload: CreditNotePayload, snapshot: FinanceSnapshot, saved?: CreditNoteRecord): CompanyInvoicePreview {
  const calculated = creditNoteAmounts(payload);
  return {
    brand: snapshot.cafe.name,
    customer: saved?.customerName || snapshot.parties.find(p => p.id === payload.partyId)?.name || "لم يُحدد العميل",
    taxNumber: "", thermal: payload.template === "thermal",
    note: [payload.note, payload.terms].filter(Boolean).join("\n"),
    subtotal: saved?.subtotal ?? calculated.subtotal, discount: saved?.discount ?? calculated.discount,
    tax: saved?.tax ?? calculated.tax, total: saved?.total ?? calculated.total,
    creditNote: { number: saved?.number, displayNumber: saved?.displayNumber, date: payload.date, issueDate: payload.issueDate, draft: !saved || saved.status === "draft", reason: payload.reason,
      warehouse: saved?.warehouseName || snapshot.warehouses.find(w => w.id === payload.warehouseId)?.name || "بدون حركة مخزنية" },
    lines: payload.lines.map((line, index) => ({ ...(saved?.lines[index] ?? calculated.rows[index]), quantity: line.quantity, description: line.description,
      name: saved?.lines[index]?.name || snapshot.products.find(p => p.id === line.productId)?.name || "لم يُحدد الصنف" })),
  };
}

export function CreditNoteDocument({ model }: { model: CompanyInvoicePreview }) {
  return <article className={css.document} dir="rtl" aria-label="معاينة الإشعار الدائن">
    <header className={css.documentHeader}><div><p className={css.eyebrow}>{model.brand}</p><h2>إشعار دائن</h2><p>{model.creditNote?.draft ? "مسودة غير معتمدة" : "إشعار صادر"}</p></div><div className={css.documentNumber}><span>رقم الإشعار</span><strong>{model.creditNote?.number ? `#${model.creditNote.displayNumber || String(model.creditNote.number).padStart(6, "0")}` : "يُخصص عند الحفظ"}</strong></div></header>
    <dl className={css.metadata}><div><dt>العميل</dt><dd>{model.customer}</dd></div><div><dt>تاريخ الإشعار</dt><dd>{model.creditNote?.date}</dd></div><div><dt>تاريخ الإصدار</dt><dd>{model.creditNote?.issueDate}</dd></div><div><dt>المستودع</dt><dd>{model.creditNote?.warehouse}</dd></div></dl>
    <p className={css.reason}><strong>سبب الإشعار</strong><span>{model.creditNote?.reason || "لم يُحدد السبب"}</span></p>
    <div className={css.tableWrap} tabIndex={0} role="region" aria-label="بنود الإشعار"><table className={css.table}><thead><tr>{["البند", "الكمية", "سعر الوحدة", "الخصم", "الضريبة", "الإجمالي"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{model.lines.map((line, index) => <tr key={index}><td><strong>{line.name}</strong>{line.description && <small>{line.description}</small>}</td><td>{line.quantity}</td><td><Numeric value={line.price} /></td><td><Numeric value={line.discount} /></td><td><Numeric value={line.tax} /></td><td><Numeric value={line.total} money /></td></tr>)}</tbody></table></div>
    <CreditNoteTotals {...model} />
    {model.note && <section className={css.notes}><h3>الملاحظات والشروط</h3><p>{model.note}</p></section>}
  </article>;
}

export function CreditNoteTotals({ subtotal, discount, tax, total }: { subtotal: number; discount: number; tax: number; total: number }) {
  return <dl className={css.totals}>{[["المجموع قبل الخصم", subtotal], ["الخصم", discount], ["الضريبة", tax], ["الإجمالي", total]].map(([label, amount]) => <div key={label}><dt>{label}</dt><dd><Numeric value={Number(amount)} money /></dd></div>)}</dl>;
}
