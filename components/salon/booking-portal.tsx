"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scissors } from "lucide-react";
import { respondSalonBookingAction, reviewSalonBookingAction } from "@/app/actions/salon";
import { bookingLabels, salonTime, type SalonBooking } from "@/lib/salon/types";
import styles from "./salon.module.css";
import loyalty from "@/components/rast-loyalty/rast-loyalty.module.css";
import { salonTheme } from "./salon-theme";
export function BookingPortal({ token, booking, brandName, slug, loyaltyEnabled, colors }: { token: string; booking: SalonBooking; brandName: string; slug: string; loyaltyEnabled: boolean; colors?: { background: string; foreground: string; accent: string } }) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  const [error, setError] = useState("");
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  function respond(accept: boolean) { setError(""); transition(async () => { const result = await respondSalonBookingAction(token, booking.version, accept); if (result.ok) router.refresh(); else setError(result.error); }); }
  return <main className={`${loyalty.dashboard} ${styles.page}`} style={salonTheme({ name: brandName, slug, logoUrl: null, cardBackground: colors?.background, cardForeground: colors?.foreground, cardAccent: colors?.accent })} dir="rtl"><div className={styles.portal}>
    <a href={`/salon/${slug}`} className={styles.eyebrow}><Scissors size={22} aria-hidden="true" />{brandName}</a><h1>تفاصيل حجزك</h1><p>أهلًا {booking.customerName}</p>
    <div className={styles.status} role="status">{bookingLabels[booking.status]}{booking.status === "pending" && <p>طلبك وصل إلى الصالون سيراجعه المالك ويرسل الرد عبر واتساب</p>}</div>
    <dl><div><dt>الخدمة</dt><dd>{booking.service.name || "تحدد مع الصالون"}</dd></div><div><dt>السعر عند الحجز</dt><dd>{booking.service.price == null ? "يحدد مع الصالون" : `${booking.service.price} ر س`}</dd></div><div><dt>الموعد المطلوب</dt><dd>{salonTime(booking.requestedStart)}</dd></div>{booking.scheduledStart && <div><dt>الموعد المؤكد</dt><dd>{salonTime(booking.scheduledStart)}</dd></div>}</dl>
    <p className={styles.hint}>جميع الأوقات بتوقيت السعودية</p>
    {booking.status === "proposed" && <section className={styles.card}><h2>الصالون يقترح موعدًا آخر</h2><p>{salonTime(booking.proposedStart)}</p><p>{booking.scheduledStart ? "يتغير موعدك بعد موافقتك فقط وإذا رفضت يبقى موعدك الأصلي ويُبلّغ المالك للتواصل معك" : "اختر الموافقة لتأكيد الموعد أو الرفض لإنهاء الطلب"}</p><div className={styles.heroActions}><button className={styles.button} onClick={() => respond(true)} disabled={pending}>أوافق على الموعد</button><button className={`${styles.button} ${styles.secondary}`} onClick={() => respond(false)} disabled={pending}>أرفض الموعد</button></div></section>}
    {booking.status === "completed" && <section className={styles.card}>{booking.rating ? <><h2>شكرًا لتقييمك</h2><p>{booking.rating} من 5</p><p>{booking.review}</p></> : <form onSubmit={e => { e.preventDefault(); setError(""); transition(async () => { const result = await reviewSalonBookingAction(token, rating, review); if (result.ok) router.refresh(); else setError(result.error); }); }}><h2>كيف كانت تجربتك؟</h2><fieldset className="my-5"><legend className={styles.hint}>التقييم من نجمة إلى خمس نجوم</legend><div className={styles.stars}>{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" aria-label={`${n} من 5`} aria-pressed={rating === n} onClick={() => setRating(n)} disabled={pending}>{n <= rating ? "★" : "☆"}</button>)}</div></fieldset><label className={styles.field}>ملاحظاتك اختياري<textarea maxLength={1000} rows={4} value={review} onChange={e => setReview(e.target.value)} disabled={pending} /></label><button className={`${styles.button} mt-4`} disabled={pending}>{pending ? "جارٍ الحفظ" : "إرسال التقييم"}</button></form>}</section>}
    {error && <p role="alert" className={`${styles.error} mt-4`}>{error}</p>}
    <div className={styles.heroActions}><button className={`${styles.button} ${styles.secondary}`} onClick={() => router.refresh()} disabled={pending}>تحديث الحالة</button>{loyaltyEnabled && <a className={styles.button} href={`/loyalty/${slug}`}>بطاقة الولاء</a>}</div>
    <p className={`${styles.hint} mt-5`}>احتفظ بهذا الرابط لمتابعة حجزك ولا تشاركه مع الآخرين</p>
  </div></main>;
}
