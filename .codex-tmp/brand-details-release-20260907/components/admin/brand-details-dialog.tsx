"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowUpLeft, BarChart3, Building2, Check, ChevronLeft, CircleDollarSign, Copy, CreditCard, ExternalLink, Gift, Globe, Headphones, Layers3, MessageSquareText, Package, Phone, Search, ShieldCheck, ShoppingBag, SlidersHorizontal, TicketCheck, UserRound, Users, Utensils, X } from "lucide-react";
import type { PlatformCafe, PlatformPlan } from "@/lib/platform/admin-data";
import type { EffectiveBrandFeatureAccess } from "@/lib/platform/feature-access";
import type { PlatformFeatureId } from "@/lib/platform/feature-registry";
import { getCafeDisplayDomain, getCafePublicUrl } from "@/lib/platform/cafe-domain";
import { formatSar } from "@/lib/format";
import { StandaloneMenuControl } from "./standalone-menu-control";
import s from "./brand-details.module.css";

type Section = "account" | "plan" | "services" | "menu" | "analytics" | "support";
const sections = [
  { id: "account", title: "بيانات العلامة", description: "المالك، التواصل وروابط العلامة", icon: Building2 },
  { id: "plan", title: "الباقة والاشتراك", description: "الباقة الحالية، المدة والتجديدات", icon: CreditCard },
  { id: "services", title: "الخدمات والصلاحيات", description: "الخدمات المتاحة واستثناءات العلامة", icon: SlidersHorizontal },
  { id: "menu", title: "المنيو المستقل", description: "النشر والرابط المباشر للمنيو", icon: Utensils },
  { id: "analytics", title: "الأداء والإحصاءات", description: "المنتجات، الطلبات وتفاعل العملاء", icon: BarChart3 },
  { id: "support", title: "الدعم والمستندات", description: "الصيانة، الدعم وبيانات النشاط", icon: Headphones },
] as const;

