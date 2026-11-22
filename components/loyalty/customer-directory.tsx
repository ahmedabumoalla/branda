"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Cake, ChevronLeft, ChevronRight, Phone, Search, UsersRound, X } from "lucide-react";
import { loadLoyaltyCustomerDetailAction, loadLoyaltyCustomersAction } from "@/app/actions/loyalty-customers";
import type { LoyaltyCustomerBalance, LoyaltyCustomerDetail, LoyaltyCustomerPage, LoyaltyCustomerRow } from "@/lib/loyalty/customer-directory-types";
import { CustomerCardMessage } from "./customer-card-message";
import styles from "./customer-directory.module.css";

const number = new Intl.NumberFormat("ar-SA");
const loadError = "تعذر تحميل سجل العملاء حاول مرة أخرى";
const birthday = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
function birthDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : birthday.format(date);
}

function initials(name: string) {
  return name.trim().split(/\s+/u).slice(0, 2).map((part) => Array.from(part)[0]).join(" ") || "؟";
}

function CustomerBalances({ loyalty, name }: { loyalty: LoyaltyCustomerBalance | null; name: string }) {
  if (!loyalty) return <p className={styles.noCard}>لم تُصدر بطاقة ولاء لهذا العميل</p>;

  const stamps = <dl key="stamps" className={styles.balances} aria-label={`أختام ومكافآت ${name}`}>
    <div><dt>إجمالي الأختام المكتسبة</dt><dd>{number.format(loyalty.stampsCollected)}</dd></div>
    <div><dt>أختام الدورة الحالية</dt><dd>{number.format(loyalty.stampsInCycle)}</dd></div>
    <div><dt>المكافآت المصروفة</dt><dd>{number.format(loyalty.rewardsRedeemed)}</dd></div>
    <div><dt>مكافآت الأختام المتاحة</dt><dd>{number.format(loyalty.availableStampRewards)}</dd></div>
  </dl>;
  const points = <dl key="points" className={styles.balances} aria-label={`نقاط ${name}`}>
    <div><dt>رصيد النقاط الحالي</dt><dd>{number.format(loyalty.pointsBalance)}</dd></div>
    <div><dt>إجمالي النقاط المكتسبة</dt><dd>{number.format(loyalty.pointsEarned)}</dd></div>
    <div><dt>إجمالي النقاط المصروفة</dt><dd>{number.format(loyalty.pointsSpent)}</dd></div>
    {loyalty.affordablePointRewards !== null && <div><dt>خيارات الاستبدال بالنقاط</dt><dd>{number.format(loyalty.affordablePointRewards)}</dd></div>}
  </dl>;
  return <div className={styles.balanceGroups}>{loyalty.mode === "points" ? [points, stamps] : [stamps, points]}</div>;
}

export function LoyaltyCustomerDetailDialog({ customer, onClose, downloadedOnly = false }: {
  customer: Pick<LoyaltyCustomerRow, "id" | "name">;
  onClose: () => void;
  downloadedOnly?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [detail, setDetail] = useState<LoyaltyCustomerDetail | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    let current = true;
    setDetail(null);
    setError("");
    void loadLoyaltyCustomerDetailAction(customer.id, downloadedOnly).then((result) => {
      if (!current) return;
      if (result.ok) setDetail(result.data);
      else setError(result.message);
    }).catch(() => {
      if (current) setError("تعذر تحميل بيانات العميل حاول مرة أخرى");
    });
    return () => { current = false; };
  }, [customer.id, retry, downloadedOnly]);

  return (
    <dialog ref={dialog} className={styles.dialog} dir="rtl" aria-labelledby={headingId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={styles.detailCard}>
        <header className={styles.detailHeader}>
          <span>ملف العميل</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="إغلاق ملف العميل" autoFocus><X size={20} aria-hidden="true" /></button>
        </header>
        <div className={styles.identity}>
          <span className={styles.largeAvatar} aria-hidden="true">{initials(detail?.name || customer.name)}</span>
          <h3 id={headingId}>{detail?.name || customer.name}</h3>
          {detail?.loyalty && <p>{detail.loyalty.mode === "points" ? "بطاقة نقاط" : "بطاقة أختام"}</p>}
        </div>
        {detail && <CustomerBalances loyalty={detail.loyalty} name={detail.name} />}
        <div className={styles.contact} aria-busy={!detail && !error}>
          {error ? <div className={styles.detailError}><p role="alert">{error}</p><button className={styles.retry} type="button" onClick={() => setRetry((value) => value + 1)}>إعادة المحاولة</button></div>
            : detail ? <dl><dt><Phone size={18} aria-hidden="true" /> رقم الجوال</dt><dd>{detail.phone ? <bdi dir="ltr">{detail.phone}</bdi> : <span className={styles.missingPhone}>رقم الجوال غير متوفر</span>}</dd>{detail.birthdayEnabled ? <><dt className={styles.nextTerm}><Cake size={18} aria-hidden="true" /> تاريخ الميلاد</dt><dd>{detail.birthDate ? <span className={styles.birthDate}>{birthDateLabel(detail.birthDate)}</span> : <span className={styles.missingPhone}>لم يسجل تاريخ الميلاد</span>}</dd></> : null}</dl>
              : <div className={styles.detailLoading} role="status"><span className={styles.skeletonLine} aria-hidden="true" /> جار تحميل بيانات العميل</div>}
        </div>
        {detail?.phone && <CustomerCardMessage customerId={customer.id} downloadedOnly={downloadedOnly} />}
        <footer className={styles.detailFooter}><button type="button" onClick={onClose}>إغلاق الملف</button></footer>
      </div>
    </dialog>
  );
}

