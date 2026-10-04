"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpLeft, Check, ChevronLeft, ChevronRight, CircleAlert, CreditCard, Gift, History, Layers3, RefreshCw, ScanLine, Search, ShieldCheck, Sparkles, Stamp, Users, X } from "lucide-react";
import { loadBrandCustomerDetailAction, loadBrandCustomersAction } from "@/app/actions/brand-customers";
import type { BrandCustomer, BrandCustomerBrand, BrandCustomerDetail, BrandCustomerEvent, BrandCustomerFilters, BrandCustomerResult, BrandCustomerSegment, BrandCustomersPage } from "@/lib/admin/brand-customer-types";
import s from "./brand-customers.module.css";

const numbers = new Intl.NumberFormat("ar-SA-u-nu-latn");
const dates = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", year: "numeric", month: "short", day: "numeric" });
const times = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
const segments: Array<[BrandCustomerSegment, string]> = [["all", "جميع العملاء"], ["shared", "مشتركون بين العلامات"], ["frequent", "الأكثر ولاءً"], ["rewarded", "حصلوا على مكافآت"], ["expired", "مكافآت انتهت"]];
const eventLabels: Record<BrandCustomerEvent["kind"], string> = { joined: "انضمام العميل", card_issued: "إصدار بطاقة الولاء", download: "تحميل بطاقة آبل", save_link: "طلب حفظ بطاقة قوقل", installed: "تثبيت البطاقة في محفظة آبل", unregistered: "إلغاء تسجيل البطاقة من الجهاز", scan: "قراءة البطاقة أو المكافأة", stamp: "إضافة ختم", redeem: "صرف مكافأة", void: "إلغاء عملية", reward_earned: "اكتساب مكافأة", reward_expired: "انتهاء صلاحية مكافأة دون صرف" };
const outcomeLabels: Record<BrandCustomerEvent["outcome"], string> = { success: "ناجحة", denied: "مرفوضة", failed: "تعذر تنفيذها", duplicate: "تكرار دون احتساب" };
const reasonLabels: Record<string, string> = { recent_scan: "قراءة حديثة؛ لم يُضف ختم آخر", request_replayed: "طلب سبق تنفيذه", card_unavailable: "البطاقة غير متاحة", reward_unavailable: "المكافأة غير متاحة للصرف", program_disabled: "برنامج الولاء متوقف", operation_failed: "تعذر إتمام العملية", session_invalid: "جلسة الموظف غير صالحة", request_conflict: "تعارض مع عملية أخرى" };
function n(value: number) { return numbers.format(value); }
function date(value: string | null) { return value && Number.isFinite(Date.parse(value)) ? dates.format(new Date(value)) : "غير مسجل"; }
function time(value: string | null) { return value && Number.isFinite(Date.parse(value)) ? times.format(new Date(value)) : ""; }
function DateTime({ value }: { value: string | null }) { return value ? <time dateTime={value}>{date(value)}<span className={s.smallLine}>{time(value)}</span></time> : <span className={s.muted}>غير مسجل</span>; }

function CustomerBadges({ customer }: { customer: BrandCustomer }) {
  return <div className={s.badges}>
    {customer.sharedBrands.length > 1 ? <span className={s.badge} data-tone="shared"><Layers3 aria-hidden="true" />مشترك في {n(customer.sharedBrands.length)} علامات</span> : null}
    {customer.isFrequent ? <span className={s.badge} data-tone="gold"><Sparkles aria-hidden="true" />عميل مميز</span> : null}
    {customer.status !== "active" ? <span className={s.badge} data-tone="red">{customer.status === "blocked" ? "محظور" : "موقوف"}</span> : null}
  </div>;
}

