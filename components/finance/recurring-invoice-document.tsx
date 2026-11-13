import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { recurrencePreview, recurringInvoiceAmounts, type RecurringInvoicePayload, type RecurringInvoiceRecord } from "@/lib/finance/recurring-invoice";
import type { CompanyInvoicePreview } from "@/lib/export/company-invoice-preview-pdf";
import { CreditNoteTotals } from "./credit-note-document";
import { Numeric } from "./finance-ui";
import css from "./finance-credit-notes.module.css";

export function recurringInvoicePreview(payload: RecurringInvoicePayload, snapshot: FinanceSnapshot, record?: RecurringInvoiceRecord, savedAmounts = true): CompanyInvoicePreview {
  const invoice = payload.document.invoice, amounts = recurringInvoiceAmounts(payload);
  const next = record?.upcoming[0] ?? recurrencePreview(payload, record?.generatedCount ?? 0, 1)[0];
  return {
    brand: payload.document.issuer?.name || snapshot.cafe.name,
    customer: record?.customerName || snapshot.parties.find(p => p.id === invoice.partyId)?.name || "لم يُحدد العميل",
    taxNumber: "", thermal: payload.document.template === "thermal", ...amounts,
    ...(savedAmounts && record ? { subtotal: record.subtotal, discount: record.discount, tax: record.tax, total: record.total } : {}),
    note: [invoice.note, ...payload.document.extraFields.map(f => `${f.title}: ${f.value}`)].filter(Boolean).join("\n"),
    recurring: { name: payload.name, date: next?.date ?? "", issueDate: next?.issueDate ?? "", dueDate: next?.dueDate ?? "", periodStart: payload.showPeriod ? next?.periodStart : undefined, periodEnd: payload.showPeriod ? next?.periodEnd : undefined, taxInclusive: invoice.taxInclusive ?? false },
    lines: savedAmounts && record?.lines ? record.lines : invoice.lines.map((line, index) => ({ ...amounts.rows[index], quantity: line.quantity, name: line.name || snapshot.products.find(p => p.id === line.productId)?.name || "صنف محفوظ", description: line.description })),
  };
}

export function RecurringInvoiceDocument({ model }: { model: CompanyInvoicePreview }) {
  return <article className={css.document} dir="rtl" aria-label="معاينة الفاتورة الدورية القادمة">
    <header className={css.documentHeader}><div><p className={css.eyebrow}>{model.brand}</p><h2>الفاتورة الدورية القادمة</h2><p>معاينة قبل الإصدار</p></div><div className={css.documentNumber}><span>الاشتراك</span><strong>{model.recurring?.name || "اشتراك جديد"}</strong></div></header>
    <dl className={css.metadata}><div><dt>العميل</dt><dd>{model.customer}</dd></div><div><dt>تاريخ الفاتورة</dt><dd>{model.recurring?.date || "غير محدد"}</dd></div><div><dt>موعد الإنشاء</dt><dd>{model.recurring?.issueDate || "غير محدد"}</dd></div><div><dt>تاريخ الاستحقاق</dt><dd>{model.recurring?.dueDate || "غير محدد"}</dd></div>{model.recurring?.periodStart && <><div><dt>الفترة من</dt><dd>{model.recurring.periodStart}</dd></div><div><dt>الفترة حتى</dt><dd>{model.recurring.periodEnd}</dd></div></>}</dl>
    <p className={css.hint}>يُخصص رقم الفاتورة عند إصدارها وتُحفظ نسختها النهائية في سجل الفواتير السابقة</p>
    <div className={css.tableWrap} tabIndex={0} role="region" aria-label="بنود الفاتورة الدورية"><table className={css.table}><thead><tr>{["البند", "الكمية", "سعر الوحدة", "الخصم", "الضريبة", "الإجمالي"].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{model.lines.map((line, index) => <tr key={index}><td><strong>{line.name}</strong>{line.description && <small>{line.description}</small>}</td><td><Numeric value={line.quantity} /></td><td><Numeric value={line.price} /></td><td><Numeric value={line.discount} /></td><td><Numeric value={line.tax} /></td><td><Numeric value={line.total} money /></td></tr>)}</tbody></table></div>
    <CreditNoteTotals {...model} />
    <p className={css.hint}>{model.recurring?.taxInclusive ? "أسعار الوحدات شاملة الضريبة" : "أسعار الوحدات غير شاملة الضريبة"}</p>
    {model.note && <section className={css.notes}><h3>الملاحظات والشروط</h3><p>{model.note}</p></section>}
  </article>;
}
