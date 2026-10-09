"use client";

import { useState } from "react";
import { ArrowLeft, Building2, Check, ChevronLeft, ChevronRight, CircleDollarSign, Layers3, Search, Settings2, ShieldCheck } from "lucide-react";
import type { PlatformCafe, PlatformPlan } from "@/lib/platform/admin-data";
import s from "./brand-directory.module.css";

type Props = { cafes: PlatformCafe[]; plans: PlatformPlan[]; onManage: (cafe: PlatformCafe) => void; configError?: string };
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Riyadh" });
const pageSize = 12;

function BrandIdentity({ cafe, onManage }: { cafe: PlatformCafe; onManage: Props["onManage"] }) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  return <div className={s.identity}>
    <span className={s.avatar}>{cafe.logoUrl && failedLogo !== cafe.logoUrl
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={cafe.logoUrl} alt="" loading="lazy" width={44} height={44} onError={() => setFailedLogo(cafe.logoUrl ?? null)} />
      : <Building2 aria-hidden="true" />}</span>
    <div className={s.identityText}><button type="button" className={s.name} onClick={() => onManage(cafe)} aria-haspopup="dialog" aria-label={`فتح ملف ${cafe.name}`}><bdi>{cafe.name}</bdi></button>
      <bdi className={s.slug}>/{cafe.slug}</bdi><span className={s.account}><span>رقم الصيانة</span><bdi>{cafe.maintenanceAccountNumber || "غير مضاف"}</bdi></span>
    </div>
  </div>;
}

export function BrandPlanSummary({ cafe, plans }: { cafe: PlatformCafe; plans: PlatformPlan[] }) {
  const name = cafe.planName || plans.find(plan => plan.id === cafe.planId)?.name || (cafe.planId ? "باقة غير متاحة" : "بدون باقة");
  const validDate = cafe.planExpiresAt && Number.isFinite(Date.parse(cafe.planExpiresAt));
  return <div className={s.plan}>
    <strong>{name}</strong><span className={cafe.hasActivePlan ? s.planActive : s.planInactive}>{cafe.planId ? `اشتراك ${cafe.subscriptionStatus ?? (cafe.hasActivePlan ? "فعال" : "غير فعال")}` : "بدون اشتراك"}</span>
    <span className={s.expiry}>{validDate ? <>ينتهي في <time dateTime={cafe.planExpiresAt}>{date.format(new Date(cafe.planExpiresAt!))}</time></> : cafe.planId ? "بدون تاريخ انتهاء محدد" : "لم يتم تفعيل باقة"}</span>
  </div>;
}

function BrandActivity({ cafe }: { cafe: PlatformCafe }) {
  return <dl className={s.activity}>{[
    ["العروض", cafe.offersCount ?? 0], ["التوثيقات", cafe.experienceSubmissionsCount ?? 0],
    ["المكافآت", cafe.experienceRewardsCount ?? 0], ["الدعم", cafe.supportTicketsCount ?? 0],
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{number.format(Number(value))}</dd></div>)}</dl>;
}

function BrandStatus({ cafe }: { cafe: PlatformCafe }) {
  return <span className={cafe.status === "نشط" ? s.statusActive : s.statusStopped}><i aria-hidden="true" />{cafe.status}</span>;
}

function ManageButton({ cafe, onManage }: { cafe: PlatformCafe; onManage: Props["onManage"] }) {
  return <button type="button" className={s.manage} onClick={() => onManage(cafe)} aria-label={`إدارة ${cafe.name}`} aria-haspopup="dialog"><Settings2 aria-hidden="true" />إدارة<ChevronLeft aria-hidden="true" /></button>;
}

