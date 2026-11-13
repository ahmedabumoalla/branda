"use client";
import { displayRecordNumber } from "@/lib/erp/settings-numbering";

import { useEffect, useRef, useState } from "react";
import { Eye, FileText, Plus, Printer, RefreshCw, Save, Search } from "lucide-react";
import { readQuotesAction, saveQuoteAction, convertQuoteAction } from "@/app/actions/finance-quotes";
import { newQuote, quoteAmounts, quotePreview, quoteStatus, quoteStatusLabels, type QuotePayload, type QuoteRecord } from "@/lib/finance/quotation";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { CompanyInvoicePreview } from "@/lib/export/company-invoice-preview-pdf";
import { Modal } from "@/components/dashboard/ui/modal";
import { CompanyInvoiceLines } from "./company-invoice-lines";
import { FinanceCustomerForm } from "./finance-customer-form";
import { CustomerLastSalePrice } from "./customer-last-sale-price";
import { useCustomerSalePrices } from "./use-customer-sale-prices";
import { Field, Numeric } from "./finance-ui";
import styles from "./finance.module.css";
import manager from "./finance-invoices.module.css";
import editor from "./finance-sale-form.module.css";
import css from "./finance-quotes.module.css";

function navigate(view: string, id?: string) {
  const params = new URLSearchParams({ section: "sales", view });
  if (id) params.set(view === "create" ? "draft" : "quote", id);
  window.history.pushState(null, "", `/dashboard/finance?${params}`);
}

