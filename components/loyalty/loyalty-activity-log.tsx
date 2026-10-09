"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpLeft, Check, ChevronLeft, ChevronRight, CircleAlert, Clock3, CreditCard, Gift, History, LoaderCircle, RefreshCw, ScanLine, Search, SlidersHorizontal, Stamp, X } from "lucide-react";
import { loadLoyaltyActivityAction } from "@/app/actions/loyalty-activity";
import { defaultLoyaltyActivityFilters, type LoyaltyActivityEvent, type LoyaltyActivityFilters, type LoyaltyActivityKind, type LoyaltyActivityOutcome, type LoyaltyActivityPage, type LoyaltyActivityResult } from "@/lib/loyalty/activity-types";
import s from "./loyalty-activity-log.module.css";

type Props = { initialResult: LoyaltyActivityResult; initialFilters: LoyaltyActivityFilters };

const dateFormat = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
const numberFormat = new Intl.NumberFormat("ar-SA-u-nu-latn");
const kindLabels: Record<LoyaltyActivityKind, string> = { scan: "قراءة بطاقة", stamp: "إضافة ختم", redeem: "استبدال مكافأة", void: "إلغاء عملية" };
const outcomeLabels: Record<LoyaltyActivityOutcome, string> = { success: "ناجحة", denied: "مرفوضة", failed: "تعذّر تنفيذها", duplicate: "مكررة" };
const reasonLabels: Record<string, string> = {
  session_invalid: "انتهت جلسة الموظف أو لم تعد صالحة يلزم تسجيل الدخول مجددًا",
  invalid_code: "تعذرت قراءة رمز بطاقة صالح",
  program_disabled: "برنامج الولاء غير مفعّل وقت العملية",
  card_unavailable: "البطاقة غير متاحة لهذه العملية",
  reward_unavailable: "المكافأة غير متاحة للاستبدال",
  request_conflict: "تعارض الطلب مع عملية أخرى؛ لم يُنفّذ من جديد",
  operation_failed: "تعذر إتمام العملية يمكن إعادة المحاولة من الكاشير",
  request_replayed: "سبق تنفيذ هذا الطلب؛ لم تُحتسب العملية مرة أخرى",
  recent_scan: "سُجلت عملية حديثة للبطاقة؛ أُوقف التكرار خلال المدة المسموحة",
};

function dateLabel(value: string | null) {
  if (!value) return "غير مسجل";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "غير مسجل" : dateFormat.format(date);
}

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "غير مسجل" : timeFormat.format(date);
}

function rangeLabel(filters: LoyaltyActivityFilters) {
  return `${dateLabel(`${filters.from}T00:00:00+03:00`)} — ${dateLabel(`${filters.to}T00:00:00+03:00`)}`;
}

function count(value: number) { return numberFormat.format(value); }
function actorName(event: LoyaltyActivityEvent) { return event.actorName || (event.actorType === "owner" ? "مالك الحساب" : "الموظف غير مسجل"); }
function eventLabel(event: LoyaltyActivityEvent) { return event.kind === "scan" && event.rewardSuffix ? "قراءة مكافأة" : kindLabels[event.kind]; }

function EventIcon({ kind }: { kind: LoyaltyActivityKind }) {
  if (kind === "stamp") return <Stamp aria-hidden="true" />;
  if (kind === "redeem") return <Gift aria-hidden="true" />;
  if (kind === "void") return <History aria-hidden="true" />;
  return <ScanLine aria-hidden="true" />;
}

function Outcome({ outcome }: { outcome: LoyaltyActivityOutcome }) {
  return <span className={s.outcome} data-outcome={outcome}>{outcome === "success" ? <Check aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}{outcomeLabels[outcome]}</span>;
}

function eventSummary(event: LoyaltyActivityEvent) {
  if (event.outcome === "duplicate") return "تكرار طلب سابق؛ لم تُضف عملية جديدة";
  if (event.outcome === "denied") return "لم تُنفّذ العملية لعدم استيفاء شروطها";
  if (event.outcome === "failed") return "تعذر إتمام العملية";
  if (event.kind === "scan") return event.rewardSuffix ? "تمت قراءة المكافأة وعرض بياناتها للموظف" : "تمت قراءة البطاقة وعرض بياناتها للموظف";
  if (event.kind === "stamp") return event.rewardsDelta > 0 ? "أُضيف الختم واكتمل رصيد مكافأة جديدة" : "أُضيف الختم إلى بطاقة العميل";
  if (event.kind === "redeem") return "تم تسجيل استبدال المكافأة للعميل";
  return "تم تسجيل إلغاء العملية";
}

