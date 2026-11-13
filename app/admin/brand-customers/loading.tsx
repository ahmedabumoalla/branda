import s from "@/components/admin/pages/brand-customers.module.css";
export default function BrandCustomersLoading() {
  return <section className={s.page} dir="rtl" aria-busy="true"><header className={s.heading}><h1>عملاء العلامات التجارية</h1></header><p className={s.muted} role="status">جارٍ تحميل العملاء</p></section>;
}
