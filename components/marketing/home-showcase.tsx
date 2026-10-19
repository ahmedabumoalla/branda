"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowUpLeft, BellRing, Check, ChevronLeft, ChevronRight, Gift, LayoutGrid, Palette, RefreshCw, Sparkles } from "lucide-react";
import type { PublicHomeCatalog, PublicHomePartner, PublicHomePlan } from "@/lib/platform/public-home-catalog";
import styles from "./home-showcase.module.css";

const services = [
  { id: "menu", icon: LayoutGrid, label: "المنيو والمنتجات", eyebrow: "هويتك تستحق أكثر من قالب", title: "منيو يشبه علامتك وحدها", description: "لكل علامة شخصيتها ولمنيوها التصميم الذي يعبّر عنها من ترتيب الأقسام إلى عرض الصور وتفاصيل المنتجات", details: ["تصميم مخصص يعكس ألوان علامتك وروحها", "صور وأسعار وأقسام تديرها من لوحتك", "رابط مستقل تشاركه مع عملائك"], steps: ["هوية علامتك", "تصميم منيوك", "تجربة عميلك"], link: "#menu-designs", action: "شاهد تصاميم علاماتنا" },
  { id: "loyalty", icon: Gift, label: "الولاء والمكافآت", eyebrow: "كل عودة تستحق التقدير", title: "من زيارة عابرة إلى علاقة مستمرة", description: "قرّب عملاءك من علامتك ببطاقات ولاء تحمل هويتك وأختام ومكافآت تجعل للزيارة القادمة معنى", details: ["بطاقات ولاء بهوية علامتك", "إدارة الأختام والمكافآت", "إرسال جديدك لعملاء بطاقات الولاء"], steps: ["بطاقة العميل", "أختام الزيارات", "مكافأة مستحقة"], link: "#solutions", action: "تعرّف على تجربة الولاء" },
  { id: "offers", icon: Sparkles, label: "العروض", eyebrow: "مساحة لجديدك", title: "قدّم عرضك بطريقتك", description: "اجمع عروضك في مساحة تحمل هوية علامتك وحدّد تفاصيلها ومواعيدها لتظهر لعملائك في الوقت المناسب", details: ["صور ووصف واضح لكل عرض", "تحديد فترة العرض وإتاحته", "تحديث العروض من لوحة العلامة"], steps: ["فكرة العرض", "التفاصيل والمدة", "ظهور لعملائك"], link: "#pricing", action: "اكتشف الباقات" },
  { id: "pager", icon: BellRing, label: "نظام البيجر", eyebrow: "تفاصيل تشغيل أكثر ترتيبًا", title: "طلب جاهز وتجربة أكثر سلاسة", description: "تابع الطلبات من لوحة البيجر ونظّم مرحلة الاستلام حتى تبقى حالة الطلب واضحة لفريقك", details: ["إنشاء الطلب ومتابعة حالته", "إدارة الطلبات الجاهزة والاستلام", "ربط التجربة بهوية علامتك"], steps: ["تسجيل الطلب", "تجهيز الطلب", "الاستلام"], link: "#pricing", action: "استعرض الباقات المتاحة" },
  { id: "settings", icon: Palette, label: "هوية العلامة", eyebrow: "التفاصيل تحت إدارتك", title: "علامتك حاضرة في كل تفصيل", description: "اجمع بيانات علامتك وشعارها وإعداداتها في مكان واحد لتبقى تجربتك الرقمية متناسقة وسهلة الإدارة", details: ["إدارة شعار العلامة وبياناتها", "تحديث معلومات التواصل", "إعدادات واضحة داخل لوحة العلامة"], steps: ["شعارك", "بيانات علامتك", "حضور متناسق"], link: "#pricing", action: "اختر بداية علامتك" },
] as const;

