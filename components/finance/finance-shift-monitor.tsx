"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, RefreshCw, Search, Pause, Play, Square } from "lucide-react";
import { Modal } from "@/components/dashboard/ui/modal";
import { fetchFinanceShiftMonitorAction, superviseFinanceShiftAction } from "@/app/actions/finance-shift-monitor";
import { executeBrandFinanceAction } from "@/app/actions/brand-finance";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { MonitoredShift, ShiftMonitorPage } from "@/lib/finance/shift-monitor";
import { FinanceCashHandoverForm } from "./finance-cash-handover-form";
import { FinanceShiftAnalytics } from "./finance-shift-analytics";
import { Empty, financeDate, Numeric, Panel } from "./finance-ui";
import styles from "./finance.module.css";
import css from "./finance-shift-monitor.module.css";

const statusNames = { active: "شغالة", stalled: "المزامنة متوقفة", paused: "موقوفة إداريًا", closed: "منتهية" };
const actionNames = { pause: "إيقاف البيع مؤقتًا", resume: "استئناف البيع", close: "إقفال إداري" };
function Status({ shift }: { shift: MonitoredShift }) {
  return <span className={`${css.status} ${css[shift.monitor_status]}`}><span aria-hidden="true" />{statusNames[shift.monitor_status]}</span>;
}
export function FinanceShiftMonitor({ snapshot, slug, onChanged }: { snapshot: FinanceSnapshot; slug?: string; onChanged: () => void }) {
  const [page, setPage] = useState<ShiftMonitorPage | null>(null);
  const [detail, setDetail] = useState<ShiftMonitorPage | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<"analytics" | "operations">("analytics");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [action, setAction] = useState<"pause" | "resume" | "close" | null>(null);
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const retry = useRef<{ fingerprint: string; requestId: string } | null>(null);
  useEffect(() => {
    let active = true, busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const [list, details] = await Promise.all([
          fetchFinanceShiftMonitorAction({ offset, query, from, to }, slug),
          selected ? fetchFinanceShiftMonitorAction({ offset: 0, query: "", from: "", to: "", shiftId: selected }, slug) : null,
        ]);
        if (!active) return;
        if (!list.ok) { setError(list.message); return; }
        setPage(list.data); setError("");
        if (details) { if (details.ok) setDetail(details.data); else { setDetail(null); setError(details.message); } }
      } catch { if (active) setError("تعذر تحديث سجل الورديات أعد المحاولة"); }
      finally { busy = false; if (active) setLoading(false); }
    }
    const start = setTimeout(() => void load(), 250);
    const timer = setInterval(() => void load(), 15_000);
    return () => { active = false; clearTimeout(start); clearInterval(timer); };
  }, [slug, offset, query, from, to, selected, revision]);
  const shift = detail?.rows.find(row => row.id === selected);
  function open(row: MonitoredShift) {
    setDetailView("analytics");
    setSelected(row.id); setDetail(null); setAction(null); setReason(""); setAcknowledged(false); setActionError(""); setSuccess("");
  }
  async function execute(payload: Record<string, unknown> = {}) {
    if (lock.current || !shift || !action) return false;
    if (reason.trim().length < 3) { setActionError("اكتب سبب الإجراء بثلاثة أحرف على الأقل"); return false; }
    if (action === "close" && !acknowledged) { setActionError("أكد مراجعة حالة الجهاز والفواتير المحلية قبل الإقفال"); return false; }
    lock.current = true; setSaving(true); setActionError("");
    try {
      const data = { ...payload, shiftId: shift.id, reason: reason.trim(), supervisorClose: true, acknowledgeOffline: acknowledged };
      const fingerprint = JSON.stringify({ action, data });
      if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, requestId: crypto.randomUUID() };
      const result = action === "close"
        ? await executeBrandFinanceAction({ operation: "shift_close", payload: data, requestId: retry.current.requestId }, slug)
        : await superviseFinanceShiftAction({ shiftId: shift.id, action, reason: reason.trim(), requestId: retry.current.requestId }, slug);
      if (!result.ok) { setActionError(result.message); return false; }
      retry.current = null; setAction(null); setSuccess("تم تنفيذ الإجراء وتسجيله في سجل الوردية"); setRevision(v => v + 1); onChanged(); return true;
    } catch { setActionError("تعذر تأكيد نتيجة الإجراء أعد المحاولة بنفس البيانات لمنع التكرار"); return false; }
    finally { lock.current = false; setSaving(false); }
  }
  const filterChanged = () => { setOffset(0); setLoading(true); };
  return <>
    <div className={styles.toolbar}>
      <label className={styles.searchBox}><Search size={18} /><input aria-label="البحث في الورديات" className={styles.search} placeholder="رقم الوردية أو اسم الموظف أو الصندوق" maxLength={120} value={query} onChange={event => { setQuery(event.target.value); filterChanged(); }} /></label>
      <div className={styles.actions}><label className={styles.field}>من<input type="date" value={from} onChange={event => { setFrom(event.target.value); filterChanged(); }} /></label><label className={styles.field}>إلى<input type="date" min={from} value={to} onChange={event => { setTo(event.target.value); filterChanged(); }} /></label><button className={styles.secondary} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16} />تحديث</button></div>
    </div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    <Panel title={`سجل الورديات${page ? ` · ${page.total}` : ""}`} action={<span className={styles.muted}>يتحدث تلقائيًا كل ١٥ ثانية</span>}>
      <div className={css.legend}><span className={css.green}>شغالة</span><span className={css.yellow}>مزامنة متوقفة أو إيقاف إداري</span><span className={css.red}>منتهية</span></div>
      {loading ? <p className={styles.muted} role="status">جار تحميل الورديات</p> : !page?.rows.length ? <Empty title="لا توجد ورديات مطابقة" /> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>الوردية</th><th>الموظف والصندوق</th><th>بداية الوردية</th><th>الحالة</th><th>آخر اتصال</th><th>فواتير معلقة</th><th>الإقفال</th><th>الإجراء</th></tr></thead><tbody>{page.rows.map(row => <tr key={row.id} className={css.row} onClick={() => open(row)}>
        <td><button type="button" className={css.shiftLink} onClick={event => { event.stopPropagation(); open(row); }} aria-label={`فتح الوردية رقم ${row.shift_number}`}>#{row.shift_number}</button></td>
        <td><strong>{row.employee_name}</strong><div className={styles.muted}>{row.drawer_name}</div></td><td>{financeDate(row.opened_at)}</td>
        <td><Status shift={row} />{row.status === "handover" && <div className={styles.muted}>بانتظار الاستلام</div>}</td><td>{row.last_seen_at ? financeDate(row.last_seen_at) : "لم يصل تحديث من الجهاز"}</td><td><Numeric value={row.pending_count} />{row.conflict_count > 0 && <div className={styles.negative}>تحتاج مراجعة: {row.conflict_count}</div>}</td><td>{financeDate(row.closed_at)}</td><td><button className={styles.secondary} onClick={event => { event.stopPropagation(); open(row); }}>فتح الوردية<ChevronLeft size={16} /></button></td>
      </tr>)}</tbody></table></div>}
      <div className={css.footer}><span className={styles.muted}>يتوقف مؤشر المزامنة بعد ٩٠ ثانية دون تحديث من الجهاز</span><div className={styles.actions}><button className={styles.secondary} disabled={!offset || loading} onClick={() => { setOffset(v => Math.max(0, v - 50)); setLoading(true); }}>السابق</button><span>{Math.floor(offset / 50) + 1}</span><button className={styles.secondary} disabled={!page || offset + page.rows.length >= page.total || loading} onClick={() => { setOffset(v => v + 50); setLoading(true); }}>التالي</button></div></div>
    </Panel>
    {selected && <Modal open title={`الوردية رقم ${shift?.shift_number ?? "…"}`} onClose={() => { if (!saving) setSelected(null); }}>
      {!shift ? <p role="status">{error || "جار تحميل تفاصيل الوردية"}</p> : <div className={css.detail}>
        <div className={css.identity}><div><strong>{shift.employee_name}</strong><p>{shift.drawer_name}</p></div><Status shift={shift} /></div>
        <div className={css.detailTabs} role="group" aria-label="عرض تفاصيل الوردية"><button type="button" disabled={saving} aria-pressed={detailView === "analytics"} onClick={() => setDetailView("analytics")}>تحليل الوردية</button><button type="button" disabled={saving} aria-pressed={detailView === "operations"} onClick={() => setDetailView("operations")}>الصندوق والإجراءات</button></div>
        {detailView === "analytics" ? <FinanceShiftAnalytics key={shift.id} shiftId={shift.id} slug={slug} /> : <>
        <div className={css.facts}><div>البداية<strong>{financeDate(shift.opened_at)}</strong></div><div>الإقفال<strong>{financeDate(shift.closed_at)}</strong></div><div>النقدية المتوقعة<strong><Numeric value={shift.current_expected} money /></strong></div><div>النقدية المعدودة<strong>{shift.counted_cash == null ? "لم تسجل" : <Numeric value={shift.counted_cash} money />}</strong></div><div>فرق الإقفال<strong>{shift.variance == null ? "—" : <Numeric value={shift.variance} money />}</strong></div><div>آخر اتصال<strong>{shift.last_seen_at ? financeDate(shift.last_seen_at) : "لم يصل تحديث"}</strong></div></div>
        {shift.note && <p className={styles.notice}>{shift.note}</p>}
        <p className={styles.muted}>الفواتير المعلقة حسب آخر تحديث: {shift.pending_count} · تحتاج مراجعة: {shift.conflict_count}</p>
        {success && <div className={styles.success} role="status">{success}</div>}
        {shift.status !== "closed" && !action && <div className={styles.actions}>
          {shift.status === "open" && <button className={styles.secondary} onClick={() => { setAction(shift.supervisor_paused ? "resume" : "pause"); setActionError(""); }}>{shift.supervisor_paused ? <Play size={16} /> : <Pause size={16} />}{shift.supervisor_paused ? "استئناف البيع" : "إيقاف البيع مؤقتًا"}</button>}
          <button className={styles.danger} onClick={() => { setAction("close"); setActionError(""); }}><Square size={16} />إقفال إداري</button>
        </div>}
        {action && <section className={css.procedure}>
          <h3>{actionNames[action]}</h3>
          <p className={styles.notice}>{action === "close" ? "الإقفال نهائي ويتطلب عد النقدية وتحديد جهة تسليمها الفواتير غير المتزامنة تبقى على جهاز الموظف للمراجعة ولا تدخل تلقائيًا في وردية مقفلة" : "يصل الإجراء إلى جهاز الكاشير عند اتصاله الجهاز المنقطع لا يستقبل التغيير فورًا والفواتير المحفوظة تبقى على الجهاز"}</p>
          <label className={styles.field}>سبب الإجراء<textarea required minLength={3} maxLength={1000} value={reason} disabled={saving} onChange={event => setReason(event.target.value)} /></label>
          {actionError && <p className={styles.error} role="alert">{actionError}</p>}
          {action === "close" ? <><label className={css.confirm}><input type="checkbox" checked={acknowledged} disabled={saving} onChange={event => setAcknowledged(event.target.checked)} />راجعت حالة الجهاز والفواتير المحلية وأتحمل مسؤولية الإقفال الإداري</label><FinanceCashHandoverForm form={{ operation: "shift_close", title: "إقفال إداري", values: { shiftId: shift.id } }} snapshot={{ ...snapshot, shifts: [shift] }} pending={saving} error="" onCancel={() => setAction(null)} onSubmit={(_operation, payload) => execute(payload)} /></> : <div className={styles.actions}><button className={styles.primary} disabled={saving || reason.trim().length < 3} onClick={() => void execute()}>{saving ? "جار الحفظ" : "تأكيد الإجراء"}</button><button className={styles.secondary} disabled={saving} onClick={() => setAction(null)}>إلغاء</button></div>}
        </section>}
        <section><h3>سجل الإجراءات الرقابية</h3>{!detail?.actions.length ? <p className={styles.muted}>لا توجد إجراءات رقابية مسجلة</p> : detail.actions.map(item => <div key={item.id} className={css.audit}><strong>{actionNames[item.action]} · {item.actor_name}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "medium" })}</time><p>{item.reason}</p></div>)}</section>
        </>}
      </div>}
    </Modal>}
  </>;
}
