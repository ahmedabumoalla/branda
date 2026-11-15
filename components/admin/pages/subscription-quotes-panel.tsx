"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Download, Eye, FileText, LoaderCircle, Plus, Receipt, Save, Search, Trash2 } from "lucide-react";
import { BrandDialog } from "@/components/admin/brand-details-dialog";
import { convertSubscriptionQuoteAction, fetchSubscriptionQuotesAction, getSubscriptionQuoteAction, previewSubscriptionQuoteAction, saveSubscriptionQuoteAction } from "@/app/actions/subscription-quotes";
import { INVOICE_SELLER, invoiceLocalDate, invoiceMoney, parseInvoiceMoney, type SubscriptionInvoice } from "@/lib/platform/subscription-invoices";
import { parseSubscriptionScope } from "@/lib/platform/subscription-scope";
import { convertSubscriptionQuoteSchema, quoteLineAmounts, subscriptionQuoteDraftSchema, type ConvertSubscriptionQuoteInput, type QuoteCustomer, type QuoteLineInput, type SaveSubscriptionQuoteInput, type SubscriptionQuote, type SubscriptionQuoteDraft, type SubscriptionQuoteList } from "@/lib/platform/subscription-quotes";
import s from "./subscription-invoices-page.module.css";
import q from "./subscription-quotes-panel.module.css";

type EditorLine = { key: number; kind: "subscription" | "item"; name: string; months: string; quantity: string; amount: string };
type Notice = { text: string; error: boolean };
const blankCustomer = (): QuoteCustomer => ({ name: "", cr: "", vatNumber: "", nationalAddress: "", buildingNumber: "", additionalNumber: "", district: "", city: "", postalCode: "", country: "المملكة العربية السعودية", street: "", fullAddress: "" });
const newLine = (key: number): EditorLine => ({ key, kind: "subscription", name: "", months: "1", quantity: "1", amount: "" });
const customerFields: [keyof QuoteCustomer, string, number][] = [["vatNumber", "الرقم الضريبي", 15], ["cr", "السجل التجاري", 10], ["nationalAddress", "العنوان الوطني المختصر", 120], ["fullAddress", "العنوان الوطني الكامل", 500], ["street", "اسم الشارع", 200], ["buildingNumber", "رقم المبنى", 4], ["additionalNumber", "الرقم الفرعي", 4], ["district", "الحي", 100], ["city", "المدينة", 100], ["postalCode", "الرمز البريدي", 5], ["country", "الدولة", 100]];
const digitFields = new Set<keyof QuoteCustomer>(["vatNumber", "cr", "buildingNumber", "additionalNumber", "postalCode"]);
const date = (value: string) => new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", calendar: "gregory", timeZone: "Asia/Riyadh" }).format(new Date(value));
const normalizedNumber = (value: string) => value.trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace("٫", ".");
const lineEditorValue = (line: EditorLine) => ({ kind: line.kind, name: line.name, months: line.months, quantity: line.quantity, amount: line.amount });

function editorLineInput(line: EditorLine): QuoteLineInput {
  const amount = parseInvoiceMoney(line.amount);
  return line.kind === "subscription"
    ? { kind: "subscription", name: line.name, months: Number(normalizedNumber(line.months)), amountCents: amount ?? -1 }
    : { kind: "item", name: line.name, quantity: Number(normalizedNumber(line.quantity)), unitPriceCents: amount ?? -1 };
}

function CustomerFields({ customer, onChange, prefix }: { customer: QuoteCustomer; onChange: (customer: QuoteCustomer) => void; prefix: string }) {
  return <details className={s.address}><summary>البيانات الضريبية والعنوان الوطني <small>اختياري</small></summary><div className={s.threeColumns}>
    {customerFields.map(([key, label, max]) => <label key={key} htmlFor={`${prefix}-${key}`}>{label}<input id={`${prefix}-${key}`} value={customer[key]} maxLength={max} inputMode={digitFields.has(key) ? "numeric" : "text"} dir={digitFields.has(key) || key === "nationalAddress" ? "ltr" : undefined} onChange={event => onChange({ ...customer, [key]: event.target.value })} /></label>)}
  </div><p className={s.hint}>يمكنك استكمال هذه البيانات لاحقًا قبل تحويل العرض إلى فاتورة والرقم الضريبي عند إدخاله يتكون من 15 رقمًا ويبدأ وينتهي بالرقم 3</p></details>;
}