function Pagination({ page, total, size, pending, onPage }: { page: number; total: number; size: number; pending: boolean; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <div className={s.pager}>
    <button type="button" className={s.iconButton} disabled={pending || page <= 1} onClick={() => onPage(page - 1)} aria-label="الصفحة السابقة"><ChevronRight aria-hidden="true" /></button>
    <span>صفحة {n(page)} من {n(pages)}</span>
    <button type="button" className={s.iconButton} disabled={pending || page >= pages} onClick={() => onPage(page + 1)} aria-label="الصفحة التالية"><ChevronLeft aria-hidden="true" /></button>
  </div>;
}

function Event({ event }: { event: BrandCustomerEvent }) {
  const Icon = event.kind === "stamp" ? Stamp : event.kind.startsWith("reward") || event.kind === "redeem" ? Gift : event.kind === "scan" ? ScanLine : CreditCard;
  return <li className={s.event}>
    <span className={s.eventIcon}><Icon aria-hidden="true" /></span>
    <div><strong>{eventLabels[event.kind]}</strong>
      <div className={s.badges}><span className={s.badge} data-tone={event.outcome === "success" ? "green" : event.outcome === "duplicate" ? "gold" : "red"}>{outcomeLabels[event.outcome]}</span>{event.origin === "historical" ? <span className={s.badge}><History aria-hidden="true" />سجل سابق</span> : null}</div>
      {event.actorName ? <p>الموظف: {event.actorName}</p> : null}
      {event.rewardName ? <p>المكافأة: {event.rewardName}{event.rewardExpiresAt ? ` · تنتهي ${date(event.rewardExpiresAt)}` : ""}</p> : null}
      {event.stampsDelta !== 0 || event.stampsAfter !== null ? <p>{event.stampsDelta !== 0 ? `تغيّر الأختام: ${event.stampsDelta > 0 ? "+" : ""}${n(event.stampsDelta)}` : ""}{event.stampsAfter !== null ? ` · الرصيد بعد العملية: ${n(event.stampsAfter)}` : ""}</p> : null}
      {event.reasonCode && reasonLabels[event.reasonCode] ? <p>{reasonLabels[event.reasonCode]}</p> : null}
    </div>
    <DateTime value={event.occurredAt} />
  </li>;
}

function CustomerDialog({ selected, detail, pending, error, onClose, onLoad, onSelect }: { selected: BrandCustomer; detail: BrandCustomerDetail | null; pending: boolean; error: string; onClose: () => void; onLoad: (page: number) => void; onSelect: (customer: BrandCustomer) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const customer = detail?.customer ?? selected;
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    closeRef.current?.focus();
    return () => { dialog?.close(); opener?.focus(); };
  }, []);

  return <dialog ref={dialogRef} className={s.dialog} dir="rtl" aria-labelledby="brand-customer-title" aria-describedby="brand-customer-description" onClose={onClose}>
    <div className={s.dialogHead}>
      <div><span className={s.eyebrow}>ملف العميل · {customer.brand.name}</span><h2 id="brand-customer-title">{customer.name || "عميل بدون اسم"}</h2><p id="brand-customer-description">بيانات التسجيل وعلاقة العميل بالعلامات وسجل عملياته بتوقيت الرياض</p><CustomerBadges customer={customer} /></div>
      <button ref={closeRef} type="button" className={s.iconButton} onClick={() => dialogRef.current?.close()} aria-label="إغلاق ملف العميل"><X aria-hidden="true" /></button>
    </div>
    <div className={s.dialogBody} aria-busy={pending}>
      {error ? <div role="alert" className={s.error}><CircleAlert aria-hidden="true" /><span>{error}</span><button type="button" className={s.button} onClick={() => onLoad(detail?.page ?? 1)} disabled={pending}>إعادة المحاولة</button></div> : null}
      <dl className={s.detailGrid}>
        <div><dt>رقم الجوال</dt><dd><bdi>{customer.phone || "غير مسجل"}</bdi></dd></div>
        <div><dt>البريد الإلكتروني</dt><dd><bdi>{customer.email || "غير مسجل"}</bdi></dd></div>
        <div><dt>التسجيل لدى العلامة</dt><dd><DateTime value={customer.joinedAt} /></dd></div>
        <div><dt>إصدار بطاقة الولاء</dt><dd><DateTime value={customer.cardIssuedAt} /></dd></div>
        <div><dt>أول تحميل مسجل لبطاقة آبل</dt><dd><DateTime value={customer.firstDownloadAt} /></dd></div>
        <div><dt>أول تثبيت مسجل في محفظة آبل</dt><dd><DateTime value={customer.firstInstalledAt} /></dd></div>
        <div><dt>عدد مرات تحميل بطاقة آبل</dt><dd>{n(customer.downloadCount)}</dd></div>
        <div><dt>أجهزة آبل المسجلة حاليًا</dt><dd>{n(customer.installedDeviceCount)}</dd></div>
        <div><dt>نهاية رقم البطاقة</dt><dd><bdi>{customer.cardSuffix || (customer.cardId ? "غير متاح" : "لا توجد بطاقة")}</bdi></dd></div>
      </dl>
      <div className={s.sectionHeader}><div><h2>عضويات العميل</h2><p>افتح أي عضوية للاطلاع على سجل العميل لدى تلك العلامة</p></div></div>
      <div className={s.membershipList}>
        {(detail?.memberships ?? [customer]).map((membership) => <article key={membership.id} className={s.membership}>
          <div className={s.brandTop}><h3>{membership.brand.name}</h3>{membership.id === customer.id ? <span className={s.badge} data-tone="gold">العضوية المفتوحة</span> : null}</div>
          <div className={s.membershipCounts}><div><strong>{n(membership.stamps)}</strong><span>ختم مكتسب</span></div><div><strong>{n(membership.rewardsRedeemed)}</strong><span>مكافأة مصروفة</span></div><div><strong>{n(membership.rewardsExpired)}</strong><span>انتهت دون صرف</span></div></div>
          <p>الأختام الحالية: {n(membership.stampsInCycle)} من {n(membership.stampTarget)} · المكافآت المتاحة: {n(membership.rewardsAvailable)}</p>
          <p>قراءات مسجلة: {n(membership.scans)} · عمليات ختم: {n(membership.stampTransactions)}</p>
          <p>المكافآت المكتسبة: {n(membership.rewardsEarned)} · انضم في {date(membership.joinedAt)}</p>
          {membership.id !== customer.id ? <button type="button" className={s.rowButton} disabled={pending} onClick={() => onSelect(membership)}>فتح سجل العضوية<ArrowUpLeft aria-hidden="true" /></button> : null}
        </article>)}
      </div>
      <div className={s.sectionHeader}><div><h2>رحلة العميل لدى {customer.brand.name}</h2><p>من التسجيل حتى آخر قراءة أو مكافأة · الأحدث أولًا</p></div><span className={s.muted} role="status">{pending ? "جارٍ التحميل…" : detail ? `${n(detail.total)} حدث` : ""}</span></div>
      {detail?.events.length ? <ol className={s.timeline}>{detail.events.map((event) => <Event key={event.id} event={event} />)}</ol> : <div className={s.empty}><History aria-hidden="true" /><p>{pending ? "جارٍ تحميل سجل العميل…" : error ? "تعذر تحميل سجل العميل" : "لا توجد عمليات مسجلة لهذه العضوية"}</p></div>}
      {detail ? <div className={s.foot}><span>جميع الأوقات بتوقيت الرياض</span><Pagination page={detail.page} total={detail.total} size={detail.pageSize} pending={pending} onPage={onLoad} /></div> : null}
      <p className={s.note}>تحميل ملف البطاقة يختلف عن تثبيتها. يظهر التثبيت عند تسجيل الجهاز لدى المحفظة؛ طلب رابط قوقل لا يثبت حفظ البطاقة. لا تُستنتج تواريخ تحميل قديمة لم تُسجل.</p>
    </div>
  </dialog>;
}

