"use client";

import { Camera, Check, MapPin, Navigation, Send, Star, X, ChevronDown, Menu } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { StandaloneMenu } from "@/lib/menu/standalone-menu";
import { menuDisplayText } from "@/lib/menu/standalone-menu";
import s from "./bistro-menu.module.css";

function ServiceDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const focus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; focus?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className={`${s.dialog} ${s.serviceDialog}`} aria-labelledby="service-title" onCancel={close} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <button type="button" className={s.close} onClick={close} aria-label="إغلاق النافذة" autoFocus><X aria-hidden="true" /></button>
    <p className={s.eyebrow}>BEYOND THE MENU</p><h2 id="service-title">{title}</h2>{children}
  </dialog>;
}

function FeedbackForm({ slug }: { slug: string }) {
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "queued">("idle");
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const pending = useRef(false);
  const labels = ["لم تعجبني", "تحتاج تحسين", "جيدة", "جميلة", "استثنائية"];
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating || pending.current) return;
    pending.current = true;
    setStatus("sending"); setError("");
    requestId.current ??= crypto.randomUUID();
    const website = new FormData(event.currentTarget).get("website") || "";
    try {
      const response = await fetch(`/api/menu/${encodeURIComponent(slug)}/feedback`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, notes, requestId: requestId.current, website }),
        signal: AbortSignal.timeout(25_000),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "تعذر إرسال التقييم الآن");
      setStatus("queued");
    } catch (failure) {
      setStatus("idle");
      setError(failure instanceof Error && failure.name !== "TimeoutError" && failure.name !== "TypeError" ? failure.message : "تعذر تأكيد الإرسال تحقق من اتصالك وحاول مرة أخرى");
    } finally { pending.current = false; }
  }
  if (status === "queued") return <div className={s.feedbackSuccess} role="status"><Check aria-hidden="true" /><h3>رأيك يصنع فرقًا</h3><p>شكرًا لك تم استلام تقييمك وإرساله إلى خدمة واتساب العلامة</p></div>;
  return <form onSubmit={submit} className={s.feedbackForm} aria-busy={status === "sending"}>
    <p className={s.serviceDescription}>كيف كانت لحظتك معنا</p>
    <fieldset disabled={status === "sending"} className={s.ratingGroup}><legend>اختر تقييمك من نجمة إلى خمس نجوم</legend>
      <div className={s.stars} dir="ltr">{labels.map((label, index) => <label key={label}>
        <input type="radio" name="rating" value={index + 1} checked={rating === index + 1} onChange={() => { setRating(index + 1); requestId.current = null; }} aria-label={`${index + 1} من 5 ${label}`} required />
        <Star aria-hidden="true" fill={rating > index ? "currentColor" : "none"} />
      </label>)}</div>
      <p className={s.ratingCaption} aria-live="polite">{rating ? labels[rating - 1] : "كل رأي يهمنا"}</p>
    </fieldset>
    <label className={s.notesLabel} htmlFor="feedback-notes">تفاصيل تجربتك <span>اختياري</span></label>
    <textarea id="feedback-notes" value={notes} disabled={status === "sending"} maxLength={1500} rows={4} placeholder="ما الذي أحببته وما الذي يمكننا تحسينه" onChange={(event) => { setNotes(event.target.value); requestId.current = null; }} />
    <span className={s.characterCount} dir="ltr">{notes.length} / 1500</span>
    <div className={s.honeypot} aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <p className={s.privacyNote}>تقييمك خاص ويصل لفريق العلامة عبر واتساب ولا يُنشر للزوار أو على خرائط جوجل</p>
    {error && <p className={s.feedbackError} role="alert">{error}</p>}
    <button type="submit" className={s.servicePrimary} disabled={!rating || status === "sending"}><Send size={17} aria-hidden="true" />{status === "sending" ? "جار إرسال رأيك" : "أرسل رأيك للعلامة"}</button>
  </form>;
}

