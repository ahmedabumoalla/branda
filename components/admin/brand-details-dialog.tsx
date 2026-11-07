"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { enterMaintenanceModeAction } from "@/app/actions/maintenance";
import { clearDashboardShellSnapshot } from "@/lib/performance/dashboard-shell-client";
import { ArrowLeft, BarChart3, Building2, Check, ChevronLeft, CircleDollarSign, Copy, CreditCard, Gift, Headphones, Layers3, MessageSquareText, Package, Phone, Search, ShieldCheck, ShoppingBag, SlidersHorizontal, TicketCheck, UserRound, Users, Utensils, X } from "lucide-react";
import type { PlatformCafe, PlatformPlan } from "@/lib/platform/admin-data";
import type { EffectiveBrandFeatureAccess } from "@/lib/platform/feature-access";
import type { PlatformFeatureId } from "@/lib/platform/feature-registry";
import { formatSar } from "@/lib/format";
import { StandaloneMenuControl } from "./standalone-menu-control";
import { BrandOperationsPanel } from "./brand-operations-panel";
import { BrandAnalyticsPanel } from "./brand-analytics-panel";
import { BellRing, ClipboardCheck, Wrench } from "lucide-react";
import { PagerBrandPanel } from "@/components/pager/pager-brand-panel";
import s from "./brand-details.module.css";
import { BrandDeletionControl } from "./brand-deletion-control";
import type { BrandDeletionResult } from "@/lib/data/brand-deletion";
import { lockPageScroll } from "@/lib/ui/page-scroll-lock";
import { BrandOwnerWelcome } from "./brand-owner-welcome";
import { SubscriptionDeadlineEditor } from "./subscription-deadline-editor";
import { formatSaudiDeadline } from "@/lib/platform/subscription-deadline";

type Section = "account" | "plan" | "services" | "menu" | "analytics" | "support" | "operations" | "pager";
const sections = [
  { id: "pager", title: "نظام البيجر", description: "الفواتير والاستدعاءات وأوقات الانتظار وتقييمات العملاء", icon: BellRing },
  { id: "account", title: "بيانات العلامة", description: "بيانات المالك والتواصل", icon: Building2 },
  { id: "plan", title: "الباقات والاشتراك", description: "الباقات المفعّلة وموعد الانتهاء المشترك", icon: CreditCard },
  { id: "services", title: "الخدمات والصلاحيات", description: "الخدمات المتاحة واستثناءات العلامة", icon: SlidersHorizontal },
  { id: "menu", title: "المنيو المستقل", description: "إتاحة المنيو حسب الباقة والاشتراك", icon: Utensils },
  { id: "operations", title: "مركز العمليات", description: "الزيارات، الدخول، الطلبات وتقارير العلامة", icon: ClipboardCheck },
  { id: "analytics", title: "الأداء والإحصاءات", description: "المنتجات، الطلبات وتفاعل العملاء", icon: BarChart3 },
  { id: "support", title: "الدعم والمستندات", description: "الصيانة، الدعم وبيانات النشاط", icon: Headphones },
] as const;

export function BrandDialog({ title, children, close, detail = false, busy = false }: { title: string; children: ReactNode; close: () => void; detail?: boolean; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const focused = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const releaseScroll = lockPageScroll();
    return () => {
      dialog?.close();
      releaseScroll();
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={`${s.dialog} ${detail ? s.detailDialog : ""}`} dir="rtl" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) close(); }}
    onClick={event => { if (!busy && event.target === event.currentTarget) close(); }}>
    <div className={s.dialogSurface}>
      <header className={s.dialogBar}>
        <span id={titleId}>{title}</span>
        <button type="button" className={s.iconButton} onClick={close} disabled={busy} aria-label={detail ? "العودة إلى ملخص العلامة" : "إغلاق النافذة"} autoFocus>
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
  activity: ReactNode;
  toggleStatus: () => Promise<void>;
  planPending: boolean;
  updatePlan: (id: string, planIds: string[], expectedRevision: string) => Promise<void>;
  close: () => void;
  onDeleted: (result: BrandDeletionResult) => void;
  onUpdated: (cafe: PlatformCafe) => void;
};