export function HomeServiceExplorer({ title }: { title: string }) {
  const [selected, setSelected] = useState(0);
  const service = services[selected];
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowDown") next = (index + 1) % services.length;
    else if (event.key === "ArrowUp") next = (index + services.length - 1) % services.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = services.length - 1;
    else return;
    event.preventDefault(); setSelected(next);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#service-tab-${services[next].id}`)?.focus();
  }
  return <section id="features" className={styles.services} aria-labelledby="services-heading">
    <div className={styles.heading}><div><span className={styles.kicker}>خدمات برندة</span><h2 id="services-heading">{title}</h2></div><p>تفاصيل مختلفة لهدف واحد<br />تجربة تليق بعلامتك</p></div>
    <div className={styles.serviceWorkspace}>
      <div className={styles.serviceSidebar}><span className={styles.sidebarTitle}>اكتشف ما تصنعه برندة</span><div role="tablist" aria-label="خدمات برندة" aria-orientation="vertical">{services.map((item, index) => <button key={item.id} id={`service-tab-${item.id}`} type="button" role="tab" aria-selected={selected === index} aria-controls={`service-panel-${item.id}`} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={event => navigate(event, index)}><item.icon size={20} aria-hidden="true" /><span>{item.label}</span><ChevronLeft size={16} aria-hidden="true" /></button>)}</div><p>اختر الخدمة لتعرف تفاصيلها</p></div>
      <div id={`service-panel-${service.id}`} role="tabpanel" aria-labelledby={`service-tab-${service.id}`} tabIndex={0} className={styles.servicePanel}>
        <div className={styles.serviceEditorial}><span className={styles.kicker}>{service.eyebrow}</span><h3>{service.title}</h3><p>{service.description}</p><ul>{service.details.map(detail => <li key={detail}><Check size={17} aria-hidden="true" />{detail}</li>)}</ul><a href={service.link} className={styles.textLink}>{service.action}<ArrowLeft size={18} aria-hidden="true" /></a></div>
        <div className={styles.serviceDiagram} aria-label={`رحلة ${service.label}`}><span className={styles.diagramNumber} aria-hidden="true">0{selected + 1}</span><service.icon size={44} strokeWidth={1} aria-hidden="true" /><strong>{service.label}</strong><ol>{service.steps.map((step, index) => <li key={step}><span>0{index + 1}</span>{step}</li>)}</ol><small>تبدأ بهويتك وتكتمل بتجربة عميلك</small></div>
      </div>
    </div><p className={styles.sectionNote}>تختلف الخدمات المتاحة بحسب الباقة المختارة</p>
  </section>;
}

export function PartnerLogo({ partner }: { partner: PublicHomePartner }) {
  const [failed, setFailed] = useState(false);
  return partner.logoUrl && !failed
    ? <Image src={partner.logoUrl} alt={`شعار ${partner.name}`} width={112} height={72} unoptimized loading="lazy" onError={() => setFailed(true)} />
    : <span className={styles.brandMonogram} aria-hidden="true">{Array.from(partner.name.trim())[0] || "ب"}</span>;
}

function CatalogNotice({ failed, empty, refreshing, onRefresh, children }: { failed: boolean; empty: boolean; refreshing: boolean; onRefresh: () => void; children: string }) {
  if (!failed && !empty) return null;
  return <div className={styles.catalogNotice} role="status"><p>{failed ? empty ? "تعذر تحميل البيانات الآن" : "تعذر تحديث البيانات نعرض آخر معلومات متاحة" : children}</p>{failed ? <button type="button" onClick={onRefresh} disabled={refreshing}><RefreshCw size={16} aria-hidden="true" />{refreshing ? "جارٍ التحديث" : "إعادة المحاولة"}</button> : null}</div>;
}

export function HomePartners({ catalog, refreshing, onRefresh }: { catalog: PublicHomeCatalog; refreshing: boolean; onRefresh: () => void }) {
  return <section id="partners" className={`${styles.partners} ${styles.heroPartners}`} aria-labelledby="partners-heading"><div className={styles.heading}><div><span className={styles.kicker}>نعتز بكل علامة في رحلتنا</span><h2 id="partners-heading">شركاء النجاح</h2></div><p>هويات متنوعة وطموح يجمعنا<br />لكل علامة مكانها وقصتها</p></div><CatalogNotice failed={catalog.errors.partners} empty={!catalog.partners.length} refreshing={refreshing} onRefresh={onRefresh}>نستعد لعرض شركاء النجاح</CatalogNotice><div className={styles.partnerGrid}>{catalog.partners.map(partner => <article key={partner.id} className={styles.partner}><PartnerLogo key={partner.logoUrl} partner={partner} /><h3>{partner.name}</h3></article>)}</div></section>;
}

const number = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
function freeDuration(plan: PublicHomePlan) {
  if (plan.trialDays) return `لمدة ${number.format(plan.trialDays)} أيام`;
  return `لمدة ${number.format(plan.durationCount)} ${plan.durationUnit === "day" ? "يوم" : plan.durationUnit === "year" ? "سنة" : "شهر"}`;
}