export function MenuServices({ menu, compact = false }: { menu: StandaloneMenu; compact?: boolean }) {
  const [panel, setPanel] = useState<"about" | "location" | "feedback" | null>(null);
  const [copied, setCopied] = useState("");
  const location = menu.contacts.location;
  async function copyLocation() {
    if (!location) return;
    try { await navigator.clipboard.writeText(location.googleUrl); setCopied("تم نسخ رابط الموقع"); }
    catch { setCopied("يمكنك فتح الموقع ونسخ الرابط من الخرائط"); }
  }
  return <>
    <button type="button" className={compact ? s.heroIcon : s.aboutTrigger} onClick={() => setPanel("about")} aria-haspopup="dialog" aria-label={compact ? "عن المطعم والتواصل" : undefined}>{compact ? <Menu aria-hidden="true" /> : <>عن المطعم<ChevronDown size={15} aria-hidden="true" /></>}</button>
    {panel === "about" && <ServiceDialog title={menuDisplayText(menu.name)} close={() => setPanel(null)}>
    <p className={s.serviceDescription}>{menuDisplayText(menu.description || "لكل مزاج مذاق يستحق")}</p>
    <nav className={s.serviceDock} aria-label="تواصل مع العلامة">
      {location && <button type="button" onClick={() => { setCopied(""); setPanel("location"); }}><MapPin aria-hidden="true" /><span>ننتظرك هنا<small>موقع الفرع والاتجاهات</small></span></button>}
      {menu.contacts.instagramUrl && <a href={menu.contacts.instagramUrl} target="_blank" rel="noopener noreferrer"><Camera aria-hidden="true" /><span>تفاصيل يومنا<small>تابعنا على إنستقرام</small></span></a>}
      {menu.slug === "basilico" && <a href="https://www.tiktok.com/@basilico_sa?_r=1&amp;_t=ZS-99mEsafhMUp" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M19.321 5.562a5.124 5.124 0 0 1-4.43-4.53V0h-3.447v13.672a2.89 2.89 0 0 1-5.2 1.743 2.89 2.89 0 0 1 2.31-4.623c.298 0 .595.047.879.138V7.43a6.33 6.33 0 0 0-5.394 10.692 6.33 6.33 0 0 0 10.852-4.45V6.687a8.182 8.182 0 0 0 4.43 1.297V4.58c-.329 0-.658-.033-.98-.098z" /></svg><span>تيك توك<small>تابعنا على تيك توك</small></span></a>}
      {menu.contacts.feedbackEnabled && <button type="button" onClick={() => setPanel("feedback")}><Star aria-hidden="true" /><span>كيف كانت تجربتك<small>رأيك يصل لفريقنا</small></span></button>}
    </nav>
    </ServiceDialog>}
    {panel === "location" && location && <ServiceDialog title="لحظتك تبدأ من هنا" close={() => setPanel(null)}>
      <div className={s.locationArt} aria-hidden="true"><span /><span /><MapPin /></div>
      <p className={s.locationName}>{location.label}</p><p className={s.serviceDescription}>اختر تطبيق الخرائط المفضل لديك لبدء الطريق</p>
      <div className={s.mapLinks}><a className={s.servicePrimary} href={location.googleUrl} target="_blank" rel="noopener noreferrer"><Navigation size={18} aria-hidden="true" />خرائط جوجل</a>
        <a className={s.serviceSecondary} href={location.appleUrl} target="_blank" rel="noopener noreferrer"><MapPin size={18} aria-hidden="true" />خرائط آبل</a></div>
      <button type="button" className={s.copyLocation} onClick={copyLocation}>نسخ الموقع ومشاركته</button><p className={s.copyStatus} role="status">{copied}</p>
    </ServiceDialog>}
    {panel === "feedback" && <ServiceDialog title="ذائقتك تلهمنا" close={() => setPanel(null)}><FeedbackForm slug={menu.slug} /></ServiceDialog>}
  </>;
}
