"use client";
import s from "@/components/admin/pages/brand-customers.module.css";
export default function BrandCustomersError({ reset }: { reset: () => void }) {
  return <section className={s.page} dir="rtl"><div className={s.error} role="alert">تعذر تحميل عملاء العلامات التجارية تحقق من الاتصال وحاول مجددًا</div><button type="button" className={s.button} onClick={reset}>إعادة المحاولة</button></section>;
}
