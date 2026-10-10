"use client";

import { Activity, ArrowLeft, Building2, ChevronLeft, ChevronRight, Clock3, Fingerprint, Globe2, Info, Monitor, RefreshCw, ScanLine, Search, Smartphone, Tablet, UsersRound, WalletCards, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fetchCustomerIntelligenceAction, fetchCustomerIntelligenceDetailAction } from "@/app/actions/customer-intelligence";
import { customerActivityLabels, defaultCustomerFilters, type CustomerDevice, type CustomerIntelligenceDetail, type CustomerIntelligenceFilters, type CustomerIntelligencePage, type IntelligenceCustomer } from "@/lib/analytics/customer-intelligence";
import s from "./admin-customers-page.module.css";

type Props = { initialData: CustomerIntelligencePage | null; configError?: string };
type EventKind = "all" | "browser" | "loyalty" | "wallet";
const number = (value: number) => value.toLocaleString("ar-SA");
const date = (value: string | null) => {
  if (!value || !Number.isFinite(Date.parse(value))) return "غير متاح";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)?.value).join("-");
};
const time = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "غير متاح";
export function customerDuration(seconds: number | null) {
  if (seconds === null) return "غير متاح";
  if (seconds < 60) return `${number(Math.floor(seconds))} ثانية`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${number(minutes)} دقيقة` : `${number(Math.floor(minutes / 60))} ساعة${minutes % 60 ? ` و${number(minutes % 60)} دقيقة` : ""}`;
}
const activityName = (kind: string) => customerActivityLabels[kind] || "نشاط مسجل";
const outcomeLabels: Record<string, string> = { success: "مكتملة", denied: "غير مسموح", failed: "لم تكتمل", duplicate: "مكررة" };
function Device({ device }: { device: CustomerDevice | null }) {
  const Icon = device?.type === "mobile" ? Smartphone : device?.type === "tablet" ? Tablet : Monitor;
  return <span className={s.device}><Icon size={17} aria-hidden="true" /><span>{device?.name || "غير متاح"}<small>{device ? [device.os, device.browser].filter(Boolean).join(" / ") || "تفاصيل الجهاز غير متاحة" : "لم يسجل جهاز بعد"}</small></span></span>;
}
function Stamp({ customer }: { customer: IntelligenceCustomer }) {
  return <span className={s.avatar} aria-hidden="true">{customer.name.trim().slice(0, 1) || "ع"}</span>;
}

export function AdminCustomersPage({ initialData, configError }: Props) {
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState<CustomerIntelligenceFilters>({ ...defaultCustomerFilters, page: initialData?.page || 1 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(configError || "");
  const [selected, setSelected] = useState<IntelligenceCustomer | null>(null);
  const [detail, setDetail] = useState<CustomerIntelligenceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailPage, setDetailPage] = useState(1);
  const [kind, setKind] = useState<EventKind>("all");
  const request = useRef(0);
  const detailRequest = useRef(0);
  const latestFilters = useRef(filters);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!selected) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; opener?.focus(); };
  }, [selected?.id]);
  useEffect(() => () => { request.current++; detailRequest.current++; }, []);

  async function load(next: CustomerIntelligenceFilters) {
    const token = ++request.current;
    latestFilters.current = next;
    setFilters(next); setLoading(true); setError("");
    try {
      const result = await fetchCustomerIntelligenceAction(next);
      if (token !== request.current) return;
      if (!result.ok) { setError(result.message); return; }
      setData(result.data);
      setFilters({ ...next, page: result.data.page });
      latestFilters.current = { ...next, page: result.data.page };
    } catch { if (token === request.current) setError("تعذر تحديث العملاء تحقق من الاتصال ثم أعد المحاولة"); }
    finally { if (token === request.current) setLoading(false); }
  }
  async function loadDetail(customer: IntelligenceCustomer, page = 1, nextKind: EventKind = "all") {
    const token = ++detailRequest.current;
    setDetailLoading(true); setDetailError(""); setDetailPage(page); setKind(nextKind);
    try {
      const result = await fetchCustomerIntelligenceDetailAction({ customerId: customer.id, page, kind: nextKind });
      if (token !== detailRequest.current) return;
      if (!result.ok) { setDetailError(result.message); return; }
      setDetail(result.data); setDetailPage(result.data.page);
    } catch { if (token === detailRequest.current) setDetailError("تعذر تحميل نشاط العميل أعد المحاولة"); }
    finally { if (token === detailRequest.current) setDetailLoading(false); }
  }
  function openCustomer(customer: IntelligenceCustomer) { setSelected(customer); setDetail(null); void loadDetail(customer); }
  function closeCustomer() { detailRequest.current++; setSelected(null); setDetail(null); }
  const customer = detail?.customer || selected;
  if (!data) return <main className={s.root} dir="rtl"><header className={s.heading}><div><span className={s.eyebrow}><Fingerprint size={17} aria-hidden="true" /> معرفة أعمق بعملائك</span><h1>كل عميل <span>له حكاية</span></h1><p>العلامات والنشاط والأجهزة في مكان واحد</p></div></header><section className={s.directory} aria-busy={loading}><div className={s.empty}><Info size={30} aria-hidden="true" /><h2>تعذر تحميل بيانات العملاء</h2><p role="alert">{error || "لم تصل بيانات العملاء أعد المحاولة لتحميل النتائج"}</p><button disabled={loading} onClick={() => void load(latestFilters.current)}>{loading ? "جارٍ تحميل البيانات" : "إعادة المحاولة"}</button></div></section></main>;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const detailPages = Math.max(1, Math.ceil((detail?.total || 0) / (detail?.pageSize || 20)));
  const sessions = customer ? customer.menuSessions + customer.loyaltySessions : 0;

  return <main className={s.root} dir="rtl">
    <header className={s.heading}>
      <div><span className={s.eyebrow}><Fingerprint size={17} aria-hidden="true" /> معرفة أعمق بعملائك</span><h1>كل عميل <span>له حكاية</span></h1><p>من أول ارتباط بعلامتك إلى آخر تفاعل مع برندة</p></div>
      <button className={s.refresh} disabled={loading} onClick={() => void load(latestFilters.current)}><RefreshCw size={17} className={loading ? s.spinning : ""} aria-hidden="true" /> تحديث البيانات</button>
    </header>
    <section className={s.metrics} aria-label="ملخص جميع نتائج البحث">
      <div className={s.primaryMetric}><UsersRound aria-hidden="true" /><span>العملاء</span><strong>{number(data.summary.customers)}</strong><small>أشخاص عبر العلامات المرتبطة</small></div>
      <div><Activity aria-hidden="true" /><span>نشاط اليوم</span><strong>{number(data.summary.activeToday)}</strong><small>عملاء لديهم نشاط مسجل بتوقيت الرياض</small></div>
      <div><Building2 aria-hidden="true" /><span>مرتبطون بأكثر من علامة</span><strong>{number(data.summary.shared)}</strong><small>حضور واحد عبر عدة علامات</small></div>
      <div><Clock3 aria-hidden="true" /><span>وقت التفاعل المقاس</span><strong className={s.durationMetric}>{data.summary.measured ? customerDuration(data.summary.activeSeconds) : "غير متاح"}</strong><small>لدى {number(data.summary.measured)} عميل تتوفر لهم قياسات</small></div>
    </section>
    <section className={s.directory} aria-label="سجل العملاء">
      <div className={s.directoryTitle}><div><h2>سجل العملاء</h2><p>العلامات والنشاط والأجهزة في مكان واحد</p></div><span className={s.resultCount}>{number(data.total)} عميل</span></div>
      <form className={s.filters} onSubmit={event => { event.preventDefault(); void load({ ...latestFilters.current, search, page: 1 }); }}>
        <div className={s.search}><Search size={19} aria-hidden="true" /><label className={s.srOnly} htmlFor="customer-search">البحث عن عميل</label><input id="customer-search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} placeholder="اسم العميل أو الجوال أو البريد" /><button type="submit">بحث</button></div>
        <label><span>العلامة</span><select value={filters.brandId} onChange={event => void load({ ...latestFilters.current, brandId: event.target.value, page: 1 })}><option value="">كل العلامات</option>{data.brands.map(brand => <option value={brand.id} key={brand.id}>{brand.name}</option>)}</select></label>
        <label><span>الترتيب</span><select value={filters.sort} onChange={event => void load({ ...latestFilters.current, sort: event.target.value as CustomerIntelligenceFilters["sort"], page: 1 })}><option value="recent">آخر نشاط أولًا</option><option value="time">الأكثر تفاعلًا</option><option value="name">حسب الاسم</option></select></label>
      </form>
      <div className={s.segments} aria-label="شرائح العملاء">{([['all', 'جميع العملاء'], ['recent', 'نشاط آخر ٧ أيام'], ['shared', 'أكثر من علامة'], ['unmeasured', 'بلا قياس للمدة']] as const).map(([value, label]) => <button type="button" aria-pressed={filters.segment === value} key={value} onClick={() => void load({ ...latestFilters.current, segment: value, page: 1 })}>{label}</button>)}</div>
      {error && <div className={s.error} role="alert"><span>{error}</span><button onClick={() => void load(latestFilters.current)}>إعادة المحاولة</button></div>}
      <div className={s.tableRegion} aria-busy={loading}>
        {loading && <div className={s.loading} role="status">جارٍ تحديث النتائج</div>}
        <table className={s.table}><caption className={s.srOnly}>العملاء والعلامات المرتبطة وآخر نشاط والجهاز ووقت التفاعل</caption><thead><tr><th scope="col">العميل</th><th scope="col">العلامات المرتبطة</th><th scope="col">آخر نشاط مسجل</th><th scope="col">الجهاز الأخير</th><th scope="col">وقت التفاعل</th><th scope="col"><span className={s.srOnly}>ملف العميل</span></th></tr></thead>
          <tbody>{data.customers.map(person => <tr key={person.id}>
            <td data-label="العميل"><div className={s.identity}><Stamp customer={person} /><div><button className={s.nameButton} onClick={() => openCustomer(person)}>{person.name}</button><bdi className={s.phone}>{person.phone || "رقم غير متاح"}</bdi></div></div></td>
            <td data-label="العلامات المرتبطة"><span className={s.brandCount}>{number(person.brandCount)} علامة</span><span className={s.brandNames}>{person.brands.slice(0, 2).map(brand => brand.name).join(" / ")}{person.brandCount > 2 && <button onClick={() => openCustomer(person)}>و{number(person.brandCount - 2)} أخرى</button>}</span></td>
            <td data-label="آخر نشاط"><strong className={s.activityTitle}>{person.lastActivity ? activityName(person.lastActivity.kind) : "لا يوجد نشاط مسجل"}</strong>{person.lastActivity && <small>{person.lastActivity.brandName}</small>}<span className={s.timestamp}>{person.lastActivity ? <><bdi>{date(person.lastActivity.at)}</bdi><span>{time(person.lastActivity.at)}</span></> : "بيانات النشاط غير متاحة"}</span></td>
            <td data-label="الجهاز الأخير"><Device device={person.device} /></td>
            <td data-label="وقت التفاعل"><strong className={s.duration}>{customerDuration(person.activeSeconds)}</strong><small>{person.activeSeconds === null ? "لم يبدأ القياس لهذا العميل" : `${number(person.sessions)} جلسة مقاسة`}</small></td>
            <td><button className={s.openButton} onClick={() => openCustomer(person)} aria-label={`عرض ملف ${person.name}`}><span>عرض الملف</span><ArrowLeft size={17} aria-hidden="true" /></button></td>
          </tr>)}</tbody></table>
        {!data.customers.length && !loading && <div className={s.empty}><Search size={30} aria-hidden="true" /><h3>لا يوجد عملاء بهذه الخيارات</h3><p>جرّب اسمًا آخر أو اعرض جميع العملاء</p><button onClick={() => { setSearch(""); void load(defaultCustomerFilters); }}>مسح الفلاتر</button></div>}
      </div>
      <footer className={s.pagination}><span>صفحة {number(data.page)} من {number(pages)}</span><div><button disabled={loading || data.page <= 1} onClick={() => void load({ ...latestFilters.current, page: data.page - 1 })}><ChevronRight size={17} aria-hidden="true" /> السابق</button><button disabled={loading || data.page >= pages} onClick={() => void load({ ...latestFilters.current, page: data.page + 1 })}>التالي <ChevronLeft size={17} aria-hidden="true" /></button></div></footer>
    </section>
    <aside className={s.measurementNote}><Info size={18} aria-hidden="true" /><div><p>وقت التفاعل يقيس الاستخدام الفعلي أثناء ظهور الصفحة منذ بدء التتبع في <bdi>{date(data.recordingStartedAt)}</bdi> ولا يشمل وقت الخلفية أو الفترات السابقة غير المسجلة</p><p>آخر استخدام للمتصفح والجهاز يتاحان عند تسجيل دخول العميل والزيارات المجهولة لا تنسب إلى ملفه</p></div></aside>
    <dialog ref={dialog} className={s.dialog} aria-labelledby="customer-profile-title" onCancel={closeCustomer}>
      {customer && <div className={s.profile} dir="rtl">
        <header className={s.profileHeader}><span><Fingerprint size={18} aria-hidden="true" /> ملف العميل</span><button onClick={closeCustomer} aria-label="إغلاق ملف العميل"><X size={21} /></button></header>
        <div className={s.profileHero}><div className={s.profileIdentity}><Stamp customer={customer} /><div><h2 id="customer-profile-title">{customer.name}</h2><div className={s.contacts}><bdi>{customer.phone || "رقم غير متاح"}</bdi>{customer.email && <bdi>{customer.email}</bdi>}</div><p>أول تسجيل <bdi>{date(customer.joinedAt)}</bdi></p></div></div><span className={s.profileBadge}>{number(customer.brandCount)} علامة مرتبطة</span></div>
        <div className={s.profileStats}><div><span>آخر استخدام للمتصفح</span><strong>{date(customer.lastSeenAt)}</strong><small>{time(customer.lastSeenAt)}</small></div><div><span>وقت التفاعل المقاس</span><strong>{customerDuration(customer.activeSeconds)}</strong><small>{customer.activeSeconds === null ? "لا تتوفر قياسات سابقة" : `${number(customer.sessions)} جلسة مقاسة`}</small></div><div><span>قراءات بطاقة الولاء</span><strong>{number(customer.scans)}</strong><small>من سجل عمليات الولاء</small></div><div><span>الجهاز الأخير</span><Device device={customer.device} /></div></div>
        <div className={s.profileColumns}>
          <div className={s.profileSide}>
            <section className={s.brandSection}><div className={s.sectionHeading}><h3>علاقته بالعلامات</h3><Building2 size={18} aria-hidden="true" /></div><p>الارتباطات المحفوظة للعميل عبر برندة</p><div className={s.brandList}>{customer.brands.map(brand => <article key={brand.id}><div className={s.brandIdentity}><span aria-hidden="true">{brand.name.slice(0, 1)}</span><div><h4>{brand.name}</h4><small>مرتبط منذ <bdi>{date(brand.joinedAt)}</bdi></small></div></div><dl><div><dt>قراءة</dt><dd>{number(brand.scans)}</dd></div><div><dt>أختام</dt><dd>{number(brand.stamps)}</dd></div><div><dt>مكافآت</dt><dd>{number(brand.rewards)}</dd></div></dl></article>)}</div><p className={s.identityNote}>تجميع الارتباطات حسب {customer.identityMatch === "phone" ? "رقم الجوال المطابق" : customer.identityMatch === "account" ? "الحساب المرتبط" : "الملف المسجل"}</p></section>
            <section className={s.usage}><h3>أين يقضي وقته</h3><p>توزيع الجلسات المقاسة حسب الخدمة</p>{customer.activeSeconds === null ? <span className={s.unavailable}>تبدأ هذه البيانات مع أول جلسة مقاسة</span> : <><div className={s.usageBar} role="img" aria-label={`${number(customer.menuSessions)} جلسة منيو و${number(customer.loyaltySessions)} جلسة ولاء`}><span style={{ width: `${sessions ? customer.menuSessions / sessions * 100 : 0}%` }} /><i style={{ width: `${sessions ? customer.loyaltySessions / sessions * 100 : 0}%` }} /></div><div className={s.usageLegend}><span><Globe2 size={15} aria-hidden="true" /> المنيو <b>{number(customer.menuSessions)}</b></span><span><WalletCards size={15} aria-hidden="true" /> الولاء <b>{number(customer.loyaltySessions)}</b></span></div></>}</section>
          </div>
          <section className={s.timelineSection} aria-busy={detailLoading}><div className={s.sectionHeading}><h3>رحلة العميل</h3><Activity size={19} aria-hidden="true" /></div><p>التفاعلات المسجلة من الأحدث إلى الأقدم</p><div className={s.eventFilters} aria-label="نوع النشاط">{([['all', 'الكل'], ['browser', 'التصفح'], ['loyalty', 'الولاء'], ['wallet', 'المحفظة']] as const).map(([value, label]) => <button key={value} aria-pressed={kind === value} onClick={() => void loadDetail(customer, 1, value)}>{label}</button>)}</div>
            {detailError && <div className={s.error} role="alert"><span>{detailError}</span><button onClick={() => void loadDetail(customer, detailPage, kind)}>إعادة تحميل النشاط</button></div>}
            {detailLoading ? <div className={s.timelineLoading} role="status"><RefreshCw size={20} className={s.spinning} aria-hidden="true" /> جارٍ تحميل رحلة العميل</div> : !detailError && <>
              <ol className={s.timeline}>{detail?.events.map(event => { const Icon = event.source === "browser" ? Globe2 : event.source === "wallet" ? WalletCards : ScanLine; return <li key={event.id}><span className={s.eventIcon}><Icon size={17} aria-hidden="true" /></span><div className={s.eventBody}><div><h4>{activityName(event.kind)}</h4><time dateTime={event.at}><bdi>{date(event.at)}</bdi> {time(event.at)}</time></div><p>{event.brandName}</p>{event.outcome && <span className={s.outcome} data-outcome={event.outcome}>{outcomeLabels[event.outcome] || "نتيجة مسجلة"}</span>}{event.detail && <p className={s.eventDetail}>{event.detail}</p>}{event.kind === "loyalty_qr_visit" && <small>فتح رابط QR لا يثبت استخدام كاميرا الهاتف</small>}{event.source === "browser" && <div className={s.eventMeta}><span><Clock3 size={13} aria-hidden="true" /> {customerDuration(event.activeSeconds)}</span><span>{event.device?.name || "الجهاز غير متاح"}</span></div>}</div></li>; })}</ol>
              {detail && !detail.events.length && <div className={s.empty}><Activity size={26} aria-hidden="true" /><h4>لا توجد أحداث مسجلة هنا</h4><p>تظهر الأنشطة المتاحة بمجرد تسجيلها</p></div>}
              {detail && <footer className={s.pagination}><span>{number(detail.total)} حدث</span><div><button aria-label="صفحة النشاط السابقة" disabled={detailPage <= 1} onClick={() => void loadDetail(customer, detailPage - 1, kind)}><ChevronRight size={17} aria-hidden="true" /></button><span>{number(detailPage)} / {number(detailPages)}</span><button aria-label="صفحة النشاط التالية" disabled={detailPage >= detailPages} onClick={() => void loadDetail(customer, detailPage + 1, kind)}><ChevronLeft size={17} aria-hidden="true" /></button></div></footer>}
            </>}
          </section>
        </div>
        <aside className={s.profileNote}><Info size={17} aria-hidden="true" /><div><p>نوع الجهاز مستنتج من المتصفح وقد لا يتوفر طراز الجوال الدقيق ومدة الاستخدام وقت تفاعل مقاس منذ بدء التتبع وليست سجلًا كاملًا للفترات السابقة</p><p>آخر استخدام للمتصفح والجهاز يتاحان عند تسجيل دخول العميل والزيارات المجهولة لا تنسب إلى ملفه</p></div></aside>
      </div>}
    </dialog>
  </main>;
}
