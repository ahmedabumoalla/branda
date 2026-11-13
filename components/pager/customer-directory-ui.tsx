import Link from "next/link";
import { BellRing, CreditCard } from "lucide-react";
import s from "./customer-directory.module.css";

export function CustomerSections({ pager = false }: { pager?: boolean }) {
  return <nav className={s.tabs} aria-label="أنواع عملاء العلامات"><Link className={s.tab} href="/admin/brand-customers" aria-current={!pager ? "page" : undefined}><CreditCard size={20} aria-hidden="true" />عملاء الولاء</Link><Link className={s.tab} href="/admin/pager-customers" aria-current={pager ? "page" : undefined}><BellRing size={20} aria-hidden="true" />عملاء البيجر</Link></nav>;
}
export function pagerDirectoryUrl(base: string, params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") query.set(key, String(value));
  return `${base}?${query}`;
}
export function DirectoryPagination({ total, page, pageSize, base, filters }: { total: number; page: number; pageSize: number; base: string; filters: Record<string, string | number | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav className={s.pagination} aria-label="صفحات النتائج"><span className={s.muted}>{total} نتيجة · صفحة {page + 1} من {pages}</span><div className={s.tabs}>{page > 0 && <Link className={s.tab} href={pagerDirectoryUrl(base, { ...filters, page: page - 1 })}>السابق</Link>}{page + 1 < pages && <Link className={s.tab} href={pagerDirectoryUrl(base, { ...filters, page: page + 1 })}>التالي</Link>}</div></nav>;
}
export function PagerDate({ value }: { value: string | null }) {
  return value ? <time dateTime={value}>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value))}</time> : <span>—</span>;
}
export function scalar(value: string | string[] | undefined) { return typeof value === "string" ? value : ""; }
export function pageNumber(value: string | string[] | undefined) { const result = Number(scalar(value)); return Number.isInteger(result) && result >= 0 && result <= 100000 ? result : 0; }