export function LoyaltyCustomerDirectory({ downloadedOnly = false }: { downloadedOnly?: boolean } = {}) {
  const searchId = useId();
  const headingId = useId();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<LoyaltyCustomerPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Pick<LoyaltyCustomerRow, "id" | "name"> | null>(null);
  const closeDetail = useCallback(() => setSelected(null), []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    setData(null);
    const timer = window.setTimeout(() => {
      void loadLoyaltyCustomersAction({ page, query: query.trim(), downloadedOnly }).then((result) => {
        if (!current) return;
        if (result.ok) setData(result.data);
        else setError(result.message);
      }).catch(() => {
        if (current) setError(loadError);
      }).finally(() => {
        if (current) setLoading(false);
      });
    }, query ? 300 : 0);
    return () => { current = false; window.clearTimeout(timer); };
  }, [page, query, retry, downloadedOnly]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className={styles.directory} dir="rtl" aria-labelledby={headingId}>
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          <span className={styles.headerIcon} aria-hidden="true"><UsersRound size={25} strokeWidth={1.5} /></span>
          <div><p className={styles.eyebrow}>أسماء تعرفها وولاء يتجدد</p><h2 id={headingId}>سجل العملاء</h2><p className={styles.description}>اختر اسم العميل لعرض بياناته</p></div>
        </div>
        <div className={styles.total} aria-live="polite"><span>{query.trim() ? "نتائج البحث" : "عملاء الولاء"}</span><strong>{loading || !data ? "—" : number.format(data.total)}</strong></div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={19} aria-hidden="true" />
          <label className={styles.srOnly} htmlFor={searchId}>ابحث باسم العميل</label>
          <input id={searchId} type="search" value={query} maxLength={80} placeholder="ابحث باسم العميل" autoComplete="off"
            onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
          {query && <button type="button" onClick={() => { setQuery(""); setPage(0); }} aria-label="مسح البحث"><X size={16} aria-hidden="true" /></button>}
        </div>
        <span className={styles.toolbarHint}>كل عميل له مكانه</span>
      </div>

      <div className={styles.results} aria-busy={loading}>
        {loading ? <div className={styles.loading} role="status"><span className={styles.srOnly}>جار تحميل سجل العملاء</span>{Array.from({ length: 5 }, (_, index) => <div className={styles.skeletonRow} key={index} aria-hidden="true"><span className={styles.skeletonAvatar} /><span className={styles.skeletonLine} /></div>)}</div>
          : error ? <div className={styles.empty}><UsersRound size={32} aria-hidden="true" /><h3>لم نتمكن من عرض السجل</h3><p role="alert">{error}</p><button className={styles.retry} type="button" onClick={() => setRetry((value) => value + 1)}>إعادة المحاولة</button></div>
            : !data?.rows.length ? <div className={styles.empty}><UsersRound size={34} strokeWidth={1.4} aria-hidden="true" /><h3>{query.trim() ? "لم نجد هذا الاسم" : "هنا تبدأ معرفة عملائك"}</h3><p>{query.trim() ? "جرّب اسمًا آخر أو امسح البحث لعرض جميع العملاء" : "تظهر أسماء العملاء هنا بعد تسجيلهم في برنامج الولاء"}</p>{query && <button className={styles.retry} type="button" onClick={() => { setQuery(""); setPage(0); }}>عرض جميع العملاء</button>}</div>
              : <table className={styles.table}>
                <caption className={styles.srOnly}>أسماء عملاء برنامج الولاء اختر اسمًا لفتح ملفه</caption>
                <thead><tr><th scope="col">العميل ورصيد الولاء</th></tr></thead>
                <tbody>{data.rows.map(({ loyalty, ...customer }) => <tr key={customer.id}><td>
                  <button type="button" className={styles.customer} onClick={() => setSelected(customer)} aria-haspopup="dialog" aria-label={`عرض ملف ${customer.name}`}>
                    <span className={styles.avatar} aria-hidden="true">{initials(customer.name)}</span>
                    <span className={styles.customerName}>{customer.name}</span>
                    <span className={styles.openProfile} aria-hidden="true"><span>عرض الملف</span><ArrowLeft size={18} /></span>
                  </button>
                  <CustomerBalances loyalty={loyalty} name={customer.name} />
                </td></tr>)}</tbody>
              </table>}
      </div>

      {!loading && !error && data && data.total > 0 && <footer className={styles.pagination}>
        <p>عرض <bdi>{number.format(data.page * data.pageSize + 1)}–{number.format(Math.min((data.page + 1) * data.pageSize, data.total))}</bdi> من <bdi>{number.format(data.total)}</bdi> عميل</p>
        <nav aria-label="صفحات سجل العملاء"><button type="button" disabled={data.page <= 0} onClick={() => setPage(Math.max(0, data.page - 1))} aria-label="الصفحة السابقة"><ChevronRight size={18} aria-hidden="true" /></button><span>صفحة {number.format(data.page + 1)} من {number.format(pages)}</span><button type="button" disabled={data.page + 1 >= pages} onClick={() => setPage(data.page + 1)} aria-label="الصفحة التالية"><ChevronLeft size={18} aria-hidden="true" /></button></nav>
      </footer>}
      {selected && <LoyaltyCustomerDetailDialog key={selected.id} customer={selected} onClose={closeDetail} downloadedOnly={downloadedOnly} />}
    </section>
  );
}
