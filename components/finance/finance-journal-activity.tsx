"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, FileText } from "lucide-react";
import { fetchJournalActivityAction } from "@/app/actions/finance-journal-detail";
import type { JournalActivityFilters, JournalActivityPage } from "@/lib/finance/journal-detail";
import { financeDate } from "./finance-ui";
import styles from "./finance-journal-detail.module.css";

const initialFilters: JournalActivityFilters = { action: "all", actorId: null, from: "", to: "", sort: "newest", offset: 0 };
const dayKey = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
function dayLabel(value: string) {
  const key = dayKey(value);
  if (key === dayKey(new Date().toISOString())) return "اليوم";
  if (key === dayKey(new Date(Date.now() - 86400000).toISOString())) return "أمس";
  return new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", calendar: "gregory", day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}
export function FinanceJournalActivity({ id, slug, disabled = false }: { id: string; slug: string; disabled?: boolean }) {
  const [filters, setFilters] = useState<JournalActivityFilters>(initialFilters);
  const [query, setQuery] = useState<JournalActivityFilters>(initialFilters);
  const [revision, setRevision] = useState(0), [validation, setValidation] = useState("");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ id: string; slug: string; query: JournalActivityFilters; revision: number; data?: JournalActivityPage; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    fetchJournalActivityAction(id, query, slug).then(result => { if (active) setLoaded({ id, slug, query, revision, ...(result.ok ? { data: result.data } : { error: result.message }) }); }).catch(() => { if (active) setLoaded({ id, slug, query, revision, error: "تعذر تحميل سجل النشاط أعد المحاولة" }); });
    return () => { active = false; };
  }, [id, slug, query, revision]);
  const matching = loaded?.id === id && loaded.slug === slug ? loaded : null;
  const current = matching?.query === query && matching.revision === revision ? matching : null;
  const loading = !current, page = current?.data, options = matching?.data;
  const change = <K extends keyof JournalActivityFilters>(key: K, value: JournalActivityFilters[K]) => {
    if (disabled || loading) return;
    setFilters(previous => ({ ...previous, [key]: value }));
    if (key !== "from" && key !== "to") setQuery(previous => ({ ...previous, [key]: value, offset: 0 }));
  };
  function search() {
    if (disabled || loading) return;
    if (filters.from && filters.to && filters.from > filters.to) { setValidation("تاريخ البداية يجب ألا يتجاوز تاريخ النهاية"); return; }
    setValidation(""); setQuery({ ...filters, offset: 0 }); setPeriodOpen(false);
  }
  const groups = (page?.rows ?? []).reduce<{ day: string; rows: JournalActivityPage["rows"] }[]>((result, row) => {
    const key = dayKey(row.createdAt), last = result.at(-1);
    if (last?.day === key) last.rows.push(row); else result.push({ day: key, rows: [row] });
    return result;
  }, []);
  return <div className={styles.activityBody} aria-busy={loading}>
    <div className={styles.activityControls}>
      <nav className={styles.activityPaging} aria-label="صفحات سجل النشاط"><button type="button" aria-label="السابق" title="السابق" disabled={disabled || loading || !page || page.offset <= 0} onClick={() => { if (!disabled && !loading && page && page.offset > 0) setQuery(previous => ({ ...previous, offset: Math.max(0, page.offset - page.pageSize) })); }}><ChevronRight size={14} aria-hidden="true" /></button><button type="button" aria-label="التالي" title="التالي" disabled={disabled || loading || !page?.hasMore} onClick={() => { if (!disabled && !loading && page?.hasMore) setQuery(previous => ({ ...previous, offset: page.offset + page.pageSize })); }}><ChevronLeft size={14} aria-hidden="true" /></button></nav>
      <div className={styles.activitySelects}>
        <label><span className={styles.visuallyHidden}>الإجراء</span><select value={filters.action} disabled={disabled || loading} onChange={event => change("action", event.target.value as JournalActivityFilters["action"])}><option value="all">كل الإجراءات</option>{(options?.actionOptions ?? [{ id: "created", label: "إنشاء" }, { id: "payment", label: "تعديل دفعة" }, { id: "description", label: "تعديل الوصف" }]).filter(option => option.id !== "all").map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <label><span className={styles.visuallyHidden}>الموظف</span><select value={filters.actorId ?? ""} disabled={disabled || loading} onChange={event => change("actorId", event.target.value || null)}><option value="">كل الفاعلين</option>{options?.actors.map(actor => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></label>
        <div className={styles.periodPicker} onKeyDown={event => { if (event.key === "Escape") { setPeriodOpen(false); event.currentTarget.querySelector("button")?.focus(); } }}>
          <button type="button" aria-expanded={periodOpen} disabled={disabled || loading} onClick={() => setPeriodOpen(value => !value)}>{query.from || query.to ? `${query.from || "البداية"} — ${query.to || "اليوم"}` : "تحديد الفترة الزمنية"}</button>
          {periodOpen && <form className={styles.periodPanel} onSubmit={event => { event.preventDefault(); search(); }}><label>من تاريخ<input type="date" value={filters.from} disabled={disabled || loading} onChange={event => change("from", event.target.value)} /></label><label>إلى تاريخ<input type="date" value={filters.to} disabled={disabled || loading} onChange={event => change("to", event.target.value)} /></label><button type="submit" disabled={disabled || loading}>تطبيق</button>{validation && <p role="alert" className={styles.error}>{validation}</p>}</form>}
        </div>
      </div>
      <div className={styles.activityOrdering} role="group" aria-label="ترتيب سجل النشاط"><button type="button" aria-label="الأقدم أولًا" title="الأقدم أولًا" aria-pressed={query.sort === "oldest"} disabled={disabled || loading} onClick={() => change("sort", "oldest")}><ChevronUp size={14} aria-hidden="true" /></button><button type="button" aria-label="الأحدث أولًا" title="الأحدث أولًا" aria-pressed={query.sort === "newest"} disabled={disabled || loading} onClick={() => change("sort", "newest")}><ChevronDown size={14} aria-hidden="true" /></button></div>
    </div>
    {(query.action !== "all" || query.actorId || query.from || query.to || query.sort !== "newest" || filters.from || filters.to) && <button className={styles.activityReset} type="button" disabled={disabled || loading} onClick={() => { if (!disabled && !loading) { setFilters(initialFilters); setQuery({ ...initialFilters }); setValidation(""); setPeriodOpen(false); } }}>إلغاء الفلتر</button>}
    {loading && <p role="status" className={styles.empty}>جار تحميل سجل النشاط</p>}{current?.error && <div role="alert" className={styles.error}>{current.error}<button type="button" onClick={() => setRevision(value => value + 1)}>إعادة المحاولة</button></div>}
    {page && <><p className={styles.visuallyHidden} role="status">عدد النشاطات {page.total} صفحة {Math.floor(page.offset / page.pageSize) + 1}</p><div className={styles.activityTimeline}>{groups.length ? groups.map(group => <section key={group.day} className={styles.timelineDay}><h3>{dayLabel(group.rows[0].createdAt)}</h3><ol>{group.rows.map(row => <li key={row.id} className={styles.timelineItem}><span className={styles.timelineMarker} aria-hidden="true"><FileText size={17} /></span><article className={styles.timelineCard}><header><span>{row.actor || "غير مسجل"}</span><span>{row.action}</span>{row.field === "line_memo" && <strong>{row.accountName || "سطر القيد"} {row.accountCode && <bdi>#{row.accountCode}</bdi>}</strong>}</header>{row.field && <div className={styles.timelineChange}><span>{row.field === "document_note" ? "وصف القيد" : "وصف الحركة"}:</span><del aria-label="قبل التعديل">{row.before || "فارغ"}</del><ArrowLeft size={14} aria-hidden="true" /><ins aria-label="بعد التعديل">{row.after || "فارغ"}</ins></div>}<footer><time dateTime={row.createdAt} title={financeDate(row.createdAt)}><Clock3 size={13} aria-hidden="true" /><bdi>{new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(row.createdAt))}</bdi></time><span className={styles.timelineActor}><span aria-hidden="true">{(row.actor || "؟").trim().slice(0, 1)}</span>{row.actor || "غير مسجل"}</span></footer></article></li>)}</ol></section>) : <p className={styles.empty}>لا توجد نشاطات مطابقة للبحث</p>}</div></>}
  </div>;
}