export function BrandCustomersPage({ initialResult }: { initialResult: BrandCustomerResult<BrandCustomersPage> }) {
  const [data, setData] = useState<BrandCustomersPage | null>(initialResult.ok ? initialResult.data : null);
  const [knownBrands, setKnownBrands] = useState<BrandCustomerBrand[]>(initialResult.ok ? initialResult.data.brands : []);
  const [draft, setDraft] = useState<BrandCustomerFilters>({ search: "", brandId: "", segment: "all", sort: "recent", page: 1 });
  const [applied, setApplied] = useState(draft);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialResult.ok ? "" : initialResult.message);
  const [selected, setSelected] = useState<BrandCustomer | null>(null);
  const [detail, setDetail] = useState<BrandCustomerDetail | null>(null);
  const [detailPending, setDetailPending] = useState(false);
  const [detailError, setDetailError] = useState("");
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const errorRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => { listRequest.current += 1; detailRequest.current += 1; }, []);

  async function load(filters: BrandCustomerFilters, focus = false) {
    const request = ++listRequest.current;
    setPending(true); setError("");
    try {
      const result = await loadBrandCustomersAction(filters);
      if (request !== listRequest.current) return;
      if (!result.ok) { setError(result.message); requestAnimationFrame(() => errorRef.current?.focus()); return; }
      setData(result.data); setApplied(filters); setDraft(filters);
      setKnownBrands((previous) => [...new Map([...previous, ...result.data.brands].map((brand) => [brand.id, brand])).values()]);
      if (focus) requestAnimationFrame(() => resultsRef.current?.focus());
    } catch { if (request === listRequest.current) { setError("تعذر الاتصال. أعد المحاولة لتحميل بيانات العملاء."); requestAnimationFrame(() => errorRef.current?.focus()); } }
    finally { if (request === listRequest.current) setPending(false); }
  }

  async function openCustomer(customer: BrandCustomer, page = 1) {
    const request = ++detailRequest.current;
    if (selected?.id !== customer.id) setDetail(null);
    setSelected(customer); setDetailPending(true); setDetailError("");
    try {
      const result = await loadBrandCustomerDetailAction(customer.id, page);
      if (request !== detailRequest.current) return;
      if (result.ok) setDetail(result.data); else setDetailError(result.message);
    } catch { if (request === detailRequest.current) setDetailError("تعذر تحميل ملف العميل. أعد المحاولة."); }
    finally { if (request === detailRequest.current) setDetailPending(false); }
  }

  function closeCustomer() { detailRequest.current += 1; setSelected(null); setDetail(null); setDetailError(""); setDetailPending(false); }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void load({ ...draft, page: 1 }, true); }
  const summary = data?.summary;
  const dirty = draft.search !== applied.search || draft.brandId !== applied.brandId || draft.sort !== applied.sort;

  return <section className={s.page} dir="rtl" aria-labelledby="brand-customers-heading">
    <header className={s.heading}><div><span className={s.eyebrow}><ShieldCheck aria-hidden="true" />خاص بالسوبر أدمن</span><h1 id="brand-customers-heading">عملاء العلامات التجارية</h1><p>كل عميل، كل علامة، وكل زيارة. تابع الأختام والمكافآت وافهم علاقة عملائك بالعلامات من مكان واحد.</p></div><button type="button" className={s.button} disabled={pending} onClick={() => void load(applied)}><RefreshCw aria-hidden="true" />{pending ? "جارٍ التحديث…" : "تحديث البيانات"}</button></header>
    {error ? <div className={s.error} role="alert" tabIndex={-1} ref={errorRef}><CircleAlert aria-hidden="true" /><span>{error}</span></div> : null}
    <div className={s.metrics} aria-label="ملخص العملاء حسب الفلاتر المطبقة">
      <div className={s.metric}><span>العملاء الفريدون</span><strong>{summary ? n(summary.uniqueCustomers) : "—"}</strong><small>{summary ? `${n(summary.memberships)} عضوية لدى العلامات` : "بانتظار البيانات"}</small></div>
      <div className={s.metric} data-tone="shared"><span>مشتركون بين العلامات</span><strong>{summary ? n(summary.sharedCustomers) : "—"}</strong><small>عميل واحد، أكثر من علامة</small></div>
      <div className={s.metric} data-tone="reward"><span>المكافآت المصروفة</span><strong>{summary ? n(summary.rewardsRedeemed) : "—"}</strong><small>{summary ? `${n(summary.rewardsEarned)} مكافأة مكتسبة` : "بانتظار البيانات"}</small></div>
      <div className={s.metric}><span>مكافآت انتهت دون صرف</span><strong>{summary ? n(summary.rewardsExpired) : "—"}</strong><small>مكافآت فاتت صلاحيتها</small></div>
    </div>
    {data?.brands.length ? <>
      <div className={s.sectionHeader}><div><h2>العملاء بحسب العلامة</h2><p>اختر علامة لعرض عملائها · أعداد العلامات تراعي البحث وفئة العملاء</p></div></div>
      <div className={s.brandGrid}>{data.brands.map((brand) => <button key={brand.id} type="button" className={s.brand} disabled={pending} aria-pressed={applied.brandId === brand.id} onClick={() => void load({ ...applied, brandId: applied.brandId === brand.id ? "" : brand.id, page: 1 }, true)}><div className={s.brandTop}><strong>{brand.name}</strong>{applied.brandId === brand.id ? <Check aria-hidden="true" /> : <ArrowUpLeft aria-hidden="true" />}</div><p><span className={s.brandCount}>{n(brand.customers)}</span>عميل</p><div className={s.brandFoot}><span>{n(brand.stamps)} ختم مكتسب</span><span>{n(brand.rewardsRedeemed)} مكافأة مصروفة</span></div></button>)}</div>
    </> : null}
    <section className={s.register} aria-labelledby="brand-customer-register">
      <div className={s.registerHeader}><div className={s.sectionHeader}><div><h2 id="brand-customer-register">سجل العملاء</h2><p>كل صف يمثّل عضوية عميل لدى علامة تجارية</p></div><span className={s.muted} role="status">{pending ? "جارٍ التحميل…" : data ? `${n(data.total)} عضوية` : ""}</span></div>
        <div className={s.tabs} aria-label="فئة العملاء">{segments.map(([segment, label]) => <button key={segment} type="button" className={s.tab} disabled={pending} aria-pressed={(applied.segment ?? "all") === segment} onClick={() => void load({ ...applied, segment, page: 1 }, true)}>{label}</button>)}</div>
        <form onSubmit={submit} className={s.filters} aria-label="تصفية سجل العملاء">
          <label className={s.field}>البحث عن عميل<input disabled={pending} value={draft.search ?? ""} maxLength={80} placeholder="الاسم أو الجوال أو البريد الإلكتروني" onChange={(event) => setDraft({ ...draft, search: event.target.value })} /></label>
          <label className={s.field}>العلامة التجارية<select disabled={pending} value={draft.brandId ?? ""} onChange={(event) => setDraft({ ...draft, brandId: event.target.value })}><option value="">كل العلامات</option>{knownBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
          <label className={s.field}>ترتيب العملاء<select disabled={pending} value={draft.sort ?? "recent"} onChange={(event) => setDraft({ ...draft, sort: event.target.value as BrandCustomerFilters["sort"] })}><option value="recent">الأحدث نشاطًا</option><option value="stamps">الأكثر أختامًا</option><option value="rewards">الأكثر مكافآت</option></select></label>
          <button type="submit" className={s.primary} disabled={pending}><Search aria-hidden="true" />عرض النتائج</button>
        </form>
        {dirty ? <p className={s.note}>توجد تغييرات على البحث أو التصفية؛ اضغط «عرض النتائج» لتطبيقها.</p> : null}
      </div>
      <div className={s.tableWrap} ref={resultsRef} tabIndex={-1} aria-busy={pending}>
        {data?.customers.length ? <table className={s.table}><caption className={s.srOnly}>عضويات العملاء لدى العلامات التجارية وبيانات الولاء</caption><thead><tr><th scope="col">العميل</th><th scope="col">العلامة</th><th scope="col">الأختام والقراءات</th><th scope="col">المكافآت</th><th scope="col">آخر نشاط</th><th scope="col"><span className={s.srOnly}>فتح الملف</span></th></tr></thead><tbody>{data.customers.map((customer) => <tr key={customer.id}>
          <td data-label="العميل"><div className={s.identity}><span className={s.avatar} aria-hidden="true">{customer.name.trim().slice(0, 1) || "ع"}</span><div><strong>{customer.name || "عميل بدون اسم"}</strong><bdi className={s.phone}>{customer.phone || "بدون جوال"}</bdi><CustomerBadges customer={customer} /></div></div></td>
          <td data-label="العلامة"><strong>{customer.brand.name}</strong>{customer.sharedBrands.length > 1 ? <span className={s.smallLine}>{customer.sharedBrands.filter((brand) => brand.id !== customer.brand.id).map((brand) => brand.name).join("، ")}</span> : null}<span className={s.smallLine}>انضم {date(customer.joinedAt)}</span></td>
          <td data-label="الأختام والقراءات"><span className={s.number}>{n(customer.stamps)}</span><span className={s.smallLine}>ختم مكتسب · {n(customer.scans)} قراءة مسجلة</span><span className={s.smallLine}>الرصيد الحالي {n(customer.stampsInCycle)} / {n(customer.stampTarget)}</span></td>
          <td data-label="المكافآت"><div className={s.rewardSplit}><span>{n(customer.rewardsEarned)}<small>مكتسبة</small></span><span>{n(customer.rewardsRedeemed)}<small>مصروفة</small></span><span>{n(customer.rewardsExpired)}<small>فاتت</small></span></div>{customer.rewardsAvailable > 0 ? <span className={s.badge} data-tone="green">{n(customer.rewardsAvailable)} متاحة للصرف</span> : null}</td>
          <td data-label="آخر نشاط"><DateTime value={customer.lastActivityAt} /></td>
          <td><button type="button" className={s.rowButton} onClick={() => void openCustomer(customer)} aria-label={`فتح ملف ${customer.name || "العميل"} لدى ${customer.brand.name}`}>ملف العميل<ArrowUpLeft aria-hidden="true" /></button></td>
        </tr>)}</tbody></table> : <div className={s.empty}><Users aria-hidden="true" /><h3>{pending ? "جارٍ تحميل العملاء" : error ? "تعذر عرض العملاء" : "لا توجد عضويات مطابقة"}</h3><p>{error ? "أعد المحاولة باستخدام تحديث البيانات" : "ستظهر بيانات العملاء المسجلين في برامج الولاء هنا. يمكنك تعديل البحث أو اختيار كل العملاء."}</p></div>}
      </div>
      {data ? <div className={s.foot}><span>الملخص يعكس جميع النتائج المطابقة، وليس هذه الصفحة فقط</span><Pagination page={data.page} total={data.total} size={data.pageSize} pending={pending} onPage={(page) => void load({ ...applied, page }, true)} /></div> : null}
    </section>
    <p className={s.note}>العميل المميز: {n(data?.frequentThreshold ?? 10)} أختام مكتسبة فأكثر. التمييز بين العلامات يعتمد على رقم الجوال الموحّد أو الحساب المسجل، وليس تشابه الأسماء.</p>
    {data ? <p className={s.note}>بدأ سجل القراءات التفصيلي في {date(data.recordingStartedAt)}، وسجل تحميل المحفظة في {date(data.walletRecordingStartedAt)}. تظهر العمليات التاريخية المتاحة؛ القراءات غير المسجلة سابقًا غير قابلة للاسترجاع. جميع الأوقات بتوقيت الرياض.</p> : null}
    {selected ? <CustomerDialog selected={selected} detail={detail} pending={detailPending} error={detailError} onClose={closeCustomer} onLoad={(page) => void openCustomer(selected, page)} onSelect={(customer) => void openCustomer(customer)} /> : null}
  </section>;
}
