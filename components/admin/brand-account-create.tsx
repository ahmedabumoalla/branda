"use client";
import { useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle, UserPlus } from "lucide-react";
import { BrandDialog } from "./brand-details-dialog";
import { createAdminBrandAccountAction } from "@/app/actions/admin-brand-onboarding";
import type { PlatformCafe } from "@/lib/platform/admin-data";
import s from "./brand-onboarding.module.css";

export function BrandAccountCreate({ close, onCreated }: { close: () => void; onCreated: (cafe: PlatformCafe) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [slug, setSlug] = useState("");
  const slugEdited = useRef(false);
  const requestId = useRef<string | null>(null);
  const inFlight = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    requestId.current ??= crypto.randomUUID();
    inFlight.current = true; setPending(true); setError("");
    try {
      const result = await createAdminBrandAccountAction({ requestId: requestId.current,
        brandName: String(data.get("brandName") ?? ""), brandNameEn: String(data.get("brandNameEn") ?? ""),
        slug, category: String(data.get("category")) as "cafes_coffee" | "restaurants" | "events_conferences",
        ownerName: String(data.get("ownerName") ?? ""), phone: String(data.get("phone") ?? ""),
        email: String(data.get("email") ?? ""), password: String(data.get("password") ?? ""),
      });
      if (result.ok) onCreated(result.data); else setError(result.message);
    } catch { setError("انقطع الاتصال حدّث قائمة العلامات للتحقق قبل إعادة المحاولة"); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <BrandDialog title="إنشاء حساب علامة تجارية" close={close} busy={pending} detail>
    <form onSubmit={submit} className={s.form} aria-busy={pending}>
      <header className={s.intro}><UserPlus aria-hidden="true" /><div><h2>حساب جديد للعلامة</h2><p>جهّز العلامة الآن وأرسل بيانات الدخول عندما تصبح جاهزة</p></div></header>
      <div className={s.note}>صلاحيات الباقة التجريبية متاحة فور الإنشاء وتبدأ مدة ٧ أيام بعد إرسال تفاصيل الدخول عبر واتساب</div>
      <fieldset disabled={pending} className={s.fields}>
        <legend>بيانات العلامة</legend>
        <label>اسم العلامة<input name="brandName" required minLength={2} maxLength={120} autoFocus autoComplete="organization" /></label>
        <label>الاسم بالإنجليزية <small>اختياري</small><input name="brandNameEn" dir="ltr" maxLength={120} onChange={event => { if (!slugEdited.current) setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)); }} /></label>
        <label>الرابط المختصر<input name="slug" dir="ltr" required minLength={3} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={event => { slugEdited.current = true; setSlug(event.target.value.toLowerCase()); }} aria-describedby="new-brand-slug-hint" /><small id="new-brand-slug-hint">أحرف إنجليزية وأرقام وشرطة مثل my-brand</small></label>
        <label>نوع النشاط<select name="category" defaultValue="cafes_coffee"><option value="cafes_coffee">مقاهي وكوفيهات</option><option value="restaurants">مطاعم</option><option value="events_conferences">فعاليات ومؤتمرات</option></select></label>
      </fieldset>
      <fieldset disabled={pending} className={s.fields}>
        <legend>بيانات المالك والدخول</legend>
        <label>اسم المالك<input name="ownerName" required minLength={2} maxLength={120} autoComplete="name" /></label>
        <label>جوال الدخول والواتساب<input name="phone" type="tel" dir="ltr" inputMode="tel" required maxLength={24} placeholder="05xxxxxxxx" autoComplete="tel" /></label>
        <label>البريد الإلكتروني <small>اختياري</small><input name="email" type="email" dir="ltr" maxLength={254} autoComplete="email" /></label>
        <label>كلمة المرور<div className={s.password}><input name="password" type={showPassword ? "text" : "password"} dir="ltr" required minLength={8} maxLength={72} pattern="\S+" autoComplete="new-password" aria-describedby="new-brand-password-hint" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div><small id="new-brand-password-hint">٨ أحرف على الأقل بدون مسافات وستُرسل للمالك عند الضغط على زر الإرسال في بطاقة العلامة</small></label>
      </fieldset>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <footer className={s.actions}><button type="submit" className={s.primary} disabled={pending}>{pending && <LoaderCircle className={s.spinner} size={18} aria-hidden="true" />}{pending ? "جارٍ إنشاء الحساب" : "إنشاء الحساب وتجهيز العلامة"}</button><button type="button" className={s.secondary} disabled={pending} onClick={close}>إلغاء</button></footer>
    </form>
  </BrandDialog>;
}
