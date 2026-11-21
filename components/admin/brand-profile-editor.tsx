"use client";
import { useRef, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { updateAdminBrandProfileAction } from "@/app/actions/admin-brand-onboarding";
import type { PlatformCafe } from "@/lib/platform/admin-data";
import { AVAILABLE_BUSINESS_CATEGORY_IDS, BUSINESS_CATEGORIES } from "@/lib/platform/business-categories";
import s from "./brand-onboarding.module.css";

export function BrandProfileEditor({ cafe, disabled, onBusyChange, onSaved, close }: { cafe: PlatformCafe; disabled: boolean; onBusyChange: (busy: boolean) => void; onSaved: (cafe: PlatformCafe) => void; close: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  // The short link is public: it stays editable only until the account is handed to its owner
  const slugOpen = cafe.ownerDelivery?.state === "ready" || cafe.ownerDelivery?.state === "editing";
  const category = cafe.businessCategory || "cafes_coffee";
  // A brand on an activity that is no longer offered keeps it until the administrator picks another
  const categories: string[] = (AVAILABLE_BUSINESS_CATEGORY_IDS as readonly string[]).includes(category) ? [...AVAILABLE_BUSINESS_CATEGORY_IDS] : [...AVAILABLE_BUSINESS_CATEGORY_IDS, category];
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || disabled) return;
    const form = new FormData(event.currentTarget);
    inFlight.current = true; setPending(true); setError(""); onBusyChange(true);
    try {
      const result = await updateAdminBrandProfileAction({ cafeId: cafe.id, brandName: String(form.get("brandName") ?? ""), brandNameEn: String(form.get("brandNameEn") ?? ""),
        slug: String(form.get("slug") ?? cafe.slug), category: String(form.get("category") ?? category) });
      if (result.ok) { onSaved(result.data); close(); } else setError(result.message);
    } catch { setError("تعذر تأكيد الحفظ حدّث الصفحة ثم حاول مجددًا"); }
    finally { inFlight.current = false; setPending(false); onBusyChange(false); }
  }
  return <form onSubmit={save} className={s.ownerEditor} aria-busy={pending}>
    <fieldset className={s.fields} disabled={pending || disabled}>
      <legend>بيانات العلامة</legend>
      <label><span className={s.fieldTitle}>اسم العلامة</span><input name="brandName" defaultValue={cafe.name} required minLength={2} maxLength={120} autoComplete="organization" /></label>
      <label><span className={s.fieldTitle}>الاسم بالإنجليزية <small>اختياري</small></span><input name="brandNameEn" defaultValue={cafe.nameEn ?? ""} dir="ltr" maxLength={120} /></label>
      <label><span className={s.fieldTitle}>الرابط المختصر</span><input name="slug" defaultValue={cafe.slug} dir="ltr" readOnly={!slugOpen} required minLength={3} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" /><small className={s.fieldHint}>{slugOpen ? <>أحرف إنجليزية صغيرة وأرقام وشرطات مثل <bdi>my-brand</bdi></> : "يثبت الرابط بعد تسليم الحساب حتى لا تتوقف روابط العملاء ورموز QR"}</small></label>
      <label><span className={s.fieldTitle}>نوع النشاط</span><select name="category" defaultValue={category}>{categories.map(id => <option key={id} value={id}>{BUSINESS_CATEGORIES.find(item => item.id === id)?.label ?? cafe.businessCategoryLabel ?? id}</option>)}</select><small className={s.fieldHint}>تغيير النشاط يغيّر أقسام لوحة العلامة ومسمياتها</small></label>
    </fieldset>
    {error && <p className={s.error} role="alert">{error}</p>}
    <div className={s.actions}><button className={s.primary} type="submit" disabled={pending || disabled}>{pending && <LoaderCircle className={s.spinner} size={18} aria-hidden="true" />}{pending ? "جارٍ حفظ البيانات" : "حفظ بيانات العلامة"}</button><button className={s.secondary} type="button" disabled={pending} onClick={close}>إلغاء</button></div>
  </form>;
}
