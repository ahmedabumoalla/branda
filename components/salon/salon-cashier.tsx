"use client";
import { useCallback, useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { BellRing, CalendarCheck, Check, Clock3, LogOut, RefreshCw, ScanLine } from "lucide-react";
import { commandSalonBookingAction, fetchSalonBookingsAction } from "@/app/actions/salon";
import { logoutCashierAction } from "@/app/actions/cashier";
import { salonTime, type SalonBooking, type SalonPage } from "@/lib/salon/types";
import { loyaltyTheme } from "@/components/rast-loyalty/loyalty-theme";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import loyalty from "@/components/rast-loyalty/rast-loyalty.module.css";
import styles from "./salon-cashier.module.css";

/** Cashier sees the active queue only; history and customer reviews belong to the dashboard. */
export function SalonCashier({ initial, identity, canUseLoyalty }: { initial: SalonPage; identity: LoyaltyIdentity; canUseLoyalty?: boolean }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, transition] = useTransition();
  const lock = useRef(false);
  const sequence = useRef(0);
  const refresh = useCallback(async (page: number) => {
    const current = ++sequence.current;
    const result = await fetchSalonBookingsAction({ status: "active", page }, "staff", true);
    if (sequence.current !== current) return;
    if (result.ok) setData(result.data); else setError(result.error);
  }, []);
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden && !lock.current) void refresh(data.page); }, 30000); return () => clearInterval(timer); }, [refresh, data.page]);
  function command(booking: SalonBooking, action: "call" | "complete") {
    if (lock.current) return; lock.current = true; setError(""); setNotice("");
    transition(async () => {
      try { const result = await commandSalonBookingAction(booking.id, booking.version, action, null, "staff");
        if (result.ok) { setNotice(action === "call" ? "تم تسجيل النداء وإضافة رسالة واحدة للإرسال" : "اكتملت الخدمة وأضيف رابط التقييم وبطاقة الولاء للإرسال"); await refresh(data.page); }
        else setError(result.error);
      } finally { lock.current = false; }
    });
  }
  const theme = loyaltyTheme(identity) as Record<string, string> | undefined;
  const pageStyle = { ...theme } as CSSProperties;
  return <main className={`${loyalty.dashboard} ${styles.shell}`} style={pageStyle} dir="rtl"><section className={styles.frame}>
    <header className={styles.header}><div className={styles.brand}><p title={identity.name}>{identity.name}</p><h1><BellRing aria-hidden="true" />نداء برندة</h1></div><div className={styles.tools}><button className={styles.tool} title="تحديث المواعيد" aria-label="تحديث المواعيد" disabled={pending} onClick={() => transition(() => refresh(data.page))}><RefreshCw aria-hidden="true" /></button>{canUseLoyalty && <a href="/cashier" className={styles.tool} title="قارئ الولاء" aria-label="قارئ الولاء"><ScanLine aria-hidden="true" /></a>}<form action={logoutCashierAction}><button className={styles.tool} disabled={pending} title="تسجيل الخروج" aria-label="تسجيل الخروج"><LogOut aria-hidden="true" /></button></form></div></header>
    {error && <p role="alert" className={`${styles.message} ${styles.error}`}>{error}</p>}{notice && <p role="status" className={styles.message}>{notice}</p>}
    <div className={styles.heading}><h2>المواعيد المؤكدة</h2><span className={styles.count}><b>{data.total}</b> موعد للخدمة</span></div>
    <div className={styles.list}>{data.bookings.length ? data.bookings.map(booking => <article key={booking.id} className={styles.appointment}><div className={styles.details}><h3 title={booking.customerName}>{booking.customerName}</h3><div className={styles.meta}><time dateTime={booking.scheduledStart || undefined}><Clock3 aria-hidden="true" />{salonTime(booking.scheduledStart)}</time>{booking.status === "in_service" && <span className={styles.called}>تم النداء</span>}</div></div>{booking.status === "confirmed" ? <button className={styles.action} aria-label={`استدعاء العميل ${booking.customerName}`} disabled={pending} onClick={() => command(booking, "call")}><BellRing aria-hidden="true" /> استدعاء</button> : <button className={`${styles.action} ${styles.complete}`} aria-label={`إنهاء الخدمة ${booking.customerName}`} disabled={pending} onClick={() => command(booking, "complete")}><Check aria-hidden="true" /> إنهاء</button>}</article>) : <div className={styles.empty}><CalendarCheck aria-hidden="true" /><div><h3>لا توجد مواعيد مؤكدة</h3><p>تظهر المواعيد هنا بمجرد تأكيدها من الصالون</p></div></div>}</div>
    {data.total > 30 && <div className={styles.pagination}><button disabled={pending || data.page === 0} onClick={() => transition(() => refresh(data.page - 1))}>السابق</button><span>{data.page + 1} / {Math.ceil(data.total / 30)}</span><button disabled={pending || (data.page + 1) * 30 >= data.total} onClick={() => transition(() => refresh(data.page + 1))}>التالي</button></div>}
  </section></main>;
}
