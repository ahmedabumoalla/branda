import type { Metadata } from "next";
import { VisitForm } from "@/components/representative/visit-form";
import styles from "@/components/representative/visits.module.css";
export const metadata: Metadata = { title: "تسجيل زيارة | برندة", description: "نموذج تسجيل زيارات فريق برندة للعلامات التجارية", robots: { index: false, follow: false } };
export default function VisitPage() {
  return <main className={styles.public} dir="rtl"><div className={styles.container}>
    <header className={styles.top}><span className={styles.wordmark}>برندة</span><small>فريق الزيارات الميدانية</small></header>
    <div className={styles.hero}><small>كل زيارة تفتح فرصة جديدة</small><h1>سجّل زيارتك</h1><p>عرّفنا بالعلامة واهتمامها وأرفق صور الزيارة وموقع الفرع</p></div>
    <VisitForm /><p className={styles.foot}>نموذج فريق برندة لا يحتاج تسجيل دخول</p>
  </div></main>;
}
