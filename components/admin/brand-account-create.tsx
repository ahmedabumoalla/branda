"use client";
import { useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle, UserPlus } from "lucide-react";
import { BrandDialog } from "./brand-details-dialog";
import { createAdminBrandAccountAction } from "@/app/actions/admin-brand-onboarding";
import type { PlatformCafe } from "@/lib/platform/admin-data";
import { AVAILABLE_BUSINESS_CATEGORY_IDS, BUSINESS_CATEGORIES } from "@/lib/platform/business-categories";
import type { AdminBrandAccountInput } from "@/lib/platform/brand-onboarding";
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
        slug, category: String(data.get("category")) as AdminBrandAccountInput["category"],
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
        <label><span className={s.fieldTitle}>اسم العلامة</span><input name="brandName" required minLength={2} maxLength={120} autoFocus autoComplete="organization" /></label>
        <label><span className={s.fieldTitle}>الاسم بالإنجليزية <small>اختياري</small></span><input name="brandNameEn" dir="ltr" maxLength={120} onChange={event => { if (!slugEdited.current) setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)); }} /></label>
        <label><span className={s.fieldTitle}>الرابط المختصر <small>اختياري</small></span><input name="slug" dir="ltr" minLength={3} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={event => { slugEdited.current = true; setSlug(event.target.value.toLowerCase()); }} aria-describedby="new-brand-slug-hint" /><small id="new-brand-slug-hint" className={s.fieldHint}>نجهّز رابطًا تلقائيًا إذا تركته فارغًا أو اكتب مثل <bdi>my-brand</bdi></small></label>
        <label><span className={s.fieldTitle}>نوع النشاط</span><select name="category" defaultValue="cafes_coffee">{AVAILABLE_BUSINESS_CATEGORY_IDS.map(id => <option key={id} value={id}>{BUSINESS_CATEGORIES.find(category => category.id === id)!.label}</option>)}</select></label>
      </fieldset>
      <fieldset disabled={pending} className={s.fields}>
        <legend>بيانات المالك والدخول</legend>
        <p className={s.sectionHint}>كل بيانات المالك اختيارية الآن تقدر تكملها لاحقًا من بطاقة العلامة قبل الإرسال</p>
        <label><span className={s.fieldTitle}>اسم المالك <small>لاحقًا</small></span><input name="ownerName" minLength={2} maxLength={120} autoComplete="name" /></label>
        <label><span className={s.fieldTitle}>جوال الدخول والواتساب <small>لاحقًا</small></span><input name="phone" type="tel" dir="ltr" inputMode="tel" maxLength={24} placeholder="05xxxxxxxx" autoComplete="tel" /></label>
        <label><span className={s.fieldTitle}>البريد الإلكتروني <small>اختياري</small></span><input name="email" type="email" dir="ltr" maxLength={254} autoComplete="email" /></label>
        <div className={s.field}><label htmlFor="new-brand-password" className={s.fieldTitle}>كلمة المرور <small>لاحقًا</small></label><div className={s.password}><input id="new-brand-password" name="password" type={showPassword ? "text" : "password"} dir="ltr" minLength={8} maxLength={72} pattern="\S+" autoComplete="new-password" aria-describedby="new-brand-password-hint" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button></div><small id="new-brand-password-hint" className={s.fieldHint}>تقدر تحددها الآن أو لاحقًا ٨ أحرف على الأقل بدون مسافات</small></div>
      </fieldset>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <footer className={s.actions}><button type="submit" className={s.primary} disabled={pending}>{pending && <LoaderCircle className={s.spinner} size={18} aria-hidden="true" />}{pending ? "جارٍ إنشاء الحساب" : "إنشاء الحساب وتجهيز العلامة"}</button><button type="button" className={s.secondary} disabled={pending} onClick={close}>إلغاء</button></footer>
    </form>
  </BrandDialog>;
}