function Dialog({ title, children, close, detail = false }: { title: string; children: ReactNode; close: () => void; detail?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const focused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      document.documentElement.style.overflow = rootOverflow;
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={`${s.dialog} ${detail ? s.detailDialog : ""}`} dir="rtl" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={s.dialogSurface}>
      <header className={s.dialogBar}>
        <span id={titleId}>{title}</span>
        <button type="button" className={s.iconButton} onClick={close} aria-label={detail ? "العودة إلى ملخص العلامة" : "إغلاق تفاصيل العلامة"} autoFocus>
          {detail ? <ArrowLeft aria-hidden="true" /> : <X aria-hidden="true" />}
        </button>
      </header>
      {children}
    </div>
  </dialog>;
}

function DataList({ items }: { items: [string, string | number | null | undefined][] }) {
  return <dl className={s.dataList}>{items.map(([label, value]) => <div key={label}>
    <dt>{label}</dt><dd dir="auto">{value === null || value === undefined || value === "" ? <span className={s.missing}>غير مضاف</span> : value}</dd>
  </div>)}</dl>;
}

function SectionHeading({ icon: Icon, children }: { icon: typeof Building2; children: ReactNode }) {
  return <h3 className={s.groupHeading}><Icon aria-hidden="true" />{children}</h3>;
}

type Props = {
  cafe: PlatformCafe;
  plans: PlatformPlan[];
  services: ReactNode;
  planPending: boolean;
  updatePlan: (id: string, planId: string) => void;
  close: () => void;
};

export function BrandDetailsDialog({ cafe, plans, services, planPending, updatePlan, close }: Props) {
  const [section, setSection] = useState<Section | null>(null);
  const [nextPlan, setNextPlan] = useState(cafe.planId || "");
  const [copyMessage, setCopyMessage] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  async function copyAccount() {
    try {
      await navigator.clipboard.writeText(cafe.maintenanceAccountNumber || "");
      setCopyMessage("تم نسخ رقم الصيانة");
    } catch { setCopyMessage("تعذر النسخ، يمكنك تحديد الرقم ونسخه يدويًا"); }
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyMessage(""), 3500);
  }
  const planName = cafe.planName || plans.find(plan => plan.id === cafe.planId)?.name || "بدون باقة";
  const domainSettings = { customDomain: cafe.customDomain, domainStatus: cafe.customDomainStatus || "غير مربوط", purchasedDomain: cafe.purchasedDomain, purchasedDomainStatus: cafe.purchasedDomainStatus || "غير مربوط" };
  const publicUrl = getCafePublicUrl(cafe.slug, { settings: domainSettings });
  const selectedSection = sections.find(item => item.id === section);
  const stats = [
    { label: "المنتجات", value: cafe.productsCount ?? 0, icon: Package },
    { label: "العملاء", value: cafe.customersCount ?? 0, icon: Users },
    { label: "الطلبات", value: cafe.totalOrders, icon: ShoppingBag },
    { label: "إيراد الطلبات", value: formatSar(cafe.totalRevenue), icon: CircleDollarSign },
    { label: "العروض", value: cafe.offersCount ?? 0, icon: Gift },
    { label: "التوثيقات", value: cafe.experienceSubmissionsCount ?? 0, icon: MessageSquareText },
    { label: "المكافآت", value: cafe.experienceRewardsCount ?? 0, icon: TicketCheck },
  ];
  return <>
    <Dialog title="ملف العلامة التجارية" close={close}>
      <div className={s.overview}>
        <div className={s.identity}>
          <div className={s.avatar}>{cafe.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={cafe.logoUrl} alt={cafe.name} /> : <Building2 aria-hidden="true" />}</div>
          <div className={s.identityText}>
            <p className={s.eyebrow}>{cafe.businessCategoryLabel || "علامة تجارية"}</p>
            <h2 dir="auto">{cafe.name}</h2>
            <div className={s.identityMeta}><span className={cafe.status === "نشط" ? s.active : s.inactive}><i />{cafe.status}</span><span>{planName}</span></div>
          </div>
          <a href={publicUrl} target="_blank" rel="noreferrer" className={s.visitLink}>زيارة العلامة <ArrowUpLeft aria-hidden="true" /></a>
        </div>
        <div className={s.summary}>
          <div><Package aria-hidden="true" /><span><strong>{cafe.productsCount ?? 0}</strong><small>منتج في المنيو</small></span></div>
          <div><Users aria-hidden="true" /><span><strong>{cafe.customersCount ?? 0}</strong><small>عميل مسجل</small></span></div>
          <div><CircleDollarSign aria-hidden="true" /><span><strong>{formatSar(cafe.totalRevenue)}</strong><small>إجمالي إيراد الطلبات</small></span></div>
        </div>
        <div className={s.sectionLabel}><h3>إدارة العلامة</h3><span>اختر قسمًا لعرض التفاصيل والتحكم</span></div>
        <div className={s.actionGrid}>{sections.map(({ id, title, description, icon: Icon }) => <button type="button" key={id} className={s.actionTile}
          aria-haspopup="dialog" onClick={() => setSection(id)}>
          <span className={s.tileIcon}><Icon aria-hidden="true" /></span><span className={s.tileText}><strong>{title}</strong><small>{description}</small></span><ChevronLeft className={s.chevron} aria-hidden="true" />
        </button>)}</div>
        <footer className={s.overviewFooter}><span>حساب الصيانة <b dir="ltr">{cafe.maintenanceAccountNumber || "غير مضاف"}</b></span>
          <button type="button" className={s.textButton} disabled={!cafe.maintenanceAccountNumber} onClick={copyAccount}><Copy aria-hidden="true" />نسخ الرقم</button>
        </footer>
        <p className={s.liveMessage} role="status">{copyMessage}</p>
      </div>
    </Dialog>
    {section && selectedSection && <Dialog key={section} title={`${selectedSection.title} · ${cafe.name}`} close={() => setSection(null)} detail>
      <div className={s.panelBody}>
        <div className={s.panelIntro}><span className={s.tileIcon}><selectedSection.icon aria-hidden="true" /></span><div><h2>{selectedSection.title}</h2><p>{selectedSection.description}</p></div></div>
        {section === "account" && <>
          <SectionHeading icon={UserRound}>بيانات الحساب والمالك</SectionHeading>
          <DataList items={[["اسم العلامة", cafe.name], ["الرابط المختصر", cafe.slug], ["اسم المالك", cafe.ownerName], ["البريد الإلكتروني", cafe.ownerEmail], ["بريد الدخول", cafe.ownerLoginEmail], ["الوصول لكلمة المرور", cafe.passwordAccessNote], ["جوال المالك", cafe.ownerPhone], ["تاريخ الانضمام", cafe.createdAt]]} />
          <SectionHeading icon={Globe}>الروابط والنطاقات</SectionHeading>
          <a className={s.linkCard} href={publicUrl} target="_blank" rel="noreferrer"><Globe aria-hidden="true" /><span><strong>الفرع الإلكتروني</strong><small dir="ltr">{publicUrl}</small></span><ExternalLink aria-hidden="true" /></a>
          <DataList items={[["الدومين المعروض", getCafeDisplayDomain(cafe.slug, domainSettings)], ["الدومين المخصص", cafe.customDomain], ["حالته", cafe.customDomainStatus], ["الدومين المشترى", cafe.purchasedDomain], ["حالة الربط", cafe.purchasedDomainStatus]]} />
        </>}
        {section === "plan" && <>
          <div className={s.planCard}><CreditCard aria-hidden="true" /><span>الباقة الحالية<strong>{planName}</strong></span><span className={cafe.hasActivePlan ? s.active : s.inactive}>{cafe.hasActivePlan ? "اشتراك فعّال" : "غير فعّال"}</span></div>
          <DataList items={[["تاريخ البداية", cafe.planStartedAt], ["تاريخ الانتهاء", cafe.planExpiresAt], ["المدة المتبقية", cafe.planRemainingDays == null ? "غير محددة" : `${cafe.planRemainingDays} يوم`], ["عدد الاشتراكات", cafe.subscriptionsCount ?? 0], ["عدد التجديدات", cafe.renewalsCount ?? 0]]} />
          <div className={s.planEditor}><label htmlFor="brand-next-plan">تغيير الباقة</label><p>تطبيق التغيير ينهي الاشتراك الحالي وينشئ اشتراكًا إداريًا جديدًا.</p>
            <div><select id="brand-next-plan" value={nextPlan} disabled={planPending} onChange={event => setNextPlan(event.target.value)}><option value="" disabled>اختر الباقة</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>
              <button type="button" className={s.primaryButton} disabled={planPending || !nextPlan || nextPlan === cafe.planId} onClick={() => updatePlan(cafe.id, nextPlan)}>{planPending ? "جارٍ تطبيق الباقة…" : "تطبيق الباقة"}</button></div>
          </div>
        </>}
        {section === "services" && services}
        {section === "menu" && <StandaloneMenuControl key={cafe.id} cafeId={cafe.id} slug={cafe.slug} />}
        {section === "analytics" && <div className={s.analyticsGrid}>{stats.map(({ label, value, icon: Icon }) => <div key={label}><Icon aria-hidden="true" /><span>{label}</span><strong>{value}</strong></div>)}</div>}
        {section === "support" && <>
          <SectionHeading icon={Headphones}>الدعم والصيانة</SectionHeading><DataList items={[["تذاكر الدعم", cafe.supportTicketsCount ?? 0], ["رقم حساب الصيانة", cafe.maintenanceAccountNumber]]} />
          <SectionHeading icon={ShieldCheck}>مستندات النشاط</SectionHeading><DataList items={[["الرقم الضريبي", cafe.taxNumber], ["السجل التجاري", cafe.commercialRegister], ["شهادة معروف", cafe.maroofCertificate]]} />
          <SectionHeading icon={Phone}>قنوات التواصل</SectionHeading><DataList items={[["واتساب", cafe.whatsapp], ["إنستغرام", cafe.instagram]]} />
        </>}
      </div>
    </Dialog>}
  </>;
}

