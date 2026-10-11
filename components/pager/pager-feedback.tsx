"use client";

import { useRef, useState, type FormEvent } from "react";
import { CheckCheck, MessageCircleHeart, Star } from "lucide-react";
import { submitPagerFeedbackAction } from "@/app/actions/pager";
import type { PagerFeedback } from "@/lib/pager/types";
import styles from "./pager.module.css";

export function PagerFeedbackForm({ token, initialFeedback }: { token: string; initialFeedback: PagerFeedback }) {
  const [rating, setRating] = useState(initialFeedback.rating || 0);
  const [notes, setNotes] = useState(initialFeedback.notes || "");
  const [submitted, setSubmitted] = useState(initialFeedback.submitted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const labels = ["ضعيفة", "مقبولة", "جيدة", "جيدة جدًا", "ممتازة"];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!rating) { setError("اختر تقييمك من نجمة إلى خمس نجوم"); return; }
    submitting.current = true; setBusy(true); setError("");
    try { const result = await submitPagerFeedbackAction(token, rating, notes); if (!result.ok) { setError(result.error || "تعذر حفظ التقييم حاول مجددًا"); return; } setSubmitted(true); }
    catch { setError("تعذر إرسال التقييم تحقق من الاتصال ثم حاول مجددًا"); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <main className={`${styles.root} ${styles.feedback}`} dir="rtl">
    <header className={styles.feedbackHead}>{submitted ? <CheckCheck size={44} aria-hidden="true" /> : <MessageCircleHeart size={44} aria-hidden="true" />}<p className={styles.eyebrow}>{initialFeedback.brandName}</p><h1 className={styles.title}>{submitted ? "شكرًا لرأيك" : "كيف كانت تجربة الاستلام؟"}</h1><p className={styles.muted}>{submitted ? "وصل تقييمك إلى فريق العلامة ونسعد بخدمتك مرة ثانية" : "تقييمك يساعد الفريق على تقديم تجربة أجمل في زيارتك القادمة"}</p><div className={styles.feedbackInvoice}><span className={styles.invoiceLabel}>رقم الفاتورة</span><bdi className={styles.invoice}>{initialFeedback.invoiceNumber}</bdi></div></header>
    {!submitted && <form className={styles.feedbackForm} onSubmit={submit}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}><legend className={styles.label} style={{ textAlign: "center", width: "100%", marginBottom: 14 }}>تقييم الخدمة</legend><div className={styles.stars}>{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className={styles.star} aria-pressed={rating >= value} aria-label={`${value} من 5 ${labels[value - 1]}`} onClick={() => setRating(value)}><Star size={26} aria-hidden="true" /></button>)}</div><p className={styles.muted} style={{ textAlign: "center", minHeight: 25 }} aria-live="polite">{rating ? labels[rating - 1] : "اختر عدد النجوم"}</p></fieldset>
      <label className={styles.label}>ملاحظاتك <span className={styles.hint}>اختياري</span><textarea className={styles.textarea} maxLength={1000} value={notes} disabled={busy} onChange={(e) => setNotes(e.target.value)} placeholder="شاركنا ما أعجبك أو ما يمكننا تحسينه" /></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.button} type="submit" disabled={busy}>{busy ? "جار إرسال التقييم" : "إرسال التقييم"}</button>
    </form>}
    <p className={styles.muted} style={{ textAlign: "center", marginTop: 24 }}>بكل عناية من برندة</p>
  </main>;
}