export function HomePlanCard({ plan, preferredMonths = 12 }: { plan: PublicHomePlan; preferredMonths?: number }) {
  const [months, setMonths] = useState(preferredMonths);
  const duration = plan.durations.find(item => item.months === months) ?? plan.durations[0];
  const paid = plan.priceMonthly > 0;
  const annual = plan.durations.find(item => item.months === 12);
  const isAnnual = paid && duration?.months === 12;
  const annualSaving = annual && annual.discountAmount > 0 ? annual : null;
  const amount = duration?.totalAmount ?? plan.priceMonthly;
  return <article className={styles.plan} aria-labelledby={`plan-${plan.id}`} data-paid={paid} data-annual-saving={Boolean(isAnnual && annualSaving)}>
    <div className={styles.planTop}><span>{isAnnual && annualSaving ? <span className={styles.annualBadge}><Sparkles size={14} aria-hidden="true" />خصم سنوي {number.format(annualSaving.discountPercent)}٪</span> : paid ? "اشتراك علامتك" : plan.trialDays ? "مساحة للتجربة" : "باقة مجانية"}</span><span aria-hidden="true">↗</span></div>
    <h3 id={`plan-${plan.id}`}>{plan.name}</h3><p className={styles.planDescription}>{plan.description}</p>
    <div className={styles.priceContext}>{isAnnual ? "ما يعادل شهريًا عند الاشتراك السنوي" : paid ? "إجمالي المدة المختارة" : "بداية علامتك"}</div>
    <div className={styles.planPrice}><strong key={`${duration?.months}-${amount}`} className={styles.priceValue}>{paid ? number.format(isAnnual ? amount / 12 : amount) : "مجانًا"}</strong>{paid ? <span>{isAnnual ? "ريال / شهر" : "ريال سعودي"}</span> : null}{isAnnual && annualSaving ? <del className={styles.monthlyBefore} aria-label={`السعر الشهري دون خصم ${number.format(plan.priceMonthly)} ريال`}>{number.format(plan.priceMonthly)}</del> : null}</div>
    <p className={styles.billingNote}>{isAnnual ? <>تُدفع <strong>{number.format(amount)} ريال</strong> سنويًا{annualSaving ? <> بدل <del>{number.format(annualSaving.baseAmount)}</del></> : null}</> : paid ? `إجمالي الاشتراك ${duration?.label ?? "لمدة شهر"}` : freeDuration(plan)}</p>
    {paid && duration ? <label className={styles.durationLabel} htmlFor={`duration-${plan.id}`}>مدة الاشتراك<select id={`duration-${plan.id}`} value={duration.months} onChange={event => setMonths(Number(event.target.value))}>{plan.durations.map(option => <option key={option.months} value={option.months}>{option.label}</option>)}</select></label> : <p className={styles.freeNote}>{plan.freeAfterTrial ? "تستمر الباقة مجانًا بعد التجربة" : plan.trialDays ? "جرّب الخدمات قبل اختيار اشتراكك" : "وفق مدة الباقة وشروط تفعيلها"}</p>}
    {isAnnual && annualSaving ? <p className={styles.annualSaving}><Gift size={19} aria-hidden="true" /><span>وفّر <strong>{number.format(annualSaving.discountAmount)} ريال</strong> في السنة<small>نفس الخدمات بقيمة أفضل</small></span></p> : !isAnnual && annualSaving ? <button type="button" className={styles.annualNudge} onClick={() => setMonths(12)}>اختر السنوي ووفّر {number.format(annualSaving.discountAmount)} ريال<ArrowLeft size={17} aria-hidden="true" /></button> : <div className={styles.savingSpace} aria-hidden="true" />}
    <ul className={styles.planFeatures}>{plan.features.map(feature => <li key={feature.id}><Check size={17} aria-hidden="true" />{feature.label}</li>)}{plan.maxProductsMonthly !== null ? <li><Check size={17} aria-hidden="true" />حتى {number.format(plan.maxProductsMonthly)} منتج شهريًا</li> : null}{plan.maxBranches !== null ? <li><Check size={17} aria-hidden="true" />{number.format(plan.maxBranches)} فرع</li> : null}</ul>
    <Link className={styles.planLink} href="/register">{isAnnual ? "ابدأ عامًا مع برندة" : paid ? "ابدأ مع برندة" : "اكتشف الباقة"}<ArrowUpLeft size={18} aria-hidden="true" /></Link>
  </article>;
}

