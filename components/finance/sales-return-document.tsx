import type { CompanyInvoicePreview } from "@/lib/export/company-invoice-preview-pdf";
import { CreditNoteTotals } from "./credit-note-document";
import { Numeric } from "./finance-ui";
import css from "./finance-credit-notes.module.css";

export { salesReturnPreview } from "@/lib/finance/sales-return-print";

export function SalesReturnDocument({ model }: { model: CompanyInvoicePreview }) {
  const returned = model.salesReturn;
  return <article className={css.document} dir="rtl" aria-label="معاينة الفاتورة المرتجعة">
    <header className={css.documentHeader}><div><p className={css.eyebrow}>{model.brand}</p><h2>فاتورة مرتجعة</h2><p>مرتجع مبيعات معتمد</p></div><div className={css.documentNumber}><span>رقم المرتجع</span><strong>#{String(returned?.number ?? "").padStart(6, "0")}</strong></div></header>
    <dl className={css.metadata}><div><dt>العميل</dt><dd>{model.customer}</dd></div><div><dt>الفاتورة الأصلية</dt><dd>#{returned?.sourceNumber}</dd></div><div><dt>تاريخ الفاتورة المرتجعة</dt><dd>{returned?.date}</dd></div><div><dt>المستودع</dt><dd>{returned?.warehouse}</dd></div></dl>
    <div className={css.tableWrap} tabIndex={0} role="region" aria-label="بنود الفاتورة المرتجعة"><table className={css.table}><thead><tr>{["البند", "الكمية", "سعر الوحدة", "الخصم", "الضريبة", "الإجمالي"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{model.lines.map((line, index) => <tr key={index}><td><strong>{line.name}</strong>{line.description && <small>{line.description}</small>}</td><td><Numeric value={line.quantity} /></td><td><Numeric value={line.price} /></td><td><Numeric value={line.discount} /></td><td><Numeric value={line.tax} /></td><td><Numeric value={line.total} money /></td></tr>)}</tbody></table></div>
    <CreditNoteTotals {...model} />
    <p className={css.hint}>{returned?.taxInclusive ? "أسعار الوحدات شاملة الضريبة" : "أسعار الوحدات غير شاملة الضريبة"}</p>
    <dl className={css.metadata}><div><dt>المبلغ المعاد للعميل</dt><dd><Numeric value={returned?.paid ?? 0} money /></dd></div><div><dt>تخفيض المبلغ الآجل</dt><dd><Numeric value={returned?.debtReduced ?? 0} money /></dd></div></dl>
    {model.note && <section className={css.notes}><h3>سبب المرتجع والملاحظات</h3><p>{model.note}</p></section>}
  </article>;
}
