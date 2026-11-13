import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { SalesReturnDetail } from "@/lib/finance/sales-return";
import type { CompanyInvoicePreview } from "@/lib/export/company-invoice-preview-pdf";
import { CreditNoteTotals } from "./credit-note-document";
import { Numeric, financeDate } from "./finance-ui";
import css from "./finance-credit-notes.module.css";

/** Use posted amounts, never today's product prices or tax settings. */
export function salesReturnPreview(record: SalesReturnDetail, snapshot: FinanceSnapshot): CompanyInvoicePreview {
  return {
    brand: snapshot.cafe.name, customer: record.customerName, taxNumber: "", thermal: false,
    note: record.note, subtotal: record.subtotal, discount: record.discount, tax: record.tax, total: record.total,
    lines: record.lines.map(line => ({ name: line.name, description: line.description, quantity: line.quantity,
      price: line.price, discount: line.discount, tax: line.tax, total: line.total })),
    salesReturn: { number: record.number, date: financeDate(record.createdAt), sourceNumber: String(record.sourceNumber),
      warehouse: record.warehouseName || "بدون حركة مخزنية", paid: record.paid, debtReduced: record.debtReduced, taxInclusive: record.taxInclusive },
  };
}

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