function EventDetails({ event, onClose }: { event: LoyaltyActivityEvent; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    closeRef.current?.focus();
    return () => { dialog?.close(); opener?.focus(); };
  }, []);

  const rewardKind = event.rewardKind === "product" ? "منتج" : event.rewardKind === "discount" ? "خصم" : event.rewardKind === "custom" ? "مكافأة خاصة" : "غير مسجل";
  const hasBalance = event.stampsBefore !== null || event.stampsAfter !== null;

  return <dialog ref={dialogRef} className={s.dialog} aria-labelledby="loyalty-event-title" aria-describedby="loyalty-event-description" onClose={onClose} dir="rtl">
    <div className={s.dialogHeading}>
      <div><span className={s.eyebrow}>تفاصيل العملية</span><h3 id="loyalty-event-title">{eventLabel(event)}</h3><p><time dateTime={event.occurredAt}>{dateLabel(event.occurredAt)}، {timeLabel(event.occurredAt)}</time> · بتوقيت الرياض</p></div>
      <button ref={closeRef} type="button" onClick={() => dialogRef.current?.close()} className={s.close} aria-label="إغلاق تفاصيل العملية"><X aria-hidden="true" /></button>
    </div>
    <div className={s.dialogOutcome}><Outcome outcome={event.outcome} />{event.origin === "historical" ? <span className={s.historyBadge}><History aria-hidden="true" />عملية سابقة</span> : null}<p id="loyalty-event-description">{eventSummary(event)}</p></div>
    <dl className={s.detailGrid}>
      <div><dt>الموظف المنفّذ</dt><dd>{actorName(event)}</dd></div>
      <div><dt>صفة المنفّذ</dt><dd>{event.actorType === "cashier" ? "موظف الكاشير" : event.actorType === "owner" ? "مالك الحساب" : "غير مسجلة"}</dd></div>
      <div><dt>العميل</dt><dd>{event.customerName || "غير مسجل"}</dd></div>
      <div><dt>نهاية رقم البطاقة</dt><dd>{event.cardSuffix ? <bdi>{event.cardSuffix}</bdi> : "غير مسجلة"}</dd></div>
      <div><dt>الأختام المضافة أو الملغاة</dt><dd><bdi>{event.stampsDelta > 0 ? "+" : ""}{count(event.stampsDelta)}</bdi></dd></div>
      <div><dt>تغيّر عدد المكافآت</dt><dd><bdi>{event.rewardsDelta > 0 ? "+" : ""}{count(event.rewardsDelta)}</bdi></dd></div>
    </dl>
    {hasBalance ? <div className={s.balance} aria-label="رصيد الأختام قبل العملية وبعدها"><div><span>الرصيد قبل العملية</span><strong>{event.stampsBefore === null ? "غير مسجل" : count(event.stampsBefore)}</strong></div><ArrowLeft aria-hidden="true" /><div><span>الرصيد بعد العملية</span><strong>{event.stampsAfter === null ? "غير مسجل" : count(event.stampsAfter)}</strong></div></div> : null}
    <dl className={`${s.detailGrid} ${s.rewardDetails}`}>
      {event.outcome !== "success" ? <div className={s.detailWide}><dt>سبب النتيجة</dt><dd>{event.reasonCode && reasonLabels[event.reasonCode] ? reasonLabels[event.reasonCode] : "لم تُسجّل تفاصيل إضافية لهذه العملية"}</dd></div> : null}
      {!hasBalance ? <div className={s.detailWide}><dt>رصيد الأختام قبل العملية وبعدها</dt><dd>غير مسجل لهذه العملية</dd></div> : null}
      <div><dt>المكافآت قبل العملية</dt><dd>{event.rewardsBefore === null ? "غير مسجل" : count(event.rewardsBefore)}</dd></div>
      <div><dt>المكافآت بعد العملية</dt><dd>{event.rewardsAfter === null ? "غير مسجل" : count(event.rewardsAfter)}</dd></div>
      {event.rewardName || event.rewardSuffix || event.kind === "redeem" ? <>
        <div><dt>المكافأة</dt><dd>{event.rewardName || "غير مسجلة"}</dd></div>
        <div><dt>نوع المكافأة</dt><dd>{rewardKind}{event.rewardDiscountPercent !== null ? ` · ${count(event.rewardDiscountPercent)}٪` : ""}</dd></div>
        <div><dt>نهاية مرجع المكافأة</dt><dd>{event.rewardSuffix ? <bdi>{event.rewardSuffix}</bdi> : "غير مسجلة"}</dd></div>
        <div><dt>انتهاء صلاحية المكافأة</dt><dd>{event.rewardExpiresAt ? `${dateLabel(event.rewardExpiresAt)}، ${timeLabel(event.rewardExpiresAt)}` : "غير مسجل"}</dd></div>
        <div className={s.detailWide}><dt>الشروط المسجلة للمكافأة</dt><dd>{event.rewardTerms || "لم تُسجل شروط لهذه العملية"}</dd></div>
      </> : null}
      <div><dt>مصدر السجل</dt><dd>{event.origin === "historical" ? "عملية سابقة من سجل الولاء" : "سجل العمليات التفصيلي"}</dd></div>
      <div><dt>وقت حفظ السجل</dt><dd>{dateLabel(event.recordedAt)}، {timeLabel(event.recordedAt)}</dd></div>
      <div className={s.detailWide}><dt>مرجع العملية</dt><dd><bdi>{event.id}</bdi></dd></div>
    </dl>
    <p className={s.dialogFoot}>{event.origin === "historical" ? "هذه عملية سابقة يظهر اسم الموظف المتاح في السجلات وقد يختلف عن اسمه وقت العملية الأرصدة غير المسجلة لا تُستنتج من الرصيد الحالي " : ""}تظهر نهاية رقم البطاقة فقط لحماية بيانات العميل جميع الأوقات بتوقيت الرياض</p>
  </dialog>;
}