export function HomePricing({ catalog, refreshing, onRefresh }: { catalog: PublicHomeCatalog; refreshing: boolean; onRefresh: () => void }) {
  const [preferredMonths, setPreferredMonths] = useState(12);
  const maxDiscount = Math.max(0, ...catalog.plans.flatMap(plan => plan.durations.filter(duration => duration.months === 12 && duration.discountAmount > 0).map(duration => duration.discountPercent)));
  return <section id="pricing" className={styles.pricing} aria-labelledby="pricing-heading"><div className={styles.heading}><div><span className={styles.kicker}>بداية مناسبة لطموحك</span><h2 id="pricing-heading">اختر مساحة نمو علامتك</h2></div><p>عام كامل لبناء حضورك<br />وبداية تناسب طموح علامتك</p></div>
    {catalog.plans.length ? <div className={styles.billingBar}><div><strong>خطّط لعام علامتك القادم</strong><p>{maxDiscount > 0 ? `وفّر حتى ${number.format(maxDiscount)}٪ مع الاشتراك السنوي في الباقات المشمولة` : "قارن المدد واختر ما يناسب علامتك"}</p></div><div className={styles.billingToggle} role="group" aria-label="مقارنة الاشتراك الشهري والسنوي"><button type="button" aria-pressed={preferredMonths === 1} onClick={() => setPreferredMonths(1)}>شهري</button><button type="button" aria-pressed={preferredMonths === 12} onClick={() => setPreferredMonths(12)}>سنوي{maxDiscount > 0 ? <span>وفّر حتى {number.format(maxDiscount)}٪</span> : null}</button></div></div> : null}
    <CatalogNotice failed={catalog.errors.plans} empty={!catalog.plans.length} refreshing={refreshing} onRefresh={onRefresh}>لا توجد باقات متاحة حاليًا تواصل معنا لمساعدتك</CatalogNotice><div className={styles.planGrid}>{catalog.plans.map(plan => <HomePlanCard key={`${plan.id}-${preferredMonths}`} plan={plan} preferredMonths={preferredMonths} />)}</div><p className={styles.sectionNote}>الأسعار بالريال السعودي ويُدفع الإجمالي السنوي دفعة واحدة مع عرض ما يعادله شهريًا للمقارنة</p></section>;
}

export function HomeMenuDesigns({ menus }: { menus: (PublicHomePartner & { href: string })[] }) {
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const pages = Math.ceil(menus.length / 3);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  const visible = menus.slice(currentPage * 3, currentPage * 3 + 3);
  if (!menus.length) return null;
  return <section id="menu-designs" className={styles.menuDesigns} aria-labelledby="menu-designs-heading"><div className={styles.designHeading}><div><span className={styles.kicker}>تصاميم حقيقية لعلامات حقيقية</span><h2 id="menu-designs-heading">هويات مختلفة<br /><em>وكل منيو له شخصيته</em></h2></div><p>هذه منيوهات مفعّلة في برندة<br />استكشف كيف تتحول هوية كل علامة إلى تجربة خاصة بها</p></div><div className={styles.menuGallery}>{visible.map(menu => <article className={styles.menuDesign} key={menu.id}><div className={styles.device}><div className={styles.deviceBar} aria-hidden="true"><span /><span /><span /></div><div className={styles.menuViewport}>{!loaded[menu.id] ? <div className={styles.previewLoading} aria-hidden="true"><LayoutGrid size={24} strokeWidth={1} /><span>جارٍ تحميل تصميم {menu.name}</span></div> : null}<iframe src={`${menu.href}?showcase=1`} title={`معاينة تصميم منيو ${menu.name}`} loading="eager" tabIndex={-1} aria-hidden="true" referrerPolicy="same-origin" onLoad={() => setLoaded(previous => ({ ...previous, [menu.id]: true }))} /></div><Link href={menu.href} prefetch={false} target="_blank" rel="noopener noreferrer" className={styles.menuOpen}>استكشف المنيو<ArrowUpLeft size={18} aria-hidden="true" /><span className={styles.srOnly}> {menu.name} في نافذة جديدة</span></Link></div><div className={styles.menuIdentity}><PartnerLogo key={menu.logoUrl} partner={menu} /><div><h3>{menu.name}</h3><span>تصميم يحمل هوية العلامة</span></div></div></article>)}</div>{pages > 1 ? <div className={styles.galleryPagination}><button type="button" onClick={() => { setLoaded({}); setPage(currentPage - 1); }} disabled={currentPage === 0} aria-label="التصاميم السابقة"><ChevronRight size={20} aria-hidden="true" /></button><span role="status">{number.format(currentPage + 1)} / {number.format(pages)}</span><button type="button" onClick={() => { setLoaded({}); setPage(currentPage + 1); }} disabled={currentPage === pages - 1} aria-label="التصاميم التالية"><ChevronLeft size={20} aria-hidden="true" /></button></div> : null}</section>;
}
