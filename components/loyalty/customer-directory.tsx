"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Phone, Search, UsersRound, X } from "lucide-react";
import { loadLoyaltyCustomerDetailAction, loadLoyaltyCustomersAction } from "@/app/actions/loyalty-customers";
import type { LoyaltyCustomerDetail, LoyaltyCustomerPage, LoyaltyCustomerRow } from "@/lib/loyalty/customer-directory-types";
import styles from "./customer-directory.module.css";

const number = new Intl.NumberFormat("ar-SA");
const loadError = "تعذر تحميل سجل العملاء حاول مرة أخرى";

function initials(name: string) {
  return name.trim().split(/\s+/u).slice(0, 2).map((part) => Array.from(part)[0]).join(" ") || "؟";
}

export function LoyaltyCustomerDetailDialog({ customer, onClose }: {
  customer: Pick<LoyaltyCustomerRow, "id" | "name">;
  onClose: () => void;
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
    void loadLoyaltyCustomerDetailAction(customer.id).then((result) => {
      if (!current) return;
      if (result.ok) setDetail(result.data);
      else setError(result.message);
    }).catch(() => {
      if (current) setError("تعذر تحميل بيانات العميل حاول مرة أخرى");
    });
    return () => { current = false; };
  }, [customer.id, retry]);

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
          <p>سجل عملاء الولاء</p>
        </div>
        <div className={styles.contact} aria-busy={!detail && !error}>
          {error ? <div className={styles.detailError}><p role="alert">{error}</p><button className={styles.retry} type="button" onClick={() => setRetry((value) => value + 1)}>إعادة المحاولة</button></div>
            : detail ? <dl><dt><Phone size={18} aria-hidden="true" /> رقم الجوال</dt><dd>{detail.phone ? <bdi dir="ltr">{detail.phone}</bdi> : <span className={styles.missingPhone}>رقم الجوال غير متوفر</span>}</dd></dl>
              : <div className={styles.detailLoading} role="status"><span className={styles.skeletonLine} aria-hidden="true" /> جار تحميل بيانات العميل</div>}
        </div>
        <footer className={styles.detailFooter}><button type="button" onClick={onClose}>إغلاق الملف</button></footer>
      </div>
    </dialog>
  );
}

export function LoyaltyCustomerDirectory() {
  const searchId = useId();
  const headingId = useId();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<LoyaltyCustomerPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<LoyaltyCustomerRow | null>(null);
  const closeDetail = useCallback(() => setSelected(null), []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    setData(null);
    const timer = window.setTimeout(() => {
      void loadLoyaltyCustomersAction({ page, query: query.trim() }).then((result) => {
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
  }, [page, query, retry]);

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
                <thead><tr><th scope="col">اسم العميل <span>عرض الملف</span></th></tr></thead>
                <tbody>{data.rows.map((customer) => <tr key={customer.id}><td><button type="button" className={styles.customer} onClick={() => setSelected(customer)} aria-haspopup="dialog" aria-label={`عرض ملف ${customer.name}`}><span className={styles.avatar} aria-hidden="true">{initials(customer.name)}</span><span className={styles.customerName}>{customer.name}</span><span className={styles.openProfile} aria-hidden="true"><span>عرض الملف</span><ArrowLeft size={18} /></span></button></td></tr>)}</tbody>
              </table>}
      </div>

      {!loading && !error && data && data.total > 0 && <footer className={styles.pagination}>
        <p>عرض <bdi>{number.format(data.page * data.pageSize + 1)}–{number.format(Math.min((data.page + 1) * data.pageSize, data.total))}</bdi> من <bdi>{number.format(data.total)}</bdi> عميل</p>
        <nav aria-label="صفحات سجل العملاء"><button type="button" disabled={data.page <= 0} onClick={() => setPage(Math.max(0, data.page - 1))} aria-label="الصفحة السابقة"><ChevronRight size={18} aria-hidden="true" /></button><span>صفحة {number.format(data.page + 1)} من {number.format(pages)}</span><button type="button" disabled={data.page + 1 >= pages} onClick={() => setPage(data.page + 1)} aria-label="الصفحة التالية"><ChevronLeft size={18} aria-hidden="true" /></button></nav>
      </footer>}
      {selected && <LoyaltyCustomerDetailDialog key={selected.id} customer={selected} onClose={closeDetail} />}
    </section>
  );
}
