import Link from "next/link";
import { ArrowUpLeft, BellRing, Search, ShieldCheck } from "lucide-react";
import { getPagerCustomerDirectory } from "@/lib/data/pager-customers";
import type { PagerBrand, PagerCustomer, PagerVisit } from "@/lib/pager/customer-types";
import { CustomerSections, PagerDate, pagerDirectoryUrl, pageNumber, scalar } from "@/components/pager/customer-directory-ui";
import s from "./brand-customers.module.css";

const base = "/admin/brand-customers";
const url = (params: Record<string, string | number | undefined> = {}) => pagerDirectoryUrl(base, { view: "pager", ...params });
const statusLabels: Record<string, string> = { waiting: "بانتظار الاستدعاء", ready: "تم الاستدعاء", received: "تم الاستلام", cancelled: "ملغي" };
export async function PagerBrandCustomersPage({ params }: { params: Record<string, string | string[] | undefined> }) {
  const brand = scalar(params.brand) || undefined, phone = brand ? scalar(params.phone) || undefined : undefined;
  const query = scalar(params.query).slice(0,120), page = pageNumber(params.page);
  const result = await getPagerCustomerDirectory({ cafeId: brand, phone, query, page });
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const columns = phone ? ["الفاتورة", "الحالة", "التسجيل", "الموظف", "الاستلام", "التقييم"] : ["العميل", "رقم الجوال", "مرات التسجيل", "أول تسجيل", "آخر تسجيل", "السجل"];
  return <section className={s.page} dir="rtl" aria-labelledby="pager-customers-heading">
    <header className={s.heading}><div><span className={s.eyebrow}><ShieldCheck aria-hidden="true" />خاص بالسوبر أدمن</span><h1 id="pager-customers-heading">عملاء العلامات التجارية</h1><p>أرقام عملاء البيجر وسجل تسجيلهم لدى كل علامة</p></div></header>
    <CustomerSections pager />
    <div className={s.sectionHeader}><div><h2>{phone ? "سجل عميل البيجر" : brand ? `عملاء ${result.brandName}` : "العملاء بحسب العلامة"}</h2><p>{phone ? <bdi>{phone}</bdi> : brand ? "اختر العميل لعرض سجل تسجيله في البيجر" : "اختر علامة لعرض عملائها ومرات تسجيلهم في البيجر"}</p></div>{brand && <Link className={s.button} href={phone ? url({ brand }) : url()}>{phone ? "العودة إلى العملاء" : "كل العلامات"}</Link>}</div>
    {!phone && <form className={`${s.filters} ${s.pagerFilters}`} action={base} aria-label="تصفية عملاء البيجر"><input type="hidden" name="view" value="pager" />{brand && <input type="hidden" name="brand" value={brand} />}<label className={s.field}>{brand ? "اسم العميل أو رقم الجوال" : "اسم العلامة"}<input name="query" defaultValue={query} maxLength={120} /></label><button type="submit" className={s.primary}><Search aria-hidden="true" />عرض النتائج</button>{query && <Link className={s.button} href={url({ brand })}>مسح البحث</Link>}</form>}
    {!result.rows.length ? <div className={s.empty}><BellRing aria-hidden="true" /><h3>لا توجد سجلات تطابق البحث</h3><p>تظهر هنا أرقام العملاء عند تسجيلهم في البيجر</p></div> : !brand ? <div className={s.brandGrid}>{(result.rows as PagerBrand[]).map(item => <Link key={item.id} className={`${s.brand} ${s.brandLink}`} href={url({ brand: item.id })}><div className={s.brandTop}><strong>{item.name}</strong><ArrowUpLeft aria-hidden="true" /></div><p><span className={s.brandCount}>{item.customers}</span>عميل</p><div className={s.brandFoot}><span>{item.registrations} تسجيل في البيجر</span><span>آخر تسجيل <PagerDate value={item.last_seen} /></span></div></Link>)}</div> : <section className={s.register} aria-label={phone ? "سجل عميل البيجر" : "عملاء البيجر"}><div className={s.tableWrap}><table className={s.table}><caption className={s.srOnly}>{phone ? "سجل تسجيل العميل في البيجر" : "عملاء البيجر لدى العلامة"}</caption><thead><tr>{columns.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{phone ? (result.rows as PagerVisit[]).map(item => <tr key={item.id}>
      <td data-label="الفاتورة"><bdi>{item.invoice_number}</bdi></td><td data-label="الحالة">{statusLabels[item.status] ?? item.status}</td><td data-label="التسجيل"><PagerDate value={item.created_at} /></td><td data-label="الموظف">{item.created_by}<span className={s.smallLine}>{item.created_station}</span></td><td data-label="الاستلام"><PagerDate value={item.received_at} /></td><td data-label="التقييم">{item.rating ? `${item.rating} / 5` : "بدون تقييم"}{item.notes && <p className={s.smallLine}>{item.notes}</p>}</td>
    </tr>) : (result.rows as PagerCustomer[]).map(item => <tr key={item.phone}>
      <td data-label="العميل"><strong>{item.full_name || "الاسم غير مسجل"}</strong></td><td data-label="رقم الجوال"><bdi>{item.phone}</bdi></td><td data-label="مرات التسجيل"><span className={s.number}>{item.registrations}</span></td><td data-label="أول تسجيل"><PagerDate value={item.first_seen} /></td><td data-label="آخر تسجيل"><PagerDate value={item.last_seen} /></td><td><Link className={s.rowButton} href={url({ brand, phone: item.phone })}>عرض السجل<ArrowUpLeft aria-hidden="true" /></Link></td>
    </tr>)}</tbody></table></div></section>}
    <div className={s.foot}><span>{result.total} نتيجة · صفحة {result.page + 1} من {pages}</span><nav className={s.pager} aria-label="صفحات النتائج">{result.page > 0 && <Link className={s.button} href={url({ brand, phone, query, page: result.page - 1 })}>السابق</Link>}{result.page + 1 < pages && <Link className={s.button} href={url({ brand, phone, query, page: result.page + 1 })}>التالي</Link>}</nav></div>
  </section>;
}