export function LoyaltyActivityLog({ initialResult, initialFilters }: Props) {
  const [data, setData] = useState<LoyaltyActivityPage | null>(initialResult.ok ? initialResult.data : null);
  const [draft, setDraft] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialResult.ok ? "" : initialResult.message);
  const [selected, setSelected] = useState<LoyaltyActivityEvent | null>(null);
  const [showAllEmployees, setShowAllEmployees] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const requestId = useRef(0);
  const errorRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { requestId.current += 1; }, []);

  async function load(filters: LoyaltyActivityFilters, focusResults = false) {
    if (!filters.from || !filters.to || filters.from > filters.to) {
      setError("اختر فترة صحيحة؛ يجب أن يكون تاريخ البداية قبل تاريخ النهاية أو مساويًا له");
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const currentRequest = ++requestId.current;
    setPending(true);
    setError("");
    try {
      const result = await loadLoyaltyActivityAction(filters);
      if (currentRequest !== requestId.current) return;
      if (!result.ok) {
        setError(result.message);
        requestAnimationFrame(() => errorRef.current?.focus());
        return;
      }
      setData(result.data);
      setApplied({ ...filters, page: result.data.page });
      setUpdatedAt(new Date().toISOString());
      if (focusResults) requestAnimationFrame(() => resultsRef.current?.focus());
    } catch {
      if (currentRequest !== requestId.current) return;
      setError("تعذر تحميل سجل العمليات تحقق من الاتصال وأعد المحاولة");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      if (currentRequest === requestId.current) setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load({ ...draft, search: draft.search.trim(), page: 1 }, true);
  }

  function resetFilters() {
    const filters = defaultLoyaltyActivityFilters();
    setDraft(filters);
    void load(filters, true);
  }

  function selectEmployee(id: string) {
    const filters = { ...draft, cashierId: applied.cashierId === id ? "" : id, page: 1 };
    setDraft(filters);
    void load(filters, true);
  }

  const employees = data?.employees ?? [];
  const visibleEmployees = showAllEmployees ? employees : employees.slice(0, 6);
  const summary = data?.summary;
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const firstRow = data?.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastRow = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const hasExtraFilters = Boolean(applied.cashierId || applied.kind || applied.outcome || applied.search);

  return <section className={s.root} dir="rtl" aria-labelledby="loyalty-activity-title">
    <header className={s.header}>
      <div><span className={s.eyebrow}>متابعة فريق العمل</span><h2 id="loyalty-activity-title">كل عملية بتفاصيلها</h2><p>من قراءة البطاقة إلى استبدال المكافأة تابع كل خطوة اعرف من نفّذ العملية ولمن ومتى</p></div>
      <button type="button" className={s.refresh} onClick={() => void load(applied)} disabled={pending}><RefreshCw aria-hidden="true" className={pending ? s.spinner : undefined} />{pending ? "جارٍ التحديث" : "تحديث السجل"}</button>
    </header>
    <p className={s.coverage}>{data?.recordingStartedAt ? <>تُسجّل قراءات البطاقات والمكافآت والمحاولات منذ {dateLabel(data.recordingStartedAt)} {timeLabel(data.recordingStartedAt)} بتوقيت الرياض العمليات السابقة تعرض تفاصيل الأختام والمكافآت المتاحة</> : "تظهر الأختام والمكافآت المسجلة سابقًا تظهر القراءات والمحاولات بعد بدء التسجيل التفصيلي؛ لا تتوفر لها سجلات سابقة"}</p>

    {summary ? <>
      <div className={s.metrics} aria-label="إجماليات جميع العمليات المطابقة للفلاتر">
        <div className={s.metric}><span className={s.metricLabel}><ScanLine aria-hidden="true" />قراءات ناجحة</span><strong className={s.metricValue}>{count(summary.scans)}</strong><span className={s.metricNote}>بطاقات ومكافآت خلال الفترة</span></div>
        <div className={s.metric}><span className={s.metricLabel}><Stamp aria-hidden="true" />الأختام المضافة</span><strong className={s.metricValue}>{count(summary.stamps)}</strong><span className={s.metricNote}>{count(summary.rewardsIssued)} مكافأة صدرت</span></div>
        <div className={s.metric} data-tone="success"><span className={s.metricLabel}><Gift aria-hidden="true" />المكافآت المستبدلة</span><strong className={s.metricValue}>{count(summary.redemptions)}</strong><span className={s.metricNote}>عمليات استبدال ناجحة</span></div>
        <div className={s.metric}><span className={s.metricLabel}><CreditCard aria-hidden="true" />البطاقات المختلفة</span><strong className={s.metricValue}>{count(summary.uniqueCards)}</strong><span className={s.metricNote}>{count(summary.activeCashiers)} موظفًا لديهم عمليات</span></div>
      </div>
      <div className={s.summaryFoot}><span>{rangeLabel(applied)}</span><span>{count(summary.denied)} مرفوضة · {count(summary.failed)} تعذّر تنفيذها · {count(summary.duplicates)} مكررة</span></div>
    </> : null}

    {data ? <section className={s.team} aria-labelledby="loyalty-team-title">
      <div className={s.sectionHeading}><h3 id="loyalty-team-title">نشاط الموظفين</h3><p>يتبع الفترة والفلاتر العامة · اختر موظفًا لعرض عملياته</p></div>
      {employees.length ? <div className={s.employees}>{visibleEmployees.map((employee) => <button key={employee.id} type="button" className={s.employeeCard} aria-pressed={applied.cashierId === employee.id} disabled={pending} onClick={() => selectEmployee(employee.id)}>
        <span className={s.employeeIdentity}><span className={s.avatar} aria-hidden="true">{Array.from(employee.name.trim())[0] || "—"}</span><span><span className={s.employeeName}>{employee.name}</span><span className={s.employeeSubtitle}>{employee.active ? "موظف كاشير" : "حساب غير نشط"}{applied.cashierId === employee.id ? " · محدد حاليًا" : ""}</span></span></span>
        <span className={s.employeeStats}><span><strong>{count(employee.scans)}</strong>قراءة ناجحة</span><span><strong>{count(employee.stamps)}</strong>ختم</span><span><strong>{count(employee.redemptions)}</strong>استبدال</span></span>
        <span className={s.employeeFoot}>{employee.lastActivityAt ? `آخر عملية: ${dateLabel(employee.lastActivityAt)} ${timeLabel(employee.lastActivityAt)}` : "لا توجد عمليات خلال الفترة المحددة"}</span>
        {employee.denied || employee.failed || employee.duplicates ? <span className={s.employeeFoot}>{count(employee.denied)} مرفوضة · {count(employee.failed)} متعذرة · {count(employee.duplicates)} مكررة</span> : null}
      </button>)}</div> : <p className={s.teamEmpty}>لا يوجد موظفون متاحون لعرض ملخص نشاطهم</p>}
      {employees.length > 6 ? <button type="button" className={s.clearButton} aria-expanded={showAllEmployees} onClick={() => setShowAllEmployees(!showAllEmployees)}>{showAllEmployees ? "عرض أقل" : `عرض جميع الموظفين (${count(employees.length)})`}</button> : null}
    </section> : null}

    <form className={s.filters} onSubmit={submit} aria-label="تصفية سجل العمليات">
      <div className={s.filterHeading}><SlidersHorizontal aria-hidden="true" />ابحث في السجل</div>
      <div className={s.filterGrid}>
        <label className={s.field}><span>العميل أو نهاية رقم البطاقة</span><input type="search" maxLength={80} placeholder="اسم العميل أو آخر أرقام البطاقة" value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} /></label>
        <label className={s.field}><span>الموظف</span><select value={draft.cashierId} onChange={(event) => setDraft({ ...draft, cashierId: event.target.value })}><option value="">جميع الموظفين</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.active ? "" : " — غير نشط"}</option>)}</select></label>
        <label className={s.field}><span>نوع العملية</span><select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as LoyaltyActivityFilters["kind"] })}><option value="">جميع العمليات</option>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{value === "scan" ? "قراءة بطاقة أو مكافأة" : label}</option>)}</select></label>
        <label className={s.field}><span>نتيجة العملية</span><select value={draft.outcome} onChange={(event) => setDraft({ ...draft, outcome: event.target.value as LoyaltyActivityFilters["outcome"] })}><option value="">جميع النتائج</option>{Object.entries(outcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className={s.field}><span>من تاريخ</span><input type="date" required value={draft.from} max={draft.to || undefined} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
        <label className={s.field}><span>إلى تاريخ</span><input type="date" required value={draft.to} min={draft.from || undefined} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
      </div>
      <div className={s.filterActions}><button type="submit" className={s.primary} disabled={pending}>{pending ? <LoaderCircle aria-hidden="true" className={s.spinner} /> : <Search aria-hidden="true" />}عرض النتائج</button><button type="button" className={s.clearButton} onClick={resetFilters} disabled={pending}>إعادة ضبط الفلاتر</button><p className={s.filterHint}>الفترة الافتراضية: آخر ٣٠ يومًا · الأرقام تشمل كل النتائج المطابقة</p></div>
    </form>

    {error ? <div ref={errorRef} className={s.error} role="alert" tabIndex={-1}><CircleAlert aria-hidden="true" /><p>{error}{data ? " تبقى النتائج السابقة معروضة إلى أن ينجح التحديث" : ""}</p></div> : null}

    <div ref={resultsRef} className={s.results} tabIndex={-1} aria-busy={pending} aria-labelledby="loyalty-results-title">
      <div className={s.resultsHeading}><div><h3 id="loyalty-results-title">سجل العمليات</h3><p aria-live="polite">{pending ? "جارٍ تحميل العمليات…" : data ? `${count(data.total)} عملية · ${rangeLabel(applied)}${applied.cashierId ? ` · ${employees.find((employee) => employee.id === applied.cashierId)?.name || "الموظف المحدد"}` : ""}` : "السجل غير متاح حاليًا"}</p></div><span className={s.timezone}><Clock3 aria-hidden="true" />جميع الأوقات بتوقيت الرياض</span></div>
      {!data ? pending ? <div className={s.loading} role="status"><LoaderCircle aria-hidden="true" />جارٍ تحميل سجل العمليات</div> : <div className={s.empty}><CircleAlert aria-hidden="true" /><h3>تعذر عرض السجل</h3><p>أعد المحاولة لتحميل العمليات وملخصات الموظفين</p><button type="button" className={s.secondary} onClick={() => void load(applied)}>إعادة المحاولة</button></div> : data.events.length ? <>
        <div className={s.tableWrap}><table className={s.table}><caption className={s.srOnly}>عمليات الولاء مرتبة من الأحدث إلى الأقدم؛ كل الأوقات بتوقيت الرياض</caption><thead><tr><th scope="col">العملية</th><th scope="col">الموظف</th><th scope="col">العميل والبطاقة</th><th scope="col">التاريخ والوقت</th><th scope="col">النتيجة</th><th scope="col"><span className={s.srOnly}>التفاصيل</span></th></tr></thead><tbody>{data.events.map((event) => <tr key={event.id}>
          <td><span className={s.eventType}><EventIcon kind={event.kind} />{eventLabel(event)}</span><span className={s.cellSub}>{event.kind === "redeem" ? event.rewardName || "المكافأة المسجلة" : event.kind === "stamp" && event.outcome === "success" ? `${count(event.stampsDelta)} ختم${event.rewardsDelta > 0 ? " · صدرت مكافأة" : ""}` : event.origin === "historical" ? "من السجل السابق" : "سجل تفصيلي"}</span></td>
          <td><span className={s.cellTitle}>{actorName(event)}</span><span className={s.cellSub}>{event.actorType === "owner" ? "مالك الحساب" : event.actorType === "cashier" ? "موظف الكاشير" : "الصفة غير مسجلة"}</span></td>
          <td><span className={s.cellTitle}>{event.customerName || "عميل غير محدد"}</span><span className={s.cellSub}>{event.cardSuffix ? <>بطاقة تنتهي بـ <bdi>{event.cardSuffix}</bdi></> : "البطاقة غير محددة"}</span></td>
          <td><time dateTime={event.occurredAt} className={s.date}>{dateLabel(event.occurredAt)}<span className={s.cellSub}>{timeLabel(event.occurredAt)}</span></time></td>
          <td><Outcome outcome={event.outcome} /></td>
          <td><button type="button" className={s.detailsButton} onClick={() => setSelected(event)} aria-label={`تفاصيل ${eventLabel(event)} بواسطة ${actorName(event)} في ${timeLabel(event.occurredAt)}`}>التفاصيل<ArrowUpLeft aria-hidden="true" /></button></td>
        </tr>)}</tbody></table></div>
        <div className={s.mobileEvents}>{data.events.map((event) => <article key={event.id} className={s.mobileEvent}>
          <div className={s.mobileEventHeader}><div><span className={s.eventType}><EventIcon kind={event.kind} />{eventLabel(event)}</span>{event.rewardName ? <span className={s.cellSub}>{event.rewardName}</span> : null}</div><Outcome outcome={event.outcome} /></div>
          <dl className={s.mobileEventInfo}><div><dt>الموظف</dt><dd>{actorName(event)}</dd></div><div><dt>العميل</dt><dd>{event.customerName || "غير محدد"}</dd></div><div><dt>نهاية رقم البطاقة</dt><dd>{event.cardSuffix ? <bdi>{event.cardSuffix}</bdi> : "غير محددة"}</dd></div><div><dt>التاريخ</dt><dd>{dateLabel(event.occurredAt)}</dd></div></dl>
          <div className={s.mobileEventFooter}><time dateTime={event.occurredAt}>{timeLabel(event.occurredAt)}</time><button type="button" className={s.detailsButton} onClick={() => setSelected(event)} aria-label={`تفاصيل ${eventLabel(event)} بواسطة ${actorName(event)}`}>تفاصيل العملية<ArrowUpLeft aria-hidden="true" /></button></div>
        </article>)}</div>
      </> : <div className={s.empty}><History aria-hidden="true" /><h3>{hasExtraFilters ? "لا توجد عمليات تطابق بحثك" : "لا توجد عمليات في هذه الفترة"}</h3><p>{hasExtraFilters ? "جرّب موظفًا آخر أو وسّع الفترة وأزل بعض الفلاتر للوصول إلى العملية" : "عندما تُقرأ بطاقة أو يُضاف ختم أو تُستبدل مكافأة تظهر العملية هنا مع اسم الموظف ووقتها"}</p><button type="button" className={s.secondary} onClick={resetFilters} disabled={pending}>عرض آخر ٣٠ يومًا</button></div>}
      {data && data.total > 0 ? <nav className={s.pagination} aria-label="صفحات سجل العمليات"><p>عرض {count(firstRow)}–{count(lastRow)} من {count(data.total)} عملية</p><div className={s.paginationButtons}><button type="button" className={s.secondary} disabled={pending || data.page <= 1} onClick={() => void load({ ...applied, page: data.page - 1 }, true)}><ChevronRight aria-hidden="true" />السابق</button><span className={s.pageNumber}>صفحة {count(data.page)} من {count(pageCount)}</span><button type="button" className={s.secondary} disabled={pending || data.page >= pageCount} onClick={() => void load({ ...applied, page: data.page + 1 }, true)}>التالي<ChevronLeft aria-hidden="true" /></button></div></nav> : null}
      {updatedAt ? <p className={s.updated}>آخر تحديث للعرض: {dateLabel(updatedAt)} {timeLabel(updatedAt)} بتوقيت الرياض</p> : null}
    </div>
    {selected ? <EventDetails event={selected} onClose={() => setSelected(null)} /> : null}
  </section>;
}
