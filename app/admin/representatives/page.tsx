import Link from "next/link";
import { redirect } from "next/navigation";
import { VisitForm, VisitShareLinks } from "@/components/representative/visit-form";
import { VisitDialog } from "@/components/representative/visit-dialog";
import { MapPin } from "lucide-react";
import styles from "@/components/representative/admin-visits.module.css";
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
  return <main className={styles.page} dir="rtl">
    <header className={styles.header}><div>
      <small>إدارة المناديب</small>
      <h1>الزيارات الميدانية</h1>
      <p>سجّل بيانات الزيارة وصورها واهتمام العلامة بالخدمات وأرسل رابط النموذج للمناديب ليعبّئوه بدون تسجيل دخول</p>
      </div><VisitDialog primary label="تسجيل زيارة" title="تسجيل زيارة جديدة"><VisitForm admin /></VisitDialog>
    </header>
    <div className={styles.sharePanel}><VisitShareLinks /></div>
      <section className={styles.history} aria-label="سجل الزيارات">
        <div className={styles.historyHeader}><div><h2>سجل الزيارات</h2><p>الأحدث أولًا بتوقيت السعودية</p></div><span className={styles.count}>{result && <><strong>{result.count}</strong> زيارة مسجلة</>}</span></div>
        {!result ? <div className={styles.empty}>تعذر تحميل سجل الزيارات<br /><Link href="/admin/representatives">إعادة المحاولة</Link></div> : !result.visits.length ? <div className={styles.empty}>لا توجد زيارات في هذه الصفحة<br />تظهر الزيارات هنا بعد إرسال النموذج</div> : <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="جدول الزيارات قابل للتمرير أفقيًا">
          <table className={styles.table} aria-label="سجل الزيارات الميدانية"><thead><tr>{["العلامة التجارية", "المندوب", "نتيجة الزيارة", "الخدمات المطلوبة", "تاريخ الزيارة", "الموقع", "التفاصيل"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{result.visits.map(visit => <tr key={visit.id}>
            <td className={styles.brand}>{visit.brandName}</td><td>{visit.representativeName}</td>
            <td><span className={`${styles.badge} ${visit.interest !== "interested" ? styles.notInterested : ""}`}>{visit.interest === "interested" ? "مهتم" : "غير مهتم"}</span></td>
            <td><div className={styles.services}>{visit.services.length ? visit.services.map(service => <span key={service}>{VISIT_SERVICES[service as keyof typeof VISIT_SERVICES] || service}</span>) : "—"}</div></td>
            <td><time dateTime={visit.createdAt}>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(visit.createdAt))}<small>{new Intl.DateTimeFormat("ar-SA", { timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(visit.createdAt))}</small></time></td>
            <td><a className={styles.map} href={visit.mapsUrl} target="_blank" rel="noopener noreferrer"><MapPin size={15} aria-hidden="true" />موقع الفرع</a></td>
            <td><VisitDialog title={`زيارة ${visit.brandName}`} label="عرض التفاصيل"><div className={styles.details}>
              <dl><div><dt>العلامة التجارية</dt><dd>{visit.brandName}</dd></div><div><dt>المندوب</dt><dd>{visit.representativeName}</dd></div>
                <div><dt>رقم المسؤول</dt><dd>{visit.managerPhone ? <a dir="ltr" href={`tel:${visit.managerPhone}`}>{visit.managerPhone}</a> : "غير مضاف"}</dd></div>
                <div><dt>رقم المالك</dt><dd>{visit.ownerPhone ? <a dir="ltr" href={`tel:${visit.ownerPhone}`}>{visit.ownerPhone}</a> : "غير مضاف"}</dd></div>
                {visit.otherService && <div><dt>الخدمة الأخرى</dt><dd>{visit.otherService}</dd></div>}
              </dl>
            <a href={visit.mapsUrl} target="_blank" rel="noopener noreferrer">فتح موقع الفرع في قوقل ماب ↗</a>
            <div className={styles.photos}>{[{ url: visit.photo, label: "صورة العلامة" }, { url: visit.menuPhoto, label: "صورة المنيو" }].filter(item => item.url).map(item => <a key={item.label} href={item.url!} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url!} alt={item.label} loading="lazy" />{item.label}
            </a>)}</div>
            {!visit.photo && <p className={styles.photoMissing}>تعذر تحميل صورة العلامة حدّث الصفحة للمحاولة مجددًا</p>}
          </div></VisitDialog></td>
          </tr>)}</tbody></table></div>}
        {result && result.count > 20 && <nav className={styles.pagination} aria-label="صفحات الزيارات">
          {result.page > 1 ? <Link href={`/admin/representatives?page=${result.page - 1}`}>السابق</Link> : <span />}
          <span>صفحة {result.page}</span>
          {result.page * 20 < result.count && <Link href={`/admin/representatives?page=${result.page + 1}`}>التالي</Link>}
        </nav>}
      </section>
  </main>;
}
