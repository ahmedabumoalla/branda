import Link from "next/link";
import { Building2, ChevronLeft } from "lucide-react";
import { getPagerCustomerDirectory } from "@/lib/data/pager-customers";
import type { PagerBrand, PagerCustomer, PagerVisit } from "@/lib/pager/customer-types";
import { CustomerSections, DirectoryPagination, PagerDate, pagerDirectoryUrl, pageNumber, scalar } from "@/components/pager/customer-directory-ui";
import s from "@/components/pager/customer-directory.module.css";

export const dynamic = "force-dynamic";
const base = "/admin/pager-customers";
const statusLabels: Record<string, string> = { waiting: "بانتظار الاستدعاء", ready: "تم الاستدعاء", received: "تم الاستلام", cancelled: "ملغي" };
export default async function PagerCustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const brand = scalar(params.brand) || undefined, phone = scalar(params.phone) || undefined, query = scalar(params.query).slice(0,120), page = pageNumber(params.page);
  const result = await getPagerCustomerDirectory({ cafeId: brand, phone, query, page });
  return <section className={s.page} dir="rtl"><CustomerSections pager /><header className={s.heading}><p>خاص بالسوبر أدمن</p><h1>{phone ? "سجل عميل البيجر" : brand ? `عملاء ${result.brandName}` : "عملاء البيجر"}</h1><p>{phone ? <bdi>{phone}</bdi> : "أرقام العملاء وزياراتهم إلى البيجر مرتبة حسب العلامة التجارية"}</p>{brand && <Link className={s.link} href={phone ? pagerDirectoryUrl(base, { brand }) : base}>{phone ? `العودة إلى عملاء ${result.brandName}` : "كل العلامات"}</Link>}</header>
    {!phone && <form className={s.filters} action={base}>{brand && <input type="hidden" name="brand" value={brand} />}<label>{brand ? "اسم العميل أو رقم الجوال" : "اسم العلامة"}<input className={s.input} name="query" defaultValue={query} maxLength={120} /></label><button className={s.button}>بحث</button>{query && <Link className={s.link} href={pagerDirectoryUrl(base,{brand})}>مسح البحث</Link>}</form>}
    {!result.rows.length ? <p className={s.empty}>لا توجد سجلات تطابق البحث</p> : !brand ? <div className={s.grid}>{(result.rows as PagerBrand[]).map(item => <Link key={item.id} className={`${s.panel} ${s.brand}`} href={pagerDirectoryUrl(base,{brand:item.id})}><Building2 aria-hidden="true" /><h2>{item.name}</h2><div className={s.metrics}><span><strong>{item.customers}</strong>عميل</span><span><strong>{item.registrations}</strong>تسجيل في البيجر</span></div><p className={s.muted}>آخر تسجيل <PagerDate value={item.last_seen} /></p><span className={s.tabs}>عرض العملاء <ChevronLeft size={18} aria-hidden="true" /></span></Link>)}</div> : <div className={s.tableWrap}><table className={s.table}><thead><tr>{(phone ? ["الفاتورة","الحالة","التسجيل","الموظف","الاستلام","التقييم"] : ["العميل","رقم الجوال","مرات التسجيل","أول تسجيل","آخر تسجيل","السجل"]).map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{phone ? (result.rows as PagerVisit[]).map(item=><tr key={item.id}><td><bdi>{item.invoice_number}</bdi></td><td>{statusLabels[item.status] ?? item.status}</td><td><PagerDate value={item.created_at}/></td><td>{item.created_by}<p className={s.muted}>{item.created_station}</p></td><td><PagerDate value={item.received_at}/></td><td>{item.rating ? `${item.rating} / 5` : "بدون تقييم"}{item.notes && <p>{item.notes}</p>}</td></tr>) : (result.rows as PagerCustomer[]).map(item=><tr key={item.phone}><td>{item.full_name || "الاسم غير مسجل"}</td><td><bdi>{item.phone}</bdi></td><td>{item.registrations}</td><td><PagerDate value={item.first_seen}/></td><td><PagerDate value={item.last_seen}/></td><td><Link className={s.link} href={pagerDirectoryUrl(base,{brand,phone:item.phone})}>عرض السجل</Link></td></tr>)}</tbody></table></div>}
    <DirectoryPagination {...result} base={base} filters={{brand,phone,query}} />
  </section>;
}