type Override = EffectiveBrandFeatureAccess["override"];
const resultLabels = { active: "فعّالة", locked: "غير مشمولة", disabled_by_admin: "موقوفة يدويًا", coming_soon: "قريبًا" };
const categoryLabels: Record<string, string> = { core: "أساسية", commerce: "تجارية", operations: "تشغيلية", growth: "نمو وتسويق", experience: "تجربة العملاء", settings: "إعدادات", finance: "مالية" };
const categoryIcons: Record<string, typeof Building2> = { core: Layers3, commerce: ShoppingBag, operations: Building2, growth: BarChart3, experience: Gift, settings: SlidersHorizontal, finance: CircleDollarSign };

export function BrandFeatureControls({ rows, draft, saving, dirty, change, save }: {
  rows: EffectiveBrandFeatureAccess[]; draft: Record<string, Override>; saving: boolean; dirty: boolean;
  change: (id: PlatformFeatureId, value: Override) => void; save: () => void;
}) {
  const [query, setQuery] = useState("");
  const visible = rows.filter(row => `${row.feature.titleAr} ${row.feature.descriptionAr}`.includes(query.trim()));
  return <div className={s.services}>
    <div className={s.serviceSummary}><span><Check aria-hidden="true" />{rows.filter(row => row.effectiveEnabled).length} خدمة فعّالة</span><span>{rows.filter(row => row.planIncluded).length} مشمولة بالباقة</span></div>
    <label className={s.search}><Search aria-hidden="true" /><input aria-label="ابحث عن خدمة" placeholder="ابحث عن خدمة…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className={s.serviceList}>{visible.map(row => { const Icon = categoryIcons[row.feature.category] || Layers3; return <div className={s.serviceRow} key={row.feature.id}>
      <span className={s.serviceIcon}><Icon aria-hidden="true" /></span><div className={s.serviceDescription}><h3>{row.feature.titleAr}</h3><p>{row.feature.descriptionAr}</p><span>{categoryLabels[row.feature.category]} · {row.planIncluded ? "ضمن الباقة" : "خارج الباقة"}</span></div>
      <div className={s.serviceSetting}><span className={row.effectiveEnabled ? s.active : s.inactive}>{resultLabels[row.result]}</span><select aria-label={`إتاحة ${row.feature.titleAr}`} value={draft[row.feature.id] ?? row.override} disabled={saving}
        onChange={event => change(row.feature.id, event.target.value as Override)}><option value="default">حسب الباقة</option><option value="enabled" disabled={row.feature.status === "hidden"}>تفعيل يدوي</option><option value="disabled">إيقاف يدوي</option></select></div>
    </div>; })}</div>
    {!visible.length && <p className={s.empty}>لا توجد خدمة بهذا الاسم. جرّب بحثًا آخر.</p>}
    <div className={s.saveBar}><p role="status">{dirty ? "لديك تغييرات لم تُحفظ بعد" : "الاستثناءات تخص هذه العلامة فقط"}</p><button className={s.primaryButton} type="button" onClick={save} disabled={saving || !dirty}>{saving ? "جارٍ الحفظ" : "حفظ التغييرات"}</button></div>
  </div>;
}
