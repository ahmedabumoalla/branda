"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, MapPin, Check, LoaderCircle, X, Send, Store, ClipboardCheck, Copy, ExternalLink } from "lucide-react";
import { VISIT_SERVICES, visitSchema } from "@/lib/representative-visits/schema";
import styles from "./visits.module.css";

export function VisitShareLinks() {
  const [message, setMessage] = useState("رابط عام لا يحتاج تسجيل دخول");
  return <div className={styles.share}>
    <a className={styles.primary} href="/visits" target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />فتح نموذج تسجيل الزيارة</a>
    <button type="button" className={styles.secondary} onClick={async () => {
      try { await navigator.clipboard.writeText(new URL("/visits", window.location.origin).href); setMessage("تم نسخ الرابط جاهز للإرسال للمناديب"); }
      catch { setMessage("تعذر النسخ افتح النموذج وانسخ الرابط من المتصفح"); }
    }}><Copy size={18} />نسخ رابط النموذج</button><span role="status">{message}</span>
  </div>;
}
async function compressPhoto(file: File): Promise<File> {
  if (file.size > 30 * 1024 * 1024) throw new Error("اختر صورة أقل من ٣٠ ميجابايت");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("تعذر تجهيز الصورة");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob || blob.size > 1900000) throw new Error("اختر صورة أصغر حجمًا");
    return new File([blob], "visit.jpg", { type: "image/jpeg" });
  } finally { URL.revokeObjectURL(url); }
}
function PhotoInput({ label, optional, onChange, onBusy, disabled }: { label: string; optional?: boolean; onChange: (file: File | null) => void; onBusy: (busy: boolean) => void; disabled: boolean }) {
  const [preview, setPreview] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const upload = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  async function choose(file?: File) {
    if (!file) return;
    setBusy(true); onBusy(true); setError("");
    try {
      const compressed = await compressPhoto(file);
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(compressed); });
      setPreview(data); onChange(compressed);
    } catch { setError("تعذر تجهيز الصورة التقط صورة بالكاميرا أو اختر صورة JPG أصغر"); }
    finally { setBusy(false); onBusy(false); }
  }
  return <div className={styles.photo}>
    <div className={styles.photoTitle}>{label}<small>{optional ? "اختياري" : "مطلوب"}</small></div>
    {preview ? <div className={styles.preview}>
      {/* Native image renders the local compressed preview without a network request */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt={label} />
      <button type="button" disabled={disabled || busy} aria-label={`إزالة ${label}`} onClick={() => { setPreview(""); onChange(null); }}><X size={16} /></button></div> : <div className={styles.photoPlaceholder}><Camera size={27} /><span>صورة واضحة تختصر تفاصيل الزيارة</span></div>}
    <div className={styles.photoActions}><button type="button" disabled={disabled || busy} onClick={() => camera.current?.click()}><Camera size={17} />تصوير الآن</button><button type="button" disabled={disabled || busy} onClick={() => upload.current?.click()}><Upload size={17} />رفع صورة</button></div>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
    <input ref={upload} type="file" accept="image/*" hidden onChange={e => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
    {busy && <small role="status">جاري تجهيز الصورة للرفع</small>}{error && <small role="alert" className={styles.error}>{error}</small>}
  </div>;
}
export function VisitForm({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  const [interest, setInterest] = useState(""); const [services, setServices] = useState<string[]>([]);
  const [photo, setPhoto] = useState<File | null>(null), [menuPhoto, setMenuPhoto] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false), [menuBusy, setMenuBusy] = useState(false);
  const [locationMode, setLocationMode] = useState("gps");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false), [locationError, setLocationError] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""); const [savedAt, setSavedAt] = useState("");
  const id = useRef(""); const inFlight = useRef(false); const errorRef = useRef<HTMLDivElement>(null);
  function fail(message: string) { setError(message); requestAnimationFrame(() => { errorRef.current?.focus(); errorRef.current?.scrollIntoView({ block: "center" }); }); }
  function locate() {
    if (!navigator.geolocation) { setLocationError("المتصفح لا يدعم الموقع استخدم رابط قوقل ماب"); return; }
    setLocating(true); setLocationError("");
    navigator.geolocation.getCurrentPosition(position => { setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setLocating(false); }, () => { setLocating(false); setLocationError("تعذر تحديد الموقع فعّل إذن الموقع أو ألصق رابط قوقل ماب"); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current || photoBusy || menuBusy) return;
    const form = event.currentTarget, fields = new FormData(form);
    if (!id.current) id.current = crypto.randomUUID();
    const parsed = visitSchema.safeParse({ requestId: id.current, brandName: fields.get("brandName"), representativeName: fields.get("representativeName"), managerPhone: fields.get("managerPhone"), ownerPhone: fields.get("ownerPhone"), interest, services, otherService: fields.get("otherService") ?? "", locationMode, latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null, mapsUrl: fields.get("mapsUrl") ?? "", website: fields.get("website") ?? "" });
    if (!parsed.success) { fail(parsed.error.issues[0]?.message ?? "راجع البيانات المطلوبة"); return; }
    if (!photo) { fail("أضف صورة العلامة قبل تسجيل الزيارة"); return; }
    inFlight.current = true; setBusy(true); setError("");
    const payload = new FormData(); payload.set("data", JSON.stringify(parsed.data)); payload.set("photo", photo); if (menuPhoto) payload.set("menuPhoto", menuPhoto);
    try {
      const response = await fetch("/api/visits", { method: "POST", body: payload }); const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) { fail(result?.error ?? "تعذر حفظ الزيارة حاول مجددًا"); return; }
      setSavedAt(result.createdAt); form.reset(); id.current = ""; if (admin) router.refresh();
    } catch { fail("انقطع الاتصال بياناتك محفوظة في النموذج أعد المحاولة"); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (savedAt) return <div className={`${styles.form} ${styles.success}`} role="status"><div className={styles.successIcon}><Check size={30} /></div><h2>وصلت الزيارة بنجاح</h2><p>تم حفظ بيانات العلامة والصور وإضافتها إلى سجل الزيارات</p><time dateTime={savedAt}>{new Date(savedAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "long", timeStyle: "short" })}</time><small>بتوقيت السعودية</small><button className={styles.primary} type="button" onClick={() => { setSavedAt(""); setInterest(""); setServices([]); setPhoto(null); setMenuPhoto(null); setCoordinates(null); setLocationError(""); setLocationMode("gps"); }}>تسجيل زيارة جديدة</button></div>;
  return <form className={styles.form} onSubmit={submit} aria-busy={busy}>
    <fieldset disabled={busy} className={styles.formFields}>
      <div className={styles.sectionHeading}><span><Store size={21} /></span><div><small>الخطوة ١</small><h2>العلامة التي زرتها</h2></div></div>
      <label className={styles.field}>اسم العلامة<input name="brandName" required minLength={2} maxLength={150} placeholder="اكتب اسم العلامة التجارية" autoComplete="organization" /></label>
      <div className={`${styles.grid} ${styles.photoGrid}`}><PhotoInput label="صورة العلامة" onChange={setPhoto} onBusy={setPhotoBusy} disabled={busy} /><PhotoInput label="صورة المنيو" optional onChange={setMenuPhoto} onBusy={setMenuBusy} disabled={busy} /></div>
      <div className={styles.grid}><label className={styles.field}>رقم المسؤول <small>اختياري</small><input name="managerPhone" type="tel" inputMode="tel" maxLength={30} placeholder="05xxxxxxxx" dir="ltr" /></label><label className={styles.field}>رقم المالك <small>اختياري</small><input name="ownerPhone" type="tel" inputMode="tel" maxLength={30} placeholder="05xxxxxxxx" dir="ltr" /></label></div>
      <div className={styles.sectionHeading}><span><ClipboardCheck size={21} /></span><div><small>الخطوة ٢</small><h2>نتيجة الزيارة</h2></div></div>
      <fieldset className={styles.options}><legend>هل العلامة مهتمة بخدمات برندة؟</legend><div className={styles.choiceRow}>{[["interested", "مهتم"], ["not_interested", "غير مهتم"]].map(([value, label]) => <label key={value} className={interest === value ? styles.chosen : ""}><input type="radio" name="interest" required value={value} checked={interest === value} onChange={() => setInterest(value)} />{label}</label>)}</div></fieldset>
      {interest === "interested" && <fieldset className={styles.options}><legend>الخدمات التي يهتم بها <small>يمكن اختيار أكثر من خدمة</small></legend><div className={styles.services}>{Object.entries(VISIT_SERVICES).map(([value, label]) => <label key={value} className={services.includes(value) ? styles.chosen : ""}><input type="checkbox" checked={services.includes(value)} onChange={e => { const checked = e.currentTarget.checked; setServices(old => checked ? [...old, value] : old.filter(item => item !== value)); }} />{label}</label>)}</div>{services.includes("other") && <label className={styles.field}>الخدمة الأخرى<input name="otherService" required maxLength={500} placeholder="اكتب الخدمة التي تحتاجها العلامة" /></label>}</fieldset>}
      <div className={styles.sectionHeading}><span><MapPin size={21} /></span><div><small>الخطوة ٣</small><h2>موقع الفرع والمندوب</h2></div></div>
      <fieldset className={styles.options}><legend>كيف تحدد موقع الفرع؟</legend><div className={styles.choiceRow}>{[["gps", "موقعي الحالي"], ["link", "رابط قوقل ماب"]].map(([value, label]) => <label key={value} className={locationMode === value ? styles.chosen : ""}><input type="radio" name="locationMode" value={value} checked={locationMode === value} onChange={() => setLocationMode(value)} />{label}</label>)}</div></fieldset>
      {locationMode === "gps" ? <div className={styles.location}><button type="button" className={styles.secondary} onClick={locate} disabled={locating}>{locating ? <LoaderCircle className={styles.spin} size={18} /> : <MapPin size={18} />}{locating ? "جاري تحديد الموقع" : coordinates ? "تحديث الموقع" : "التقاط موقع الفرع"}</button><small>{coordinates ? "تم تحديد الموقع تأكد أنك متواجد عند الفرع" : "استخدم هذا الخيار وأنت متواجد عند الفرع"}</small>{coordinates && <a href={`https://www.google.com/maps?q=${coordinates.latitude},${coordinates.longitude}`} target="_blank" rel="noopener noreferrer">معاينة الموقع ↗</a>}{locationError && <p className={styles.error} role="alert">{locationError}</p>}</div> : <label className={styles.field}>رابط موقع الفرع<input name="mapsUrl" required type="url" maxLength={2048} placeholder="https://maps.app.goo.gl/…" dir="ltr" /><small>انسخ رابط الموقع من المشاركة في قوقل ماب</small></label>}
      <label className={styles.field}>اسم المندوب<input name="representativeName" required minLength={2} maxLength={120} placeholder="اسمك الكامل" autoComplete="name" /></label>
      <div className={styles.trap} aria-hidden="true"><label>الموقع الإلكتروني<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    </fieldset>
    {error && <div ref={errorRef} tabIndex={-1} role="alert" className={styles.errorBox}>{error}</div>}
    <div className={styles.submitRow}><span>وقت وتاريخ الزيارة يُحفظان تلقائيًا<br /><small>بتوقيت السعودية عند إرسال النموذج</small></span><button type="submit" className={styles.primary} disabled={busy || photoBusy || menuBusy}>{busy ? <LoaderCircle className={styles.spin} size={19} /> : <Send size={19} />}{busy ? "جاري حفظ الزيارة" : "تسجيل الزيارة"}</button></div>
  </form>;
}