export function SubscriptionQuotesPanel({ active, onInvoiceCreated }: { active: boolean; onInvoiceCreated: () => void }) {
  const [customer, setCustomer] = useState(blankCustomer), [validUntil, setValidUntil] = useState(invoiceLocalDate), [inclusive, setInclusive] = useState(true), [scopeWork, setScopeWork] = useState("");
  const [lines, setLines] = useState<EditorLine[]>([newLine(0)]), [saved, setSaved] = useState<SubscriptionQuote | null>(null), [invoice, setInvoice] = useState<SubscriptionInvoice | null>(null);
  const [quotes, setQuotes] = useState<SubscriptionQuoteList>({ rows: [], total: 0, page: 0, search: "" }), [search, setSearch] = useState(""), [listing, setListing] = useState(true), [loaded, setLoaded] = useState(false), [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState<"save" | "preview" | "open" | "convert" | null>(null), [notice, setNotice] = useState<Notice | null>(null), [preview, setPreview] = useState<{ url: string; draft: boolean; invoice?: boolean } | null>(null);
  const [conversion, setConversion] = useState<{ customer: QuoteCustomer; dueDate: string } | null>(null), [discard, setDiscard] = useState<{ id: string | null } | null>(null);
  const form = useRef<HTMLFormElement>(null), noticeRef = useRef<HTMLDivElement>(null), counter = useRef(1), quoteId = useRef<string | null>(null), requestLock = useRef(false), listRequest = useRef(0);
  const saveAttempt = useRef<{ signature: string; input: SaveSubscriptionQuoteInput } | null>(null), conversionAttempt = useRef<{ signature: string; input: ConvertSubscriptionQuoteInput } | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const editorState = { customer, validUntil, inclusive, scopeWork, lines: lines.map(lineEditorValue) };
  const dirty = baseline ? baseline !== JSON.stringify(editorState) : Boolean(customer.name || scopeWork || lines.some(line => line.name || line.amount));
  const converted = Boolean(saved?.convertedInvoiceId), disabled = Boolean(busy || converted);
  const scopeParagraphs = parseSubscriptionScope(scopeWork);
  const totals = lines.reduce((sum, line) => {
    const parsed = subscriptionQuoteDraftSchema.shape.lines.element.safeParse(editorLineInput(line));
    if (!parsed.success) return sum;
    const amount = quoteLineAmounts(parsed.data, inclusive);
    return { netCents: sum.netCents + amount.netCents, taxCents: sum.taxCents + amount.taxCents, totalCents: sum.totalCents + amount.totalCents };
  }, { netCents: 0, taxCents: 0, totalCents: 0 });

  useEffect(() => () => { if (preview?.url.startsWith("blob:")) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => { if (notice?.error) noticeRef.current?.focus(); }, [notice]);
  useEffect(() => {
    if (!active || loaded) return;
    const turn = ++listRequest.current;
    let present = true;
    fetchSubscriptionQuotesAction({ page: 0, search: "" }).then(result => {
      if (!present || turn !== listRequest.current) return;
      if (result.ok) { setQuotes(result.data); setHistoryError(""); } else setHistoryError(result.message);
      setLoaded(true); setListing(false);
    }).catch(() => { if (present && turn === listRequest.current) { setHistoryError("تعذر تحميل عروض الأسعار أعد المحاولة"); setLoaded(true); setListing(false); } });
    return () => { present = false; };
  }, [active, loaded]);

  function patchLine(key: number, patch: Partial<EditorLine>) { setLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line)); }
  function applyQuote(quote: SubscriptionQuote) {
    const nextLines = quote.draft.lines.map(line => ({ key: counter.current++, kind: line.kind, name: line.name, months: line.kind === "subscription" ? String(line.months) : "1", quantity: line.kind === "item" ? String(line.quantity) : "1", amount: invoiceMoney(line.kind === "subscription" ? line.amountCents : line.unitPriceCents) }));
    quoteId.current = quote.id; setSaved(quote); setInvoice(null); setCustomer(quote.draft.customer); setValidUntil(quote.draft.validUntil); setInclusive(quote.draft.taxInclusive); setScopeWork(quote.draft.scopeWork); setLines(nextLines);
    setBaseline(JSON.stringify({ customer: quote.draft.customer, validUntil: quote.draft.validUntil, inclusive: quote.draft.taxInclusive, scopeWork: quote.draft.scopeWork, lines: nextLines.map(lineEditorValue) }));
  }
  function reset() {
    setCustomer(blankCustomer()); setValidUntil(invoiceLocalDate()); setInclusive(true); setScopeWork(""); setLines([newLine(counter.current++)]); setSaved(null); setInvoice(null); setNotice(null); setConversion(null);
    quoteId.current = null; saveAttempt.current = null; conversionAttempt.current = null; setBaseline(null);
    form.current?.scrollIntoView({ block: "start" });
  }
  async function loadList(page = 0, term = search) {
    const turn = ++listRequest.current; setListing(true);
    try { const result = await fetchSubscriptionQuotesAction({ page, search: term }); if (turn !== listRequest.current) return; if (result.ok) { setQuotes(result.data); setHistoryError(""); } else setHistoryError(result.message); }
    catch { if (turn === listRequest.current) setHistoryError("تعذر تحديث السجل أعد المحاولة"); }
    finally { if (turn === listRequest.current) { setLoaded(true); setListing(false); } }
  }
  async function openQuote(id: string | null) {
    if (requestLock.current) return;
    if (!id) { reset(); return; }
    requestLock.current = true; setBusy("open"); setNotice(null);
    try { const result = await getSubscriptionQuoteAction(id); if (result.ok) { applyQuote(result.data); saveAttempt.current = null; conversionAttempt.current = null; form.current?.scrollIntoView({ block: "start" }); } else setNotice({ text: result.message, error: true }); }
    catch { setNotice({ text: "تعذر فتح عرض السعر أعد المحاولة", error: true }); }
    finally { requestLock.current = false; setBusy(null); }
  }
  function requestOpen(id: string | null) { if (busy) return; if (dirty) setDiscard({ id }); else void openQuote(id); }
  function draft(): SubscriptionQuoteDraft | null {
    if (!form.current?.reportValidity()) return null;
    const parsed = subscriptionQuoteDraftSchema.safeParse({ customer, validUntil, taxInclusive: inclusive, scopeWork, lines: lines.map(editorLineInput) });
    if (!parsed.success) { setNotice({ text: "راجع اسم العميل والبنود والمبالغ والمدة أو الكمية وبيانات العنوان", error: true }); return null; }
    return parsed.data;
  }
  async function run(kind: "preview" | "save") {
    if (requestLock.current || (kind === "save" && converted)) return;
    const input = draft(); if (!input) return;
    requestLock.current = true; setBusy(kind); setNotice(null);
    try {
      if (kind === "preview") {
        const result = await previewSubscriptionQuoteAction(input);
        if (result.ok) { const bytes = Uint8Array.from(atob(result.data.pdf), c => c.charCodeAt(0)); setPreview({ url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), draft: true }); }
        else setNotice({ text: result.message, error: true });
      } else {
        quoteId.current ??= crypto.randomUUID();
        const payload = { id: quoteId.current, revision: saved?.revision ?? 0, draft: input }, signature = JSON.stringify(payload);
        if (saveAttempt.current?.signature !== signature) saveAttempt.current = { signature, input: { ...payload, requestId: crypto.randomUUID() } };
        const result = await saveSubscriptionQuoteAction(saveAttempt.current.input);
        if (result.ok) { applyQuote(result.data); saveAttempt.current = null; setNotice({ text: `تم حفظ عرض السعر ${result.data.number}`, error: false }); setSearch(""); void loadList(0, ""); }
        else setNotice({ text: result.message, error: true });
      }
    } catch { setNotice({ text: kind === "save" ? "تعذر تأكيد الحفظ أعد المحاولة بنفس البيانات أو افتح العرض من السجل للتحقق" : "تعذر تجهيز معاينة عرض السعر أعد المحاولة", error: true }); }
    finally { requestLock.current = false; setBusy(null); }
  }
  async function convert() {
    if (requestLock.current || !saved || !conversion || converted || dirty) return;
    const parsed = convertSubscriptionQuoteSchema.safeParse({ id: saved.id, revision: saved.revision, requestId: crypto.randomUUID(), customer: conversion.customer, dueDate: conversion.dueDate });
    if (!parsed.success) { setNotice({ text: "راجع بيانات العميل والرقم الضريبي والسجل وتاريخ الاستحقاق قبل إصدار الفاتورة", error: true }); return; }
    const signature = JSON.stringify({ id: parsed.data.id, revision: parsed.data.revision, customer: parsed.data.customer, dueDate: parsed.data.dueDate });
    if (conversionAttempt.current?.signature !== signature) conversionAttempt.current = { signature, input: parsed.data };
    requestLock.current = true; setBusy("convert"); setNotice(null);
    try {
      const result = await convertSubscriptionQuoteAction(conversionAttempt.current.input);
      if (result.ok) { setInvoice(result.data); setSaved({ ...saved, convertedInvoiceId: result.data.id }); setConversion(null); conversionAttempt.current = null; setNotice({ text: `تم تحويل العرض إلى الفاتورة ${result.data.number}`, error: false }); onInvoiceCreated(); void loadList(0, ""); }
      else setNotice({ text: result.message, error: true });
    } catch { setNotice({ text: "تعذر تأكيد التحويل أعد المحاولة بنفس البيانات لتجنب تكرار الفاتورة", error: true }); }
    finally { requestLock.current = false; setBusy(null); }
  }
  const quoteUrl = (id: string) => `/api/admin/subscription-quotes/${id}`, invoiceUrl = (id: string) => `/api/admin/subscription-invoices/${id}`;

  return <main className={s.page} dir="rtl">
    <header className={s.heading}><div><span className={s.eyebrow}><FileText size={17} aria-hidden="true" />إدارة المنصة</span><h1>عروض الأسعار</h1><p>اكتب بنود العميل وأرفق نطاق العمل ثم حوّل العرض إلى فاتورة عند الاتفاق</p></div><span className={s.sellerBadge}><FileText aria-hidden="true" /><span>جهة الإصدار<strong>{INVOICE_SELLER.name}</strong></span></span></header>
    {notice && <div className={notice.error ? s.error : s.success} ref={noticeRef} tabIndex={-1} role={notice.error ? "alert" : "status"}>{notice.text}</div>}
    <div className={s.workspace}>
      <form ref={form} className={s.editor} onSubmit={event => { event.preventDefault(); void run("save"); }}>
        <div className={s.panelTitle}><h2>{saved ? "تفاصيل عرض السعر" : "عرض سعر جديد"}</h2><span>{saved ? <bdi>{saved.number}</bdi> : "العملة: الريال السعودي"}</span></div>
        {saved && <div className={q.savedInfo}><p>{converted ? "تم تحويل هذا العرض إلى فاتورة وحفظ نسخته" : dirty ? "لديك تغييرات غير محفوظة احفظها قبل تحويل العرض" : "يمكنك استكمال بيانات العميل عند التحويل إلى فاتورة"}</p><span className={`${q.status} ${converted ? q.converted : ""}`}>{converted ? "تم التحويل" : "عرض محفوظ"}</span></div>}
        <fieldset disabled={disabled} className={s.fields}><legend>بيانات العميل</legend><div className={s.twoColumns}><label htmlFor="quote-customer">اسم العميل أو المنشأة<input id="quote-customer" autoComplete="organization" value={customer.name} required minLength={2} maxLength={160} onChange={event => setCustomer({ ...customer, name: event.target.value })} placeholder="اسم العميل كما سيظهر في عرض السعر" /></label><label htmlFor="quote-valid-until">عرض السعر صالح حتى<input id="quote-valid-until" type="date" required value={validUntil} onChange={event => setValidUntil(event.target.value)} /></label></div><CustomerFields customer={customer} onChange={setCustomer} prefix="quote-customer" /></fieldset>
        <fieldset disabled={disabled} className={s.fields}><legend>بنود عرض السعر</legend><div className={s.amountMode}><label htmlFor="quote-amount-mode">طريقة إدخال السعر<select id="quote-amount-mode" value={inclusive ? "inclusive" : "exclusive"} onChange={event => setInclusive(event.target.value === "inclusive")}><option value="inclusive">السعر شامل ضريبة 15%</option><option value="exclusive">السعر قبل ضريبة 15%</option></select></label><p>اكتب اسم كل بند وحدد إن كان اشتراكًا أو صنفًا بالكمية</p></div>
          <div className={s.lines}>{lines.map((line, index) => {
            const parsed = subscriptionQuoteDraftSchema.shape.lines.element.safeParse(editorLineInput(line)), lineTotal = parsed.success ? quoteLineAmounts(parsed.data, inclusive).totalCents : 0;
            return <div className={q.line} key={line.key}><div className={q.lineTop}><span className={s.lineNumber}>{index + 1}</span><label>نوع البند<select value={line.kind} onChange={event => patchLine(line.key, { kind: event.target.value as EditorLine["kind"] })} aria-label={`نوع البند ${index + 1}`}><option value="subscription">اشتراك</option><option value="item">صنف بالكمية</option></select></label><label>اسم الصنف أو الخدمة<input value={line.name} required maxLength={200} onChange={event => patchLine(line.key, { name: event.target.value })} placeholder={line.kind === "subscription" ? "مثال: إدارة حسابات التواصل" : "مثال: طباعة بروشور"} aria-label={`اسم البند ${index + 1}`} /></label><button type="button" className={s.remove} disabled={lines.length === 1} aria-label={`حذف البند ${index + 1}`} onClick={() => setLines(current => current.filter(item => item.key !== line.key))}><Trash2 size={17} aria-hidden="true" /></button></div>
              <div className={q.lineBottom}>{line.kind === "subscription" ? <label>مدة الاشتراك بالأشهر<input type="number" min="1" max="120" step="1" required value={line.months} onChange={event => patchLine(line.key, { months: event.target.value })} aria-label={`مدة البند ${index + 1} بالأشهر`} /></label> : <label>الكمية<input type="number" min="0.001" max="1000000" step="0.001" inputMode="decimal" required value={line.quantity} onChange={event => patchLine(line.key, { quantity: event.target.value })} aria-label={`كمية البند ${index + 1}`} /></label>}<label>{line.kind === "subscription" ? "إجمالي السعر للمدة كاملة" : "سعر الوحدة"}<div className={s.moneyField}><input required inputMode="decimal" dir="ltr" value={line.amount} maxLength={11} placeholder="0.00" onChange={event => patchLine(line.key, { amount: event.target.value })} aria-label={`سعر البند ${index + 1}`} /><span>ر س</span></div></label><div className={q.lineTotal}><small>الإجمالي شامل الضريبة</small><bdi>{invoiceMoney(lineTotal)}</bdi><small>ر س</small></div><p className={q.lineHelp}>{line.kind === "subscription" ? "المبلغ للمدة المحددة كاملة ولا يُضرب في عدد الأشهر" : "الإجمالي يُحسب من الكمية مضروبة في سعر الوحدة"}</p></div>
            </div>;
          })}</div><button type="button" className={s.secondary} disabled={lines.length >= 20} onClick={() => setLines(current => [...current, newLine(counter.current++)])}><Plus size={17} aria-hidden="true" />إضافة بند</button>
        </fieldset>
        <fieldset disabled={disabled} className={s.fields}><legend>نطاق العمل <small>اختياري</small></legend><label htmlFor="quote-scope">تفاصيل الأعمال المتفق عليها<textarea id="quote-scope" className={q.scope} dir="rtl" value={scopeWork} maxLength={12000} onChange={event => setScopeWork(event.target.value)} placeholder="اكتب الخدمات والمخرجات ومراحل التنفيذ وما يشمله الاتفاق مع العميل" aria-describedby="quote-scope-hint" /></label><div className={q.scopeMeta}><p id="quote-scope-hint">يظهر نطاق العمل في صفحة مستقلة بعد عرض السعر مع تنسيق العناوين والترقيم كما في المعاينة</p><span>{scopeWork.length.toLocaleString("ar-SA")} / ١٢٬٠٠٠</span></div>
          {scopeParagraphs.length > 0 && <section className={q.scopePreview} aria-label="معاينة نطاق العمل" dir="rtl"><h3>معاينة نطاق العمل</h3><div className={q.scopePreviewBody}>{scopeParagraphs.map((paragraph, index) => <div className={q.scopeParagraph} key={index}>{paragraph.number !== null && <bdi className={q.scopeNumber} dir="ltr">{paragraph.number}.</bdi>}<p>{paragraph.segments.map((segment, segmentIndex) => segment.bold ? <strong key={segmentIndex}>{segment.text}</strong> : <span key={segmentIndex}>{segment.text}</span>)}</p></div>)}</div></section>}
        </fieldset>
        <footer className={s.formActions}>{!converted && <button className={s.primary} type="submit" disabled={!!busy || Boolean(saved && !dirty)}>{busy === "save" ? <LoaderCircle size={18} className={s.spin} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}{busy === "save" ? "جار الحفظ" : saved ? "حفظ التعديلات" : "حفظ عرض السعر"}</button>}
          <button className={s.secondary} type="button" disabled={!!busy} onClick={() => void run("preview")}><Eye size={18} aria-hidden="true" />{busy === "preview" ? "جار تجهيز المعاينة" : "معاينة عرض السعر"}</button>
          {saved && !dirty && <a className={s.secondary} href={`${quoteUrl(saved.id)}?download=1`}><Download size={18} aria-hidden="true" />تنزيل عرض السعر</a>}
          {saved && !converted && <button className={s.secondary} type="button" disabled={!!busy || dirty} onClick={() => { conversionAttempt.current = null; setNotice(null); setConversion({ customer: saved.draft.customer, dueDate: invoiceLocalDate() }); }}><ArrowLeftRight size={18} aria-hidden="true" />تحويل إلى فاتورة ضريبية</button>}
          {saved?.convertedInvoiceId && <a className={s.primary} href={`${invoiceUrl(saved.convertedInvoiceId)}?download=1`}><Receipt size={18} aria-hidden="true" />تنزيل الفاتورة{invoice ? ` ${invoice.number}` : ""}</a>}
          <button className={s.secondary} type="button" disabled={!!busy} onClick={() => requestOpen(null)}><Plus size={18} aria-hidden="true" />عرض جديد</button><p>عرض السعر ليس فاتورة ضريبية وبعد التحويل تُحفظ الفاتورة ولا يمكن تعديلها</p>
        </footer>
      </form>
      <aside className={s.summary} aria-label="ملخص عرض السعر"><div className={s.summaryTop}><span>إجمالي عرض السعر</span><strong><bdi>{invoiceMoney(totals.totalCents)}</bdi><small>ر س</small></strong><p>شامل ضريبة القيمة المضافة</p></div><dl><div><dt>قبل الضريبة</dt><dd><bdi>{invoiceMoney(totals.netCents)}</bdi> ر س</dd></div><div><dt>ضريبة القيمة المضافة 15%</dt><dd><bdi>{invoiceMoney(totals.taxCents)}</bdi> ر س</dd></div><div><dt>عدد البنود</dt><dd>{lines.length}</dd></div></dl><div className={s.seller}><span>جهة إصدار العرض والفاتورة</span><strong>{INVOICE_SELLER.name}</strong><p>السجل التجاري <bdi>{INVOICE_SELLER.cr}</bdi></p><p>الرقم الضريبي <bdi>{INVOICE_SELLER.vatNumber}</bdi></p></div><p className={s.localNote}>{scopeWork.trim() ? "نطاق العمل مرفق في صفحة مستقلة مع عرض السعر" : "يمكنك إضافة نطاق العمل ضمن العرض قبل إرساله للعميل"}</p></aside>
    </div>
    <section className={s.history} aria-labelledby="quote-history-title"><div className={s.historyHeading}><div><h2 id="quote-history-title">سجل عروض الأسعار</h2><p>{quotes.total} عرض محفوظ</p></div><form className={s.search} onSubmit={event => { event.preventDefault(); void loadList(0); }}><label className={s.srOnly} htmlFor="quote-search">بحث باسم العميل أو رقم العرض</label><input id="quote-search" value={search} maxLength={160} onChange={event => setSearch(event.target.value)} placeholder="اسم العميل أو رقم عرض السعر" /><button type="submit" disabled={listing} aria-label="بحث في عروض الأسعار"><Search size={18} aria-hidden="true" /></button></form></div>
      {historyError ? <div className={s.error} role="alert">{historyError}<button type="button" onClick={() => void loadList(0)} disabled={listing}>إعادة المحاولة</button></div> : <div className={s.tableWrap} aria-busy={listing}>{listing && !loaded ? <div className={s.empty} role="status">جار تحميل عروض الأسعار</div> : quotes.rows.length ? <table><caption className={s.srOnly}>عروض الأسعار المحفوظة وتحويلها إلى فواتير</caption><thead><tr><th scope="col">رقم العرض</th><th scope="col">العميل</th><th scope="col">التاريخ</th><th scope="col">الإجمالي شامل الضريبة</th><th scope="col">الحالة</th><th scope="col">الإجراءات</th></tr></thead><tbody>{quotes.rows.map(row => <tr key={row.id}><td><bdi>{row.quote_number}</bdi></td><td>{row.customer_name}</td><td>{date(row.created_at)}</td><td><bdi>{invoiceMoney(row.total_cents)}</bdi> ر س</td><td><span className={`${q.status} ${row.converted_invoice_id ? q.converted : ""}`}>{row.converted_invoice_id ? "تم التحويل" : "عرض سعر"}</span></td><td><div className={s.rowActions}><button type="button" disabled={!!busy} onClick={() => requestOpen(row.id)}>{row.converted_invoice_id ? "عرض" : "فتح وتعديل"}</button><a href={`${quoteUrl(row.id)}?download=1`} aria-label={`تنزيل عرض السعر ${row.quote_number}`}><Download size={18} aria-hidden="true" /></a>{row.converted_invoice_id && <a href={`${invoiceUrl(row.converted_invoice_id)}?download=1`} aria-label={`تنزيل فاتورة العرض ${row.quote_number}`}><Receipt size={18} aria-hidden="true" /></a>}</div></td></tr>)}</tbody></table> : <div className={s.empty}><FileText size={32} aria-hidden="true" /><h3>{quotes.search ? "لا توجد عروض مطابقة" : "عرض السعر يبدأ بتفاصيل العميل"}</h3><p>{quotes.search ? "جرّب اسمًا أو رقم عرض آخر" : "اكتب البنود واحفظ العرض لتعود إليه وتكمل بيانات العميل وقت الاتفاق"}</p></div>}</div>}
      {quotes.total > 20 && <nav className={s.pagination} aria-label="صفحات عروض الأسعار"><button type="button" disabled={listing || quotes.page === 0} onClick={() => void loadList(quotes.page - 1, quotes.search)}>السابق</button><span>صفحة {quotes.page + 1} من {Math.ceil(quotes.total / 20)}</span><button type="button" disabled={listing || (quotes.page + 1) * 20 >= quotes.total} onClick={() => void loadList(quotes.page + 1, quotes.search)}>التالي</button></nav>}
    </section>
    {preview && <BrandDialog title="معاينة عرض السعر" close={() => setPreview(null)} detail><div className={s.preview}><p>عرض السعر ونطاق العمل بنفس تصميم الفاتورة وهذه النسخة ليست فاتورة ضريبية</p><a className={s.secondary} href={preview.url} target="_blank" rel="noopener">فتح في نافذة للطباعة والتنزيل</a><iframe title="عرض السعر ونطاق العمل" src={preview.url} /></div></BrandDialog>}
    {conversion && saved && <BrandDialog title="تحويل عرض السعر إلى فاتورة ضريبية" close={() => { if (!busy) setConversion(null); }} detail busy={busy === "convert"}><form className={`${s.page} ${q.conversion}`} onSubmit={event => { event.preventDefault(); void convert(); }}><p>سيتم إصدار فاتورة بقيمة <strong><bdi>{invoiceMoney(saved.totalCents)}</bdi> ر س</strong> من العرض <bdi>{saved.number}</bdi> ويمكنك استكمال بيانات العميل الاختيارية قبل الإصدار</p>{notice?.error && <div className={s.error} role="alert">{notice.text}</div>}<fieldset disabled={busy === "convert"} className={s.fields}><div className={s.twoColumns}><label>اسم العميل أو المنشأة<input required minLength={2} maxLength={160} value={conversion.customer.name} onChange={event => setConversion({ ...conversion, customer: { ...conversion.customer, name: event.target.value } })} /></label><label>تاريخ استحقاق الفاتورة<input type="date" required value={conversion.dueDate} onChange={event => setConversion({ ...conversion, dueDate: event.target.value })} /></label></div><CustomerFields customer={conversion.customer} onChange={value => setConversion({ ...conversion, customer: value })} prefix="quote-convert-customer" /></fieldset><div className={q.conversionActions}><button type="submit" disabled={busy === "convert"}>{busy === "convert" ? "جار إصدار الفاتورة" : "تأكيد التحويل وإصدار الفاتورة"}</button><button type="button" disabled={busy === "convert"} onClick={() => setConversion(null)}>رجوع إلى العرض</button></div></form></BrandDialog>}
    {discard && <BrandDialog title="تغييرات غير محفوظة" close={() => setDiscard(null)}><div className={q.conversion}><p>يوجد تعديل لم يُحفظ في عرض السعر الحالي هل تريد المتابعة وترك هذا التعديل؟</p><div className={q.conversionActions}><button type="button" onClick={() => { const id = discard.id; setDiscard(null); void openQuote(id); }}>متابعة بدون حفظ</button><button type="button" onClick={() => setDiscard(null)}>رجوع للحفظ</button></div></div></BrandDialog>}
  </main>;
}
