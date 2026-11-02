import Link from "next/link";
import { redirect } from "next/navigation";
import { VisitForm, VisitShareLinks } from "@/components/representative/visit-form";
import styles from "@/components/representative/visits.module.css";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { getRepresentativeVisits } from "@/lib/data/representative-visits";
import { VISIT_SERVICES } from "@/lib/representative-visits/schema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminRepresentativesRoutePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  try { await requirePlatformAdmin(); } catch { redirect("/login"); }
  const params = await searchParams;
  let result: Awaited<ReturnType<typeof getRepresentativeVisits>> | null = null;
  try { result = await getRepresentativeVisits(Number(params.page || 1)); } catch { /* Show an explicit retry state */ }
  return <main className={styles.admin} dir="rtl">
    <header className={styles.hero}>
      <small>إدارة المناديب</small>
      <h1>الزيارات الميدانية</h1>
      <p>سجّل بيانات الزيارة وصورها واهتمام العلامة بالخدمات وأرسل رابط النموذج للمناديب ليعبّئوه بدون تسجيل دخول</p>
      <VisitShareLinks />
    </header>
    <div className={styles.adminColumns}>
      <VisitForm admin />
      <section className={styles.history} aria-label="سجل الزيارات">
        <div className={styles.historyHeading}><h2>سجل الزيارات</h2><span>{result ? `${result.count} زيارة` : ""}</span></div>
        {!result ? <div className={styles.empty}>تعذر تحميل سجل الزيارات<br /><Link href="/admin/representatives">إعادة المحاولة</Link></div> : !result.visits.length ? <div className={styles.empty}>لا توجد زيارات في هذه الصفحة<br />تظهر الزيارات هنا بعد إرسال النموذج</div> : result.visits.map(visit => <details className={styles.entry} key={visit.id}>
          <summary>
            <div className={styles.entryTop}><strong>{visit.brandName}</strong><span className={styles.badge}>{visit.interest === "interested" ? "مهتم" : "غير مهتم"}</span></div>
            <div className={styles.entryMeta}><span>المندوب: {visit.representativeName}</span><time dateTime={visit.createdAt}>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(visit.createdAt))} بتوقيت السعودية</time></div>
            <span className={styles.entryHint}>عرض الصور وتفاصيل الزيارة +</span>
          </summary>
          <div className={styles.entryBody}>
            {visit.services.length > 0 && <p>الخدمات: {visit.services.map(service => VISIT_SERVICES[service as keyof typeof VISIT_SERVICES] || service).join(" / ")}</p>}
            {visit.otherService && <p>الخدمة الأخرى: {visit.otherService}</p>}
            {visit.managerPhone && <p>رقم المسؤول: <a dir="ltr" href={`tel:${visit.managerPhone}`}>{visit.managerPhone}</a></p>}
            {visit.ownerPhone && <p>رقم المالك: <a dir="ltr" href={`tel:${visit.ownerPhone}`}>{visit.ownerPhone}</a></p>}
            <a href={visit.mapsUrl} target="_blank" rel="noopener noreferrer">فتح موقع الفرع في قوقل ماب ↗</a>
            <div className={styles.images}>{[{ url: visit.photo, label: "صورة العلامة" }, { url: visit.menuPhoto, label: "صورة المنيو" }].filter(item => item.url).map(item => <a key={item.label} href={item.url!} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url!} alt={item.label} loading="lazy" />{item.label}
            </a>)}</div>
          </div>
        </details>)}
        {result && result.count > 20 && <nav className={styles.pagination} aria-label="صفحات الزيارات">
          {result.page > 1 ? <Link href={`/admin/representatives?page=${result.page - 1}`}>السابق</Link> : <span />}
          <span>صفحة {result.page}</span>
          {result.page * 20 < result.count && <Link href={`/admin/representatives?page=${result.page + 1}`}>التالي</Link>}
        </nav>}
      </section>
    </div>
  </main>;
}