export function BrandDirectory({ cafes, plans, onManage, configError }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [subscription, setSubscription] = useState("all");
  const [sort, setSort] = useState("default");
  const [page, setPage] = useState(1);
  const active = cafes.filter(cafe => cafe.status === "نشط").length;
  const subscribed = cafes.filter(cafe => cafe.hasActivePlan).length;
  const revenue = cafes.reduce((sum, cafe) => sum + cafe.totalRevenue, 0);
  const term = query.trim().toLocaleLowerCase();
  const filtered = cafes.filter(cafe => {
    const matchesQuery = !term || [cafe.name, cafe.ownerName, cafe.ownerPhone, cafe.ownerEmail, cafe.slug, cafe.maintenanceAccountNumber].some(value => value?.toLocaleLowerCase().includes(term));
    return matchesQuery && (status === "all" || cafe.status === status) && (subscription === "all" || (subscription === "active" ? Boolean(cafe.hasActivePlan) : !cafe.hasActivePlan));
  });
  if (sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  if (sort === "products") filtered.sort((a, b) => (b.productsCount ?? 0) - (a.productsCount ?? 0));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const hasFilters = Boolean(query || status !== "all" || subscription !== "all");
  const reset = () => { setQuery(""); setStatus("all"); setSubscription("all"); setPage(1); };
  const stats = [
    { label: "إجمالي العلامات", value: cafes.length, hint: "علامة مسجلة على المنصة", icon: Building2 },
    { label: "العلامات النشطة", value: active, hint: `${number.format(cafes.length - active)} علامة موقوفة`, icon: Check },
    { label: "الاشتراكات الفعالة", value: subscribed, hint: `${number.format(cafes.length - subscribed)} بدون اشتراك فعال`, icon: Layers3 },
    { label: "إجمالي إيراد الطلبات", value: revenue, hint: "عبر جميع العلامات", icon: CircleDollarSign, currency: true },
  ];

  return <div className={s.directory} dir="rtl">
    <header className={s.header}><div><p className={s.eyebrow}><span aria-hidden="true" />إدارة المنصة</p><h1>العلامات التجارية</h1><p className={s.subtitle}>كل علامة بتفاصيلها من الاشتراك إلى الخدمات والصيانة</p></div><div className={s.headerNote}><ShieldCheck aria-hidden="true" /><span>إدارة موحدة<br /><strong>لكل علاماتك</strong></span></div></header>
    {configError ? <section className={s.error} role="alert"><Building2 aria-hidden="true" /><h2>تعذر تحميل العلامات التجارية</h2><p>{configError}</p><button type="button" className={s.manage} onClick={() => window.location.reload()}>إعادة المحاولة<ArrowLeft aria-hidden="true" /></button></section> : <>
      <section className={s.stats} aria-label="ملخص العلامات التجارية">{stats.map(({ label, value, hint, icon: Icon, currency }) => <article key={label}><div><span>{label}</span><Icon aria-hidden="true" /></div><strong><bdi>{number.format(value)}</bdi>{currency && <small>ريال</small>}</strong><p>{hint}</p></article>)}</section>
      <section className={s.panel} aria-labelledby="brand-directory-title">
        <div className={s.panelHeading}><div><h2 id="brand-directory-title">دليل العلامات</h2><p>راجع حالة العلامة وافتح ملفها لإدارة التفاصيل</p></div><span className={s.resultCount} role="status">{number.format(filtered.length)} علامة</span></div>
        <div className={s.toolbar}>
          <label className={s.search}><Search aria-hidden="true" /><span className={s.srOnly}>البحث عن علامة تجارية</span><input type="search" placeholder="ابحث عن علامة أو مالك أو رقم صيانة" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
          <label className={s.select}><span>الاشتراك</span><select aria-label="حالة الاشتراك" value={subscription} onChange={event => { setSubscription(event.target.value); setPage(1); }}><option value="all">كل الاشتراكات</option><option value="active">اشتراك فعال</option><option value="inactive">بدون اشتراك فعال</option></select></label>
          <label className={s.select}><span>الترتيب</span><select aria-label="ترتيب العلامات" value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="default">الترتيب الافتراضي</option><option value="name">حسب الاسم</option><option value="products">الأكثر منتجات</option></select></label>
        </div>
        <div className={s.filterRow}><div className={s.statusFilters} role="group" aria-label="حالة العلامة">{[["all", "كل العلامات", cafes.length], ["نشط", "النشطة", active], ["موقوف", "الموقوفة", cafes.length - active]].map(([value, label, count]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => { setStatus(String(value)); setPage(1); }}>{label}<span>{number.format(Number(count))}</span></button>)}</div>{hasFilters && <button type="button" className={s.reset} onClick={reset}>مسح التصفية</button>}</div>
        {visible.length > 0 ? <>
          <div className={s.desktopTable} role="region" aria-label="جدول العلامات التجارية" tabIndex={0}><table><caption className={s.srOnly}>العلامات التجارية وباقاتها ومؤشرات نشاطها</caption><thead><tr>{["العلامة ورقم الصيانة", "الباقة والاشتراك", "المنتجات", "النشاط والخدمات", "حالة العلامة", "الإدارة"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(cafe => <tr key={cafe.id}>
            <td><BrandIdentity cafe={cafe} onManage={onManage} /></td><td><BrandPlanSummary cafe={cafe} plans={plans} /></td><td><span className={s.productCount}>{number.format(cafe.productsCount ?? 0)}</span><span className={s.productLabel}>منتج</span></td><td><BrandActivity cafe={cafe} /></td><td><BrandStatus cafe={cafe} /></td><td><ManageButton cafe={cafe} onManage={onManage} /></td>
          </tr>)}</tbody></table></div>
          <div className={s.mobileCards}>{visible.map(cafe => <article key={cafe.id} className={s.mobileCard}><BrandIdentity cafe={cafe} onManage={onManage} /><div className={s.mobilePlan}><BrandPlanSummary cafe={cafe} plans={plans} /><div className={s.mobileProducts}><strong>{number.format(cafe.productsCount ?? 0)}</strong><span>منتج</span></div></div><BrandActivity cafe={cafe} /><footer><span>حالة العلامة <BrandStatus cafe={cafe} /></span><ManageButton cafe={cafe} onManage={onManage} /></footer></article>)}</div>
        </> : <div className={s.empty}><Search aria-hidden="true" /><h3>{cafes.length ? "لا توجد علامات مطابقة" : "لم تُضف علامات تجارية بعد"}</h3><p>{cafes.length ? "جرّب اسمًا آخر أو غيّر خيارات التصفية" : "ستظهر العلامات هنا عند تسجيلها على المنصة"}</p>{hasFilters && <button type="button" className={s.manage} onClick={reset}>عرض كل العلامات<ArrowLeft aria-hidden="true" /></button>}</div>}
        <footer className={s.pagination}><p role="status">{filtered.length ? `عرض ${number.format((currentPage - 1) * pageSize + 1)} إلى ${number.format(Math.min(currentPage * pageSize, filtered.length))} من ${number.format(filtered.length)} علامة` : "لا توجد نتائج"}</p><nav aria-label="صفحات العلامات"><button type="button" aria-label="الصفحة السابقة" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronRight aria-hidden="true" /></button><span>صفحة <bdi>{currentPage}</bdi> من <bdi>{pages}</bdi></span><button type="button" aria-label="الصفحة التالية" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronLeft aria-hidden="true" /></button></nav></footer>
      </section>
      <p className={s.footnote}><ShieldCheck aria-hidden="true" />حالة العلامة مستقلة عن صلاحية اشتراكها ويمكنك إدارة الاثنين من ملف العلامة</p>
    </>}
  </div>;
}
