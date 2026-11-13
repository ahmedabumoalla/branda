"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import { readShiftSessionsAction } from "@/app/actions/finance-shift-sessions";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { emptyShiftSessionFilters, type ShiftSessionFilters, type ShiftSessionList } from "@/lib/finance/shift-sessions";
import { FinanceShiftSession, ShiftSessionPagination } from "./finance-shift-session";
import { Empty, financeDate, Numeric } from "./finance-ui";
import styles from "./finance.module.css";
import css from "./finance-shift-monitor.module.css";

export function FinanceShiftMonitor({ snapshot, slug, onChanged, onInvoice }: { snapshot: FinanceSnapshot; slug?: string; onChanged: () => void; onInvoice?: (id: string, paymentId?: string | null) => void }) {
  const [draft, setDraft] = useState<ShiftSessionFilters>(emptyShiftSessionFilters), [filters, setFilters] = useState<ShiftSessionFilters>(emptyShiftSessionFilters);
  const [advanced, setAdvanced] = useState(false), [revision, setRevision] = useState(0);
  const params = useSearchParams();
  const routeId = params.get("shiftSession");
  const selected = routeId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(routeId) ? routeId : null;
  function setSelected(id: string | null) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("shiftSession", id); else next.delete("shiftSession");
    next.delete("shiftTab");
    window.history.pushState(null, "", `${window.location.pathname}?${next}`);
  }
  const [state, setState] = useState<{ key: string; data?: ShiftSessionList; error?: string } | null>(null);
  const key = `${snapshot.cafe.id}:${slug}:${JSON.stringify(filters)}:${revision}`;
  useEffect(() => {
    let active = true, busy = false;
    async function load() {
      if (busy || selected || document.visibilityState === "hidden") return;
      busy = true;
      try { const result = await readShiftSessionsAction(filters, slug); if (active) setState({ key, ...(result.ok ? { data: result.data } : { error: result.message }) }); }
      catch { if (active) setState({ key, error: "تعذر تحميل الورديات أعد المحاولة" }); }
      finally { busy = false; }
    }
    void load(); const timer = setInterval(() => void load(), 15000);
    return () => { active = false; clearInterval(timer); };
  }, [filters, slug, selected, revision, key]);
  if (selected) return <FinanceShiftSession key={`${snapshot.cafe.id}:${selected}`} id={selected} snapshot={snapshot} slug={slug} onInvoice={onInvoice} onBack={() => setSelected(null)} onChanged={() => { setRevision(value => value + 1); onChanged(); }} />;
  const current = state?.key === key ? state : null, page = current?.data;
  const update = <K extends keyof ShiftSessionFilters>(field: K, value: ShiftSessionFilters[K]) => setDraft(previous => ({ ...previous, [field]: value }));
  return <section className={css.manager} dir="rtl" aria-label="إدارة الورديات">
    <div className={css.topbar}><ShiftSessionPagination total={page?.total ?? 0} offset={filters.offset} limit={30} loading={!current} onChange={offset => setFilters(value => ({ ...value, offset }))} /><div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => setRevision(value => value + 1)} aria-label="تحديث الورديات"><RefreshCw size={17} aria-hidden="true" /></button>{canFinance(snapshot.role, "pos") && <Link className={styles.primary} href={`/finance/${encodeURIComponent(snapshot.cafe.slug)}/pos`}><Plus size={17} aria-hidden="true" />وردية جديدة</Link>}</div></div>
    <form className={css.searchPanel} onSubmit={event => { event.preventDefault(); setFilters({ ...draft, offset: 0 }); }}>
      <h2>بحث</h2><div className={css.searchFields}><label>رقم الوردية أو الموظف<input value={draft.query} maxLength={120} onChange={event => update("query", event.target.value)} /></label><label>الصندوق<select value={draft.accountId} onChange={event => update("accountId", event.target.value)}><option value="">أي صندوق</option>{snapshot.accounts.filter(row => row.kind === "cash").map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>الحالة<select value={draft.status} onChange={event => update("status", event.target.value as ShiftSessionFilters["status"])}><option value="">أي حالة</option><option value="open">مفتوحة</option><option value="closed">مغلقة</option><option value="handover">بانتظار الاستلام</option></select></label></div>
      {advanced && <div className={css.searchFields}><label>تاريخ الفتح من<input type="date" value={draft.from} max={draft.to || undefined} onChange={event => update("from", event.target.value)} /></label><label>تاريخ الفتح إلى<input type="date" value={draft.to} min={draft.from || undefined} onChange={event => update("to", event.target.value)} /></label></div>}
      <div className={css.searchActions}><button type="button" className={styles.secondary} aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}><SlidersHorizontal size={16} aria-hidden="true" />بحث متقدم</button><div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => { setDraft(emptyShiftSessionFilters); setFilters(emptyShiftSessionFilters); }}>إلغاء الفلتر</button><button className={styles.primary} type="submit">بحث</button></div></div>
    </form>
    {current?.error && <div className={styles.error} role="alert">{current.error}<button type="button" className={styles.secondary} onClick={() => setRevision(value => value + 1)}>إعادة المحاولة</button></div>}
    {!current ? <p className={css.empty} role="status">جار تحميل الورديات</p> : page && (!page.rows.length ? <Empty title="لا توجد ورديات مطابقة" /> : <div className={css.tableWrap}><table className={css.table}><thead><tr><th>رقم الوردية</th><th>الوردية / موظف الخزنة</th><th>فتح / إغلاق</th><th>الرصيد المتوقع</th><th>صافي المبيعات</th><th><label className={css.sort}>ترتيب<select aria-label="ترتيب الورديات" value={filters.sort} onChange={event => { const sort = event.target.value as ShiftSessionFilters["sort"]; setFilters(value => ({ ...value, sort, offset: 0 })); setDraft(value => ({ ...value, sort })); }}><option value="opened_desc">الأحدث فتحًا</option><option value="opened_asc">الأقدم فتحًا</option><option value="number_desc">الرقم تنازليًا</option><option value="number_asc">الرقم تصاعديًا</option><option value="closed_desc">الأحدث إغلاقًا</option><option value="employee_asc">الموظف</option></select></label></th></tr></thead><tbody>{page.rows.map(row => <tr key={row.id}><td><button type="button" className={css.documentLink} onClick={() => setSelected(row.id)}>#{row.shift_number}</button><small>{row.drawer_name}</small></td><td><strong>{row.employee_name}</strong><small>{row.drawer_name}</small></td><td>{financeDate(row.opened_at)}<small>{row.closed_at ? financeDate(row.closed_at) : "لم تغلق"}</small></td><td><strong><Numeric value={row.current_expected} money /></strong><small className={`${css.status} ${row.status === "closed" ? css.closed : row.status === "handover" || row.supervisor_paused ? css.paused : css.active}`}>{row.status === "closed" ? "مغلقة" : row.status === "handover" ? "بانتظار الاستلام" : row.supervisor_paused ? "موقوفة إداريًا" : "مفتوحة"}</small></td><td><strong><Numeric value={row.net_sales} money /></strong><small>الإجمالي <Numeric value={row.sales_total} money /></small></td><td><details className={css.rowMenu}><summary aria-label={`إجراءات الوردية ${row.shift_number}`}>•••</summary><div><button type="button" onClick={() => setSelected(row.id)}>عرض</button></div></details></td></tr>)}</tbody></table></div>)}
    <p className={css.hint}>صافي المبيعات حسب الفواتير والمرتجعات المنفذة في الوردية الصندوق هو جهة حفظ النقدية ويختلف عن جهاز الكاشير</p>
  </section>;
}