export function FinanceQuotes({ snapshot, create, quoteId, stale, pending, onCreateCustomer, initialCustomerId }: {
  snapshot: FinanceSnapshot; create: boolean; quoteId: string | null; stale: boolean; pending: boolean;
  onCreateCustomer: (payload: Record<string, unknown>) => Promise<boolean>;
  initialCustomerId?: string;
}) {
  const [records, setRecords] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (create && !quoteId) return;
    let active = true;
    void readQuotesAction(snapshot.cafe.slug, create ? quoteId : null).then(result => {
      if (!active) return;
      if (result.ok) { setRecords(result.data); setError(""); } else setError(result.message);
      setLoading(false);
    }).catch(() => { if (active) { setError("تعذر الاتصال أعد تحميل عروض الأسعار"); setLoading(false); } });
    return () => { active = false; };
  }, [snapshot.cafe.slug, create, quoteId, reload]);
  const refresh = () => { setLoading(true); setError(""); setReload(n => n + 1); };
  if (create && !quoteId) return <QuoteEditor snapshot={snapshot} initialCustomerId={initialCustomerId} pending={pending} stale={stale} onCreateCustomer={onCreateCustomer} />;
  if (loading) return <p className={styles.notice} role="status">جار تحميل عروض الأسعار</p>;
  if (error) return <div className={styles.form}><p role="alert" className={styles.error}>{error}</p><button className={styles.secondary} onClick={refresh}>إعادة المحاولة</button></div>;
  if (create) return <QuoteEditor key={records[0].id} snapshot={snapshot} saved={records[0]} pending={pending} stale={stale} onCreateCustomer={onCreateCustomer} />;
  const filtered = records.filter(q => (status === "all" || quoteStatus(q) === status) && (!from || q.payload.date >= from) && (!to || q.payload.date <= to) && `${q.number} ${displayRecordNumber(q)} ${q.customerName} ${q.payload.document.invoice.note}`.toLocaleLowerCase("ar").includes(query.trim().toLocaleLowerCase("ar"))).sort((a, b) => sort === "customer" ? a.customerName.localeCompare(b.customerName, "ar") || b.number - a.number : sort === "total" ? b.total - a.total || b.number - a.number : b.number - a.number);
  const pages = Math.max(1, Math.ceil(filtered.length / 20)), current = Math.min(page, pages);
  return <div className={manager.manager}>
    <div className={manager.topbar}><div className={manager.pagination}><span>{filtered.length} عرض سعر</span><button className={manager.secondary} disabled={current <= 1} onClick={() => setPage(current - 1)}>السابق</button><span>{current} / {pages}</span><button className={manager.secondary} disabled={current >= pages} onClick={() => setPage(current + 1)}>التالي</button></div><div className={manager.actions}><button className={manager.secondary} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />تحديث</button><button className={manager.primary} disabled={pending || stale} onClick={() => navigate("quote-create")}><Plus size={16} aria-hidden="true" />إضافة عرض سعر</button></div></div>
    <section className={manager.searchPanel} aria-label="البحث في عروض الأسعار"><div className={manager.searchHeading}><Search size={18} aria-hidden="true" /><h2>إدارة عروض الأسعار</h2></div><div className={manager.searchBody}><div className={`${manager.fields} ${manager.basicAdvanced}`}><label>العميل أو رقم عرض السعر<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="ابحث باسم العميل أو رقم العرض" /></label><label>من تاريخ<input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label><label>إلى تاريخ<input type="date" value={to} min={from} onChange={e => { setTo(e.target.value); setPage(1); }} /></label></div></div></section>
    <div className={manager.resultsBar}><div className={manager.tabs} aria-label="حالة عرض السعر">{[["all", "الكل"], ...Object.entries(quoteStatusLabels)].map(([value, label]) => <button key={value} aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1); }}>{label}<span>{records.filter(q => value === "all" || quoteStatus(q) === value).length}</span></button>)}</div><label className={manager.sortButton}>ترتيب حسب<select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="newest">الأحدث</option><option value="customer">العميل</option><option value="total">الإجمالي</option></select></label></div>
    {records.length >= 500 && <p className={styles.notice}>تعرض القائمة أحدث ٥٠٠ عرض سعر</p>}
    {!filtered.length ? <div className={manager.empty}><FileText size={28} aria-hidden="true" /><div><strong>{records.length ? "لا توجد عروض تطابق البحث" : "أضف أول عرض سعر"}</strong><p>حدد العميل والمستودع وأضف البنود ثم احفظ العرض للمعاينة والطباعة أو التحويل إلى فاتورة</p></div></div> : <div className={manager.tableWrap} role="region" aria-label="عروض الأسعار" tabIndex={0}><table className={manager.table}><thead><tr>{["رقم العرض", "العميل", "التاريخ", "صالح حتى", "المستودع", "الإجمالي", "الحالة", "الإجراءات"].map(t => <th scope="col" key={t}>{t}</th>)}</tr></thead><tbody>{filtered.slice((current - 1) * 20, current * 20).map(q => <tr key={q.id}><td><button className={manager.invoiceNumber} onClick={() => navigate("quote-create", q.id)}>#{displayRecordNumber(q)}</button></td><td>{q.customerName || "لم يُحدد العميل"}</td><td>{q.payload.date}</td><td>{q.payload.validUntil || "غير محدد"}</td><td>{q.warehouseName}</td><td><Numeric value={q.total} money /></td><td><span className={manager.status}>{quoteStatusLabels[quoteStatus(q)]}</span></td><td><button className={manager.rowButton} onClick={() => navigate("quote-create", q.id)}>{q.invoiceDraftId ? "عرض" : "عرض وتعديل"}</button></td></tr>)}</tbody></table></div>}
  </div>;
}

function QuoteEditor({ snapshot: data, saved, pending, stale, onCreateCustomer, initialCustomerId }: { snapshot: FinanceSnapshot; saved?: QuoteRecord; pending: boolean; stale: boolean; onCreateCustomer: (payload: Record<string, unknown>) => Promise<boolean>; initialCustomerId?: string }) {
  const [payload, setPayload] = useState<QuotePayload>(() => {
    if (saved) return saved.payload;
    const payload = newQuote(data);
    payload.document.invoice.partyId = data.parties.find(party => party.id === initialCustomerId && party.kind === "customer" && party.active)?.id ?? "";
    return payload;
  });
  const [record, setRecord] = useState(saved);
  const identity = useRef({ id: saved?.id ?? "", revision: saved?.revision ?? 0 });
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [preview, setPreview] = useState<CompanyInvoicePreview | null>(null);
  const [pdf, setPdf] = useState("");
  const [dirty, setDirty] = useState(!saved);
  const [cancelOpen, setCancelOpen] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const invoice = payload.document.invoice, amounts = quoteAmounts(payload.document);
  const prices = useCustomerSalePrices(data.cafe.slug, invoice.partyId, invoice.lines.map(l => l.productId));
  const disabled = pending || stale || busy || !!record?.invoiceDraftId;
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf); }, [pdf]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const patch = (next: Partial<QuotePayload>) => { setPayload(p => ({ ...p, ...next })); setDirty(true); setError(""); setNotice(""); };
  const patchInvoice = (next: Partial<typeof invoice>) => patch({ document: { ...payload.document, invoice: { ...invoice, ...next } } });
  const save = async (status = payload.status) => {
    if (!identity.current.id) identity.current.id = crypto.randomUUID();
    const next = { ...payload, status };
    const result = await saveQuoteAction({ ...identity.current, payload: next }, data.cafe.slug);
    if (!result.ok) { setError(result.message); return null; }
    identity.current = { id: result.data.id, revision: result.data.revision };
    setRecord(result.data); setPayload(result.data.payload); setDirty(false); setNotice(`تم حفظ عرض السعر رقم ${displayRecordNumber(result.data)}`);
    window.history.replaceState(null, "", `/dashboard/finance?section=sales&view=quote-create&quote=${result.data.id}`);
    return result.data;
  };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await action(); } catch { setError("تعذر تأكيد نتيجة الطلب أعد المحاولة بنفس عرض السعر"); }
    finally { lock.current = false; setBusy(false); }
  };
  const convert = async () => {
    if (!record || dirty) { setError("احفظ التعديلات قبل تحويل العرض إلى فاتورة"); return; }
    const result = await convertQuoteAction({ id: record.id, revision: record.revision }, data.cafe.slug);
    if (!result.ok) { setError(result.message); return; }
    navigate("create", result.data.id);
  };
  const previewData = () => quotePreview(payload, {
    brand: data.cafe.name,
    customer: !dirty && record ? record.customerName : data.parties.find(p => p.id === invoice.partyId)?.name ?? "",
    warehouse: !dirty && record ? record.warehouseName : data.warehouses.find(w => w.id === invoice.warehouseId)?.name ?? "",
    products: !dirty && record ? record.lines.map(l => ({ id: l.productId, name: l.name })) : data.products,
  }, record);
  const showPdf = async () => {
    const model = previewData(); setPreview(model);
    try {
      const { createCompanyInvoicePreviewPdf } = await import("@/lib/export/company-invoice-preview-pdf");
      setPdf(URL.createObjectURL(await createCompanyInvoicePreviewPdf(model)));
    } catch { setPreview(null); setPdf(""); throw new Error("PDF preview failed"); }
  };
  return <><form className={`${styles.form} ${styles.invoiceForm} ${editor.editor}`} inert={customerOpen || !!preview || cancelOpen} onSubmit={event => { event.preventDefault(); if (!disabled) void run(async () => { await save(payload.status === "draft" ? "ready" : payload.status); }); }}>
    <div className={editor.actionBar}><div className={styles.actions}><button type="button" className={styles.secondary} disabled={busy} onClick={() => { setPdf(""); setPreview(previewData()); }}><Eye size={16} aria-hidden="true" />معاينة</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => void run(showPdf)}><Printer size={16} aria-hidden="true" />طباعة</button><button type="button" className={styles.secondary} disabled={disabled} onClick={() => void run(async () => { await save("draft"); })}><Save size={16} aria-hidden="true" />حفظ كمسودة</button></div><div className={styles.actions}><button type="submit" className={styles.primary} disabled={disabled}><Save size={16} aria-hidden="true" />{busy ? "جار تنفيذ الطلب" : "حفظ"}</button><button type="button" className={styles.secondary} disabled={busy || pending} onClick={() => dirty ? setCancelOpen(true) : navigate("quotes")}>إلغاء</button></div></div>
    {error && <p ref={errorRef} tabIndex={-1} role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {stale && <p className={styles.notice}>حدّث البيانات قبل حفظ عرض السعر</p>}
    {record && <div className={styles.actions}><span className={manager.status}>{quoteStatusLabels[quoteStatus(record)]}</span><button type="button" className={styles.secondary} disabled={busy || pending || stale || dirty || (!record.invoiceDraftId && !["ready", "accepted"].includes(quoteStatus(record)))} onClick={() => void run(convert)}>{record.invoiceDraftId ? "فتح الفاتورة" : "تحويل إلى فاتورة"}</button><span className={styles.muted}>{record.invoiceDraftId ? "العرض مرتبط بفاتورة محفوظة افتحها لمراجعة حالة إصدارها" : "يفتح التحويل فاتورة محفوظة للمراجعة والإصدار"}</span></div>}
    <fieldset disabled={disabled} className={styles.invoiceLayout}><div className={styles.invoiceMain}>
      <section className={`${styles.invoiceSection} ${editor.template}`}><span className={editor.templateLabel}><FileText size={20} aria-hidden="true" />{record ? `عرض سعر رقم ${displayRecordNumber(record)}` : "عرض سعر جديد"}</span><Field label="قالب عرض السعر"><select value={payload.document.template} onChange={e => patch({ document: { ...payload.document, template: e.target.value as "standard" | "thermal" } })}><option value="standard">التصميم الافتراضي لعرض السعر</option><option value="thermal">تصميم حراري</option></select></Field></section>
      <div className={editor.metadata}><section className={styles.invoiceSection} aria-label="العميل والمستودع"><h3 className={styles.invoiceHeading}>بيانات العميل</h3><div className={editor.customerFields}><div className={styles.invoiceCustomer}><Field label="العميل"><select required value={invoice.partyId} onChange={e => patchInvoice({ partyId: e.target.value })}><option value="">اختر الفرد أو الشركة</option>{data.parties.filter(p => p.active && p.kind === "customer" || p.id === invoice.partyId).map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></Field><button type="button" className={styles.secondary} onClick={() => setCustomerOpen(true)}><Plus size={16} aria-hidden="true" />إضافة عميل</button></div><Field label="مستودع البيع"><select required value={invoice.warehouseId} onChange={e => patchInvoice({ warehouseId: e.target.value })}><option value="">اختر المستودع</option>{data.warehouses.filter(w => w.active || w.id === invoice.warehouseId).map(w => <option value={w.id} key={w.id}>{w.name}</option>)}</select></Field></div></section>
      <section className={styles.invoiceSection} aria-label="بيانات عرض السعر"><h3 className={styles.invoiceHeading}>بيانات عرض السعر</h3><div className={editor.documentFields}><Field label="رقم العرض"><input readOnly value={displayRecordNumber(record) || "يُحدد عند الحفظ"} /></Field><Field label="تاريخ العرض"><input type="date" required value={payload.date} onChange={e => patch({ date: e.target.value })} /></Field><Field label="صالح حتى"><input type="date" min={payload.date} value={payload.validUntil} onChange={e => patch({ validUntil: e.target.value })} /></Field><Field label="الحالة"><select value={payload.status} onChange={e => patch({ status: e.target.value as QuotePayload["status"] })}>{(["draft", "ready", "accepted", "rejected"] as const).map(s => <option value={s} key={s}>{quoteStatusLabels[s]}</option>)}</select></Field></div></section></div>
      <section className={styles.invoiceSection} aria-label="بنود عرض السعر"><CompanyInvoiceLines lines={invoice.lines} products={data.products} vatRate={invoice.vatRate ?? 0} disabled={disabled} amounts={amounts.rows} onChange={lines => patchInvoice({ lines: lines.map(l => ({ ...l, price: l.price ?? data.products.find(p => p.id === l.productId)?.price ?? 0 })) })} productHint={id => <CustomerLastSalePrice productId={id} history={prices} />} summary={<div className={`${styles.invoiceTotals} ${editor.totals}`}>{[["المجموع الفرعي", amounts.subtotal], ["الخصم", amounts.discount], ["الضريبة", amounts.tax], ["الإجمالي", amounts.total]].map(([label, value]) => <div key={label}><span>{label}</span><strong><Numeric value={Number(value)} money /></strong></div>)}</div>} /></section>
      <section className={styles.invoiceSection} aria-label="الخصم والضريبة"><h3 className={styles.invoiceHeading}>الخصم والضريبة</h3><div className={styles.fields}><Field label="ضريبة العرض"><input type="number" min="0" max="100" step="0.01" required value={invoice.vatRate ?? 0} onChange={e => patchInvoice({ vatRate: Number(e.target.value) })} /></Field><label className={styles.check}><input type="checkbox" checked={invoice.taxInclusive} onChange={e => patchInvoice({ taxInclusive: e.target.checked })} />السعر شامل الضريبة</label><label className={styles.check}><input type="checkbox" checked={invoice.discountEnabled} onChange={e => patchInvoice({ discountEnabled: e.target.checked })} />يوجد خصم على العرض</label></div>{invoice.discountEnabled && <div className={styles.fields}><Field label="الخصم"><input type="number" min="0" max={invoice.discountKind === "percent" ? 100 : amounts.subtotal} step="0.01" value={invoice.discountValue} required onChange={e => patchInvoice({ discountValue: Number(e.target.value) })} /></Field><Field label="نوع الخصم"><select value={invoice.discountKind} onChange={e => patchInvoice({ discountKind: e.target.value as "amount" | "percent" })}><option value="amount">مبلغ بالريال</option><option value="percent">نسبة مئوية</option></select></Field></div>}</section>
      <section className={styles.invoiceSection}><Field label="الملاحظات والشروط"><textarea maxLength={500} value={invoice.note} placeholder="أضف ملاحظات أو شروط عرض السعر" onChange={e => patchInvoice({ note: e.target.value })} /></Field></section>
    </div></fieldset>
  </form>
  <Modal open={customerOpen} title="إضافة عميل" onClose={() => { if (!pending) setCustomerOpen(false); }}><FinanceCustomerForm pending={pending} error="" onCancel={() => setCustomerOpen(false)} onSubmit={async (_, values) => onCreateCustomer(values)} onSaved={() => setCustomerOpen(false)} /></Modal>
  <Modal open={cancelOpen} title="تعديلات غير محفوظة" onClose={() => setCancelOpen(false)}><div className={styles.form}><p>لم تُحفظ آخر التعديلات على عرض السعر</p><div className={styles.actions}><button className={styles.primary} onClick={() => setCancelOpen(false)}>متابعة التعديل</button><button className={styles.secondary} onClick={() => navigate("quotes")}>العودة دون حفظ</button></div></div></Modal>
  <Modal open={!!preview} title="معاينة عرض السعر" onClose={() => { if (!busy) { setPreview(null); setPdf(""); } }} panelClassName={styles.invoicePanel}>{preview && <div className={css.preview}><div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={() => void run(showPdf)}><Printer size={16} aria-hidden="true" />عرض ملف الطباعة</button>{pdf && <a className={styles.secondary} href={pdf} target="_blank" rel="noopener" download={`quote-${displayRecordNumber(record) || "preview"}.pdf`}>تنزيل PDF</a>}</div>{busy && <p role="status">جار تجهيز ملف الطباعة</p>}{pdf ? <><p className={styles.muted}>استخدم زر الطباعة في عارض الملف لطباعة العرض</p><iframe title="ملف عرض السعر للطباعة" src={pdf} className={css.pdf} /></> : <><header className={css.previewHeader}><div><h2>{data.cafe.name}</h2><p>{preview.customer}</p></div><div><h3>{preview.quote?.draft ? "مسودة عرض سعر" : "عرض سعر"} {preview.quote?.number ? `#${displayRecordNumber(preview.quote)}` : "غير محفوظ"}</h3><p>التاريخ {payload.date}</p><p>صالح حتى {payload.validUntil || "غير محدد"}</p><p>المستودع {preview.quote?.warehouse}</p></div></header><p className={styles.notice}>عرض سعر وليس فاتورة ضريبية{dirty ? " — يتضمن تعديلات غير محفوظة" : ""}</p><div className={manager.tableWrap} role="region" aria-label="بنود المعاينة" tabIndex={0}><table className={manager.table}><thead><tr>{["البند", "الكمية", "سعر الوحدة", "الخصم", "الضريبة", "المجموع"].map(t => <th key={t} scope="col">{t}</th>)}</tr></thead><tbody>{preview.lines.map((l, index) => <tr key={index}><td>{l.name}{l.description && <p>{l.description}</p>}</td><td>{l.quantity}</td>{[l.price, l.discount, l.tax, l.total].map((v, i) => <td key={i}><Numeric value={v} money /></td>)}</tr>)}</tbody></table></div><div className={css.previewTotals}>{[["المجموع الفرعي", preview.subtotal], ["الخصم", preview.discount], ["الضريبة", preview.tax], ["الإجمالي", preview.total]].map(([label, value]) => <p key={label}><span>{label}</span><strong><Numeric value={Number(value)} money /></strong></p>)}</div><p className={css.note}>{preview.note}</p></>}</div>}</Modal>
  </>;
}
