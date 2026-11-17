"use client";
import { useAldeemAutoLoad } from "@/components/aldeem/use-auto-load";

import { useRef, useState } from "react";
import { FileText, Plus, RefreshCw, Search } from "lucide-react";
import { readQuotesAction } from "@/app/actions/finance-quotes";
import { displayRecordNumber } from "@/lib/erp/settings-numbering";
import { quoteStatus, quoteStatusLabels, type QuoteRecord } from "@/lib/finance/quotation";
import { AldeemQuoteEditor } from "./aldeem-quote-editor";
import css from "./aldeem-sales-quotes.module.css";

const money = (value: number) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

/** Read only this register when its workspace is first entered. */
export function AldeemSalesQuotes() {
  const [records, setRecords] = useState<QuoteRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{ key: number; saved?: QuoteRecord } | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const busy = useRef(false);
  const generation = useRef(0);
  const editorKey = useRef(0);
  const returnButton = useRef<HTMLButtonElement | null>(null);

  useAldeemAutoLoad(load);
  async function load() {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError("");
    const version = generation.current;
    try {
      const result = await readQuotesAction("khayal-aldeem");
      if (!result.ok) throw new Error(result.message);
      if (version === generation.current) { setRecords(result.data); setLoaded(true); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر قراءة سجل عروض الأسعار أعد المحاولة"); }
    finally { busy.current = false; setLoading(false); }
  }
  function open(button: HTMLButtonElement | null, saved?: QuoteRecord) {
    returnButton.current = button;
    setEditor({ key: ++editorKey.current, saved });
  }
  function close() {
    setEditor(null);
    requestAnimationFrame(() => returnButton.current?.focus({ preventScroll: true }));
  }
  const filtered = records.filter(record =>
    (status === "all" || quoteStatus(record) === status) && (!from || record.payload.date >= from) && (!to || record.payload.date <= to)
    && `${displayRecordNumber(record)} ${record.customerName} ${record.payload.document.invoice.note}`.toLocaleLowerCase("ar").includes(query.trim().toLocaleLowerCase("ar")),
  ).sort((a, b) => b.number - a.number);
  const pages = Math.max(1, Math.ceil(filtered.length / 20)), current = Math.min(page, pages);

  return <div className={css.page}>
    {editor && <AldeemQuoteEditor key={editor.key} saved={editor.saved} onBack={close} onSaved={record => { generation.current++; setRecords(previous => [record, ...previous.filter(row => row.id !== record.id)]); }} />}
    <div hidden={!!editor}>
      <header className={css.toolbar}><div><h2>سجل عروض الأسعار</h2><p>عروضك وأسعارك محفوظة في سجل مستقل</p></div><div className={css.actions}><button type="button" disabled={loading} onClick={() => void load()}><RefreshCw size={17} aria-hidden="true" />{loading ? "جار قراءة السجل" : error ? "إعادة المحاولة" : "تحديث السجل"}</button><button type="button" className={css.primary} onClick={event => open(event.currentTarget)}><Plus size={18} aria-hidden="true" />إنشاء عرض سعر</button></div></header>
      {error && <p className={css.error} role="alert">{error}</p>}
      <section className={css.filters} aria-label="البحث في عروض الأسعار"><label><span><Search size={16} aria-hidden="true" />العميل أو رقم العرض</span><input type="search" placeholder="ابحث في العروض المعروضة" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><label>من تاريخ<input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></label><label>إلى تاريخ<input type="date" min={from} value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></label></section>
      <div className={css.tabs} aria-label="حالة عرض السعر">{[["all", "الكل"], ...Object.entries(quoteStatusLabels)].map(([key, label]) => <button type="button" key={key} aria-pressed={status === key} onClick={() => { setStatus(key); setPage(1); }}>{label}<span>{records.filter(record => key === "all" || quoteStatus(record) === key).length}</span></button>)}</div>
      <section className={css.register} aria-label="سجل عروض الأسعار" aria-busy={loading}>
        {filtered.length > 0 ? <div className={css.tableScroll} role="region" aria-label="العروض المحفوظة" tabIndex={0}><table><thead><tr>{["عرض السعر", "العميل", "التاريخ", "صالح حتى", "الإجمالي", "الحالة"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{filtered.slice((current - 1) * 20, current * 20).map(record => <tr key={record.id} onClick={event => open(event.currentTarget.querySelector("button"), record)}><td><button type="button" className={css.recordLink} onClick={event => { event.stopPropagation(); open(event.currentTarget, record); }}>#{displayRecordNumber(record)}</button></td><td>{record.customerName || "لم يُحدد العميل"}</td><td>{record.payload.date}</td><td>{record.payload.validUntil || "غير محدد"}</td><td>{money(record.total)}</td><td><span className={css.badge}>{quoteStatusLabels[quoteStatus(record)]}</span></td></tr>)}</tbody></table></div> : <div className={css.empty}><FileText size={32} strokeWidth={1.5} aria-hidden="true" /><h3>{loading ? "جار قراءة السجل" : !loaded ? "ابدأ عرض سعر جديد" : query || status !== "all" || from || to ? "لا توجد عروض تطابق البحث" : "لا توجد عروض أسعار محفوظة"}</h3><p>{!loaded ? "يظهر السجل تلقائيًا عند اكتمال تحميل البيانات" : "أضف العميل والأصناف ثم احفظ العرض للمعاينة والطباعة"}</p></div>}
        <footer className={css.footer}><span>{filtered.length} عرض سعر معروض</span><div className={css.actions}><button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>السابق</button><span>{current} / {pages}</span><button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)}>التالي</button></div></footer>
      </section>
      {loaded && records.length >= 500 && <p className={css.hint}>يعرض السجل أحدث ٥٠٠ عرض سعر</p>}
    </div>
  </div>;
}