export function BrandDetailsDialog({ cafe, plans, services, activity, toggleStatus, planPending, updatePlan, close, onDeleted, onUpdated }: Props) {
  const router = useRouter();
  const [maintenancePending, setMaintenancePending] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState("");
  const [maintenanceLoginRequired, setMaintenanceLoginRequired] = useState(false);
  const maintenanceInFlight = useRef(false);
  const [statusPending, setStatusPending] = useState(false);
  const [deletionPending, setDeletionPending] = useState(false);
  const [welcomePending, setWelcomePending] = useState(false);
  const [deadlinePending, setDeadlinePending] = useState(false);
  const [section, setSection] = useState<Section | null>(null);
  const [planSelection, setPlanSelection] = useState<{ ids: string[]; revision: string | null }>({ ids: [], revision: null });
  const [addingPlans, setAddingPlans] = useState(false);
  const [planError, setPlanError] = useState("");
  const [planMessage, setPlanMessage] = useState("");
  const planInFlight = useRef(false);
  const planFieldId = useId();
  const [copyMessage, setCopyMessage] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  async function enterMaintenance() {
    if (maintenanceInFlight.current || !cafe.maintenanceAccountNumber) return;
    maintenanceInFlight.current = true;
    setMaintenancePending(true);
    setMaintenanceError("");
    setMaintenanceLoginRequired(false);
    try {
      const result = await enterMaintenanceModeAction(cafe.maintenanceAccountNumber);
      if (result.ok && result.redirectTo) {
        clearDashboardShellSnapshot();
        router.push(result.redirectTo);
        return;
      }
      setMaintenanceError(result.message);
      setMaintenanceLoginRequired(result.redirectTo === "/login");
    } catch {
      setMaintenanceError("تعذر الدخول إلى وضع الصيانة حاول مجددًا");
    }
    maintenanceInFlight.current = false;
    setMaintenancePending(false);
  }
  async function copyAccount() {
    try {
      await navigator.clipboard.writeText(cafe.maintenanceAccountNumber || "");
      setCopyMessage("تم نسخ رقم الصيانة");
    } catch { setCopyMessage("تعذر النسخ يمكنك تحديد الرقم ونسخه يدويًا"); }
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyMessage(""), 3500);
  }
  const assignedPlanIds = cafe.planIds ?? (cafe.planId ? [cafe.planId] : []);
  const assignedPlans = assignedPlanIds.map((id, index) => ({ id, name: cafe.planNames?.[index] || plans.find(plan => plan.id === id)?.name || cafe.planName || "باقة حالية", disabled: plans.find(plan => plan.id === id)?.active === false }));
  const availablePlans = plans.filter(plan => plan.active && !assignedPlanIds.includes(plan.id));
  const planName = assignedPlans.map(plan => plan.name).join("، ") || "بدون باقة";
  const planBusy = planPending || addingPlans;
  const selectionStale = planSelection.ids.length > 0 && (planSelection.revision !== cafe.subscriptionRevision || planSelection.ids.some(id => !availablePlans.some(plan => plan.id === id)));
  async function addPlans() {
    if (planInFlight.current || planBusy || deadlinePending || selectionStale || !cafe.subscriptionRevision || !planSelection.ids.length) return;
    planInFlight.current = true; setAddingPlans(true); setPlanError(""); setPlanMessage("");
    try {
      await updatePlan(cafe.id, planSelection.ids, cafe.subscriptionRevision);
      setPlanSelection({ ids: [], revision: null });
      setPlanMessage("تم تفعيل الباقات المحددة");
    } catch (error) {
      setPlanError(error instanceof Error && /[\u0600-\u06ff]/.test(error.message) && error.message.length < 400 ? error.message : "تعذر تأكيد تفعيل الباقات حدّث بيانات الاشتراك ثم أعد المحاولة");
    }
    finally { planInFlight.current = false; setAddingPlans(false); }
  }
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
    <BrandDialog title="ملف العلامة التجارية" close={close} busy={welcomePending || deadlinePending || planBusy}>
      <div className={s.overview}>
        <div className={s.identity}>
          <div className={s.avatar}>{cafe.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={cafe.logoUrl} alt={cafe.name} /> : <Building2 aria-hidden="true" />}</div>
          <div className={s.identityText}>
            <p className={s.eyebrow}>علامة تجارية</p>
            <h2 dir="auto">{cafe.name}</h2>
            <div className={s.identityMeta}><span className={cafe.status === "نشط" ? s.active : s.inactive}><i />{cafe.status}</span><span>{planName}</span></div>
          </div>
        </div>
        <div className={s.summary}>
          <div><Package aria-hidden="true" /><span><strong>{cafe.productsCount ?? 0}</strong><small>منتج في المنيو</small></span></div>
          <div><Users aria-hidden="true" /><span><strong>{cafe.customersCount ?? 0}</strong><small>عميل مسجل</small></span></div>
          <div><CircleDollarSign aria-hidden="true" /><span><strong>{formatSar(cafe.totalRevenue)}</strong><small>إجمالي إيراد الطلبات</small></span></div>
        </div>
        <BrandOwnerWelcome cafe={cafe} disabled={maintenancePending} onBusyChange={setWelcomePending} onUpdated={onUpdated} />
        <div className={s.sectionLabel}><h3>إدارة العلامة</h3><span>اختر قسمًا لعرض التفاصيل والتحكم</span></div>
        <div className={s.actionGrid}>{sections.map(({ id, title, description, icon: Icon }) => <button type="button" key={id} className={s.actionTile}
          aria-haspopup="dialog" disabled={welcomePending} onClick={() => setSection(id)}>
          <span className={s.tileIcon}><Icon aria-hidden="true" /></span><span className={s.tileText}><strong>{title}</strong><small>{description}</small></span><ChevronLeft className={s.chevron} aria-hidden="true" />
        </button>)}</div>
        <footer className={s.overviewFooter}><span>حساب الصيانة <b dir="ltr">{cafe.maintenanceAccountNumber || "غير مضاف"}</b></span>
          <div className={s.maintenanceActions}>
            <button type="button" className={s.textButton} disabled={!cafe.maintenanceAccountNumber} onClick={copyAccount}><Copy aria-hidden="true" />نسخ الرقم</button>
            <button type="button" className={`${s.primaryButton} ${s.maintenanceButton}`} disabled={maintenancePending || welcomePending || !cafe.maintenanceAccountNumber} aria-busy={maintenancePending} onClick={enterMaintenance}>
              <Wrench aria-hidden="true" />{maintenancePending ? "جارٍ الدخول إلى وضع الصيانة" : "دخول وضع الصيانة"}
            </button>
          </div>
        </footer>
        {maintenanceError && <p className={s.maintenanceError} role="alert">{maintenanceError}</p>}
        {maintenanceLoginRequired && <a href="/login" className={s.primaryButton} onClick={clearDashboardShellSnapshot}>تسجيل الدخول مجددًا</a>}
        <p className={s.liveMessage} role="status">{copyMessage}</p>
      </div>
    </BrandDialog>
    {section && selectedSection && <BrandDialog key={section} title={`${selectedSection.title} · ${cafe.name}`} close={() => setSection(null)} detail busy={deletionPending || deadlinePending || planBusy}>
      <div className={s.panelBody}>
        <div className={s.panelIntro}><span className={s.tileIcon}><selectedSection.icon aria-hidden="true" /></span><div><h2>{selectedSection.title}</h2><p>{selectedSection.description}</p></div></div>
        {section === "account" && <>
          <SectionHeading icon={UserRound}>بيانات الحساب والمالك</SectionHeading>
          <DataList items={[["اسم العلامة", cafe.name], ["الرابط المختصر", cafe.slug], ["اسم المالك", cafe.ownerName], ["البريد الإلكتروني", cafe.ownerEmail], ["بريد الدخول", cafe.ownerLoginEmail], ["الوصول لكلمة المرور", cafe.passwordAccessNote], ["جوال المالك", cafe.ownerPhone], ["تاريخ الانضمام", cafe.createdAt]]} />
          <button type="button" className={s.primaryButton} disabled={statusPending || deletionPending} onClick={async () => { setStatusPending(true); try { await toggleStatus(); } finally { setStatusPending(false); } }}>{statusPending ? "جارٍ تحديث الحالة…" : cafe.status === "نشط" ? "إيقاف العلامة" : "تفعيل العلامة"}</button>
          <BrandDeletionControl cafeId={cafe.id} name={cafe.name} slug={cafe.slug} disabled={statusPending} onBusyChange={setDeletionPending} onDeleted={onDeleted} />
        </>}
        {section === "plan" && <>
          <div className={s.planCard}><CreditCard aria-hidden="true" /><span>الباقات الحالية<strong>{assignedPlans.length ? `${assignedPlans.length} باقة` : "بدون باقة"}</strong></span><span className={cafe.hasActivePlan ? s.active : s.inactive}>{cafe.subscriptionStatus ?? (cafe.hasActivePlan ? "فعال" : "غير فعال")}</span></div>
          {!!assignedPlans.length && <fieldset className={s.currentPlans}><legend>الباقات المرتبطة بالاشتراك</legend>{assignedPlans.map(plan => <label className={s.planChoice} key={plan.id}><input type="checkbox" checked disabled readOnly /><span><strong>{plan.name}</strong><small>{plan.disabled ? "معطلة على المنصة ومضافة سابقًا لهذه العلامة" : "مضافة إلى الاشتراك الحالي"}</small></span></label>)}</fieldset>}
          <DataList items={[["تاريخ البداية", cafe.trialAwaitingDelivery ? "بعد إرسال تفاصيل الدخول" : cafe.planStartedAt], ["موعد الانتهاء بتوقيت السعودية", cafe.trialAwaitingDelivery ? "٧ أيام من وقت الإرسال لجميع الباقات" : cafe.subscriptionExpiryMixed ? "توجد مواعيد مختلفة اختر موعدًا موحدًا أدناه" : formatSaudiDeadline(cafe.planExpiresAtExact)], ["المدة المتبقية", cafe.trialAwaitingDelivery ? "العداد لم يبدأ" : cafe.subscriptionExpiryMixed ? "تختلف حسب الباقة" : cafe.planRemainingDays == null ? "غير محددة" : `${cafe.planRemainingDays} يوم`], ["عدد الاشتراكات", cafe.subscriptionsCount ?? 0], ["عدد التجديدات", cafe.renewalsCount ?? 0]]} />
          <SubscriptionDeadlineEditor key={`${cafe.id}:${assignedPlanIds.join(",")}`} cafe={cafe} disabled={planBusy} onUpdated={onUpdated} onBusyChange={setDeadlinePending} />
          <section className={s.planEditor} aria-labelledby={`${planFieldId}-title`} aria-busy={planBusy}>
            <h3 id={`${planFieldId}-title`}>تفعيل باقات إضافية</h3><p id={`${planFieldId}-hint`}>اختر الباقات التي تريد إضافتها إلى الباقات الحالية بموعد انتهاء مشترك</p>
            {availablePlans.length ? <fieldset className={s.planChoices} disabled={planBusy || deadlinePending || !cafe.subscriptionRevision || selectionStale} aria-describedby={`${planFieldId}-hint`}><legend>الباقات المتاحة للإضافة</legend>{availablePlans.map(plan => <label className={s.planChoice} key={plan.id}><input type="checkbox" value={plan.id} checked={planSelection.ids.includes(plan.id)} onChange={event => {
              const checked = event.target.checked;
              setPlanSelection(current => ({ revision: cafe.subscriptionRevision ?? null, ids: checked ? [...current.ids, plan.id] : current.ids.filter(id => id !== plan.id) })); setPlanError(""); setPlanMessage("");
            }} /><span><strong>{plan.name}</strong></span></label>)}</fieldset> : <p className={s.planNote}>لا توجد باقات فعالة أخرى متاحة للإضافة</p>}
            {!cafe.subscriptionRevision && <p className={s.planNote}>حدّث بيانات الاشتراك لإتاحة إضافة الباقات</p>}
            {selectionStale && <div className={s.planNotice}><p role="status">تغيرت بيانات الاشتراك راجع الباقات الحالية واختر الإضافات مجددًا</p><button type="button" className={s.textButton} disabled={planBusy || deadlinePending} onClick={() => { setPlanSelection({ ids: [], revision: null }); setPlanError(""); }}>تحديث الاختيار</button></div>}
            <div className={s.planSubmit}><button type="button" className={s.primaryButton} disabled={planBusy || deadlinePending || selectionStale || !cafe.subscriptionRevision || !planSelection.ids.length} onClick={addPlans}>{planBusy ? "جار تفعيل الباقات" : "تفعيل الباقات المحددة"}</button><span>{planSelection.ids.length ? `${planSelection.ids.length} باقة محددة` : "اختر باقة واحدة أو أكثر"}</span></div>
            {planError && <p className={s.planError} role="alert">{planError}</p>}<p className={s.planMessage} role="status">{planMessage}</p>
          </section>
        </>}
        {section === "services" && services}
        {section === "pager" && <PagerBrandPanel key={cafe.id} cafeId={cafe.id} />}
        {section === "menu" && <StandaloneMenuControl cafe={cafe} plans={plans} />}
        {section === "operations" && <BrandOperationsPanel key={cafe.id} brandId={cafe.id} />}
        {section === "analytics" && <><BrandAnalyticsPanel key={cafe.id} brandId={cafe.id} /><div className={s.analyticsGrid}>{stats.map(({ label, value, icon: Icon }) => <div key={label}><Icon aria-hidden="true" /><span>{label}</span><strong>{value}</strong></div>)}</div>{activity}</>}
        {section === "support" && <>
          <SectionHeading icon={Headphones}>الدعم والصيانة</SectionHeading><DataList items={[["تذاكر الدعم", cafe.supportTicketsCount ?? 0], ["رقم حساب الصيانة", cafe.maintenanceAccountNumber]]} />
          <SectionHeading icon={ShieldCheck}>مستندات النشاط</SectionHeading><DataList items={[["الرقم الضريبي", cafe.taxNumber], ["السجل التجاري", cafe.commercialRegister], ["شهادة معروف", cafe.maroofCertificate]]} />
          <SectionHeading icon={Phone}>قنوات التواصل</SectionHeading><DataList items={[["واتساب", cafe.whatsapp], ["إنستغرام", cafe.instagram]]} />
        </>}
      </div>
    </BrandDialog>}
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
    {!visible.length && <p className={s.empty}>لا توجد خدمة بهذا الاسم جرّب بحثًا آخر</p>}
    <div className={s.saveBar}><p role="status">{dirty ? "لديك تغييرات لم تُحفظ بعد" : "الاستثناءات تخص هذه العلامة فقط"}</p><button className={s.primaryButton} type="button" onClick={save} disabled={saving || !dirty}>{saving ? "جارٍ الحفظ" : "حفظ التغييرات"}</button></div>
  </div>;
}
