import Link from "next/link";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerPagerReviews } from "@/lib/data/pager-customers";
import { GoogleReviewSettings } from "@/components/pager/google-review-settings";
import { DirectoryPagination, PagerDate, pageNumber, scalar } from "@/components/pager/customer-directory-ui";
import s from "@/components/pager/customer-directory.module.css";
export const dynamic = "force-dynamic";
const base = "/dashboard/pager/reviews";
export default async function PagerReviewsPage({ searchParams }: { searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  if (!(await getOwnerFeatureCodes()).includes("pager")) return <DashboardFeatureBlockedState title="تقييمات البيجر" />;
  const params=await searchParams, query=scalar(params.query).slice(0,120), rawRating=Number(scalar(params.rating)), rating=Number.isInteger(rawRating)&&rawRating>=1&&rawRating<=5 ? rawRating : undefined;
  const data=await getOwnerPagerReviews({query,rating,page:pageNumber(params.page)});
  return <section className={s.page} dir="rtl"><header className={s.heading}><p>{data.brandName}</p><h1>تقييمات البيجر</h1><p>آراء العملاء بعد الاستلام مع رقم الجوال والفاتورة بتوقيت الرياض</p></header>
    <div className={`${s.panel} ${s.metrics}`}><span><strong>{data.total}</strong>تقييم مطابق</span><span><strong>{data.average == null ? "—" : `${data.average} / 5`}</strong>متوسط التقييمات المعروضة</span></div>
    <form className={s.filters} action={base}><label>الجوال أو الفاتورة أو الملاحظة<input className={s.input} name="query" defaultValue={query} maxLength={120}/></label><label>عدد النجوم<select className={s.input} name="rating" defaultValue={rating ?? ""}><option value="">كل التقييمات</option>{[5,4,3,2,1].map(value=><option key={value} value={value}>{value} من 5</option>)}</select></label><button className={s.button}>عرض النتائج</button>{(query || rating) && <Link className={s.link} href={base}>مسح الفلاتر</Link>}</form>
    {data.rows.length ? <div className={s.tableWrap}><table className={s.table}><thead><tr>{["العميل","الجوال","الفاتورة","التقييم","الملاحظة","وقت التقييم"].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data.rows.map(row=><tr key={row.id}><td>{row.full_name || "الاسم غير مسجل"}</td><td><bdi>{row.phone}</bdi></td><td><bdi>{row.invoice_number}</bdi></td><td>{row.rating} / 5</td><td><p>{row.notes || "بدون ملاحظة"}</p></td><td><PagerDate value={row.rated_at}/></td></tr>)}</tbody></table></div> : <p className={s.empty}>لا توجد تقييمات تطابق البحث</p>}
    <DirectoryPagination {...data} base={base} filters={{query,rating}} />
    {data.canManage && <GoogleReviewSettings initialUrl={data.googleReviewUrl}/>}
  </section>;
}
