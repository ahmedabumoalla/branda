"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { ArrowDownToLine, ArrowUpFromLine, ChartNoAxesCombined, ChevronDown, ClipboardList, Factory, FileText, Info, Landmark, LayoutDashboard, LayoutGrid, LogOut, Monitor, Network, Package, ReceiptText, RotateCcw, Settings, ShoppingBag, Star, Store, Target, Trash2, Truck, UserRoundCog, UsersRound, Wallet, Warehouse } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { exitMaintenanceModeAction } from "@/app/actions/maintenance";
import styles from "./aldeem-clean-dashboard.module.css";
import { AldeemSalesSettings } from "./aldeem-sales-settings";
import { AldeemSalesInvoices } from "./aldeem-sales-invoices";
import { AldeemSalesQuotes } from "./aldeem-sales-quotes";
import { AldeemSalesReturns } from "./aldeem-sales-returns";
import { AldeemPurchases } from "./aldeem-purchases";
import { AldeemPurchaseReturns } from "./aldeem-purchase-returns";
import { AldeemPosManagement } from "./aldeem-pos-management";
import { AldeemCustomers } from "./aldeem-customers";
import { AldeemOperationalWorkspace, ALDEEM_OPERATIONAL_SECTIONS } from "@/components/aldeem/operational-workspace";
import { AldeemRealOverview } from "@/components/aldeem/real-overview";
import { AldeemOperationalPresentation } from "@/components/aldeem/operational-presentation";
import { AldeemFamilies } from "@/components/aldeem/families";
import { AldeemManufacturing } from "@/components/aldeem/aldeem-manufacturing";
import { AldeemWorkshop } from "@/components/aldeem/workshop";
import { AldeemFranchiseWorkspace } from "@/components/aldeem/franchise-workspace";
import { AldeemCustomerPoints } from "@/components/aldeem/customer-points";
import { useAldeemLocation } from "@/components/aldeem/use-location";
import { AldeemDemo, DemoSwitch, useAldeemDemo } from "@/components/aldeem/demo";

const settingsSections = [
  { id: "account-settings", title: "إعدادات الحساب", icon: UserRoundCog },
  { id: "account-information", title: "معلومات الحساب", icon: Info },
  { id: "system-sections", title: "إدارة أقسام النظام", icon: LayoutGrid },
] as const;
const salesSections = [
  { id: "sales-invoices", title: "فواتير المبيعات", icon: ReceiptText },
  { id: "sales-quotes", title: "عروض الأسعار", icon: FileText },
  { id: "sales-returns", title: "مرتجعات الفواتير", icon: RotateCcw },
] as const;
const purchaseSections = [
  { id: "purchase-invoices", title: "فواتير المشتريات", icon: ReceiptText },
  { id: "purchase-returns", title: "مرتجعات المشتريات", icon: RotateCcw },
  { id: "purchase-requests", title: "طلبات الشراء", icon: ClipboardList },
  { id: "purchase-orders", title: "أوامر الشراء", icon: FileText },
] as const;
const posSettingPages = [
  { id: "pos-setting-counters", title: "تعريف الكاونترات" },
  { id: "pos-setting-sellers", title: "تعريف البائعين" },
  { id: "pos-setting-counter-sellers", title: "ربط الكاونترات بالبائعين" },
  { id: "pos-setting-networks", title: "تعريف الشبكات" },
  { id: "pos-setting-customers", title: "عملاء نقاط البيع" },
  { id: "pos-setting-sms", title: "إرسال رسائل SMS" },
  { id: "pos-setting-halls-tables", title: "تعريف الصالات والطاولات" },
  { id: "pos-setting-counter-currencies", title: "تعريف عملات الكاونتر" },
  { id: "pos-setting-transactions", title: "معاملات نقاط البيع" },
  { id: "pos-setting-welcome-message", title: "الرسالة الترحيبية" },
  { id: "pos-setting-vouchers", title: "القسائم الشرائية" },
  { id: "pos-setting-delivery-companies", title: "تعريف شركات التوصيل" },
  { id: "pos-setting-bonus", title: "تعريف البونص" },
  { id: "pos-setting-counter-activity", title: "حركة الكاونتر" },
  { id: "pos-setting-discount-offers", title: "عروض الخصم" },
  { id: "pos-setting-bonus-groups", title: "مجموعات البونص" },
  { id: "pos-setting-general-bonus", title: "البونص العام" },
  { id: "pos-setting-promotions", title: "العروض الترويجية" },
  { id: "pos-setting-customer-group", title: "مجموعة عملاء نقاط البيع" },
  { id: "pos-setting-tax-customers", title: "عملاء ضريبيون نقاط البيع" },
] as const;
const posSections = [
  { id: "pos-main-settings", title: "إعدادات نقاط البيع الرئيسية", icon: Settings },
  { id: "branch-pos-management", title: "إدارة نقاط بيع الفروع", icon: Store },
  { id: "pos-active-shifts", title: "الورديات النشطة", icon: ClipboardList },
  { id: "pos-price-management", title: "إدارة الأسعار لكل نقطة", icon: Settings },
] as const;
const inventorySections = [
  { id: "inventory-products", title: "المنتجات", icon: Package },
  { id: "inventory-warehouses", title: "المستودعات", icon: Warehouse },
  { id: "inventory-disposal-orders", title: "أوامر الإتلاف", icon: Trash2 },
] as const;
const producerSections = [
  { id: "producer-sales", title: "مبيعات", icon: ReceiptText },
  { id: "producer-returns", title: "مرتجعات", icon: RotateCcw },
  { id: "producer-settlements", title: "تسوية مستحقات", icon: Wallet },
  { id: "producer-accounts", title: "حسابات الأسر المنتجة", icon: UsersRound },
] as const;
const franchiseSections = [
  { id: "franchise-partners", title: "شركاء فرنشايز", icon: UsersRound },
  { id: "franchise-products", title: "منتجات", icon: Package },
  { id: "franchise-agreements", title: "اتفاقيات", icon: FileText },
  { id: "franchise-settlements", title: "تسويات مالية", icon: Wallet },
] as const;
const workshopSections = [
  { id: "workshop-product-order", title: "واجهة طلب المنتجات للفروع", icon: ShoppingBag },
  { id: "workshop-branch-requests", title: "استلام وتجهيز الطلبات", icon: ClipboardList },
  { id: "workshop-deliveries", title: "الإرسال واستلام الفروع", icon: Truck },
] as const;
const customerSections = [
  { id: "customer-management", title: "إدارة العملاء", icon: UsersRound },
  { id: "customer-balances", title: "أرصدة العملاء", icon: Wallet },
  { id: "customer-points", title: "نقاط العملاء", icon: Star },
] as const;
// Presentation mode only: the stamp card and the points programme open as two separate pages.
const loyaltyDemoSections = [
  { id: "loyalty-card", title: "بطاقة الولاء والأختام", icon: Star },
  { id: "loyalty-points", title: "النقاط وقواعد احتسابها", icon: Target },
  { id: "loyalty-branches", title: "فروع الولاء", icon: Store },
] as const;
const manufacturingSections = [
  { id: "manufacturing-monitor", title: "مراقبة الإنتاج", icon: Monitor },
  { id: "manufacturing-operations", title: "عمليات التصنيع", icon: Factory },
  { id: "manufacturing-quality", title: "مركز الجودة", icon: ClipboardList },
  { id: "manufacturing-quality-reports", title: "تقارير الجودة", icon: FileText },
  { id: "manufacturing-batches", title: "تتبع الباتشات", icon: Package },
] as const;
const financeSections = [
  { id: "finance-treasuries", title: "الخزائن والحسابات البنكية", icon: Landmark },
  { id: "finance-journal", title: "قيود اليومية", icon: ClipboardList },
  { id: "finance-reports", title: "التقارير", icon: ChartNoAxesCombined },
  { id: "finance-disbursements", title: "سندات الصرف", icon: ArrowUpFromLine },
  { id: "finance-receipts", title: "سندات القبض", icon: ArrowDownToLine },
  { id: "finance-chart-of-accounts", title: "شجرة الحسابات", icon: Network },
  { id: "finance-cost-centers", title: "مراكز التكلفة", icon: Target },
] as const;
const employeeSections = [
  { id: "employee-management", title: "إدارة الموظفين", icon: UsersRound },
  { id: "employee-roles", title: "الأدوار الوظيفية", icon: UserRoundCog },
  { id: "employee-schedules", title: "مواعيد العمل", icon: ClipboardList },
  { id: "employee-payroll", title: "مسيرات الرواتب", icon: Wallet },
  { id: "employee-organization", title: "الهيكل التنظيمي", icon: Network },
] as const;
type Section = "overview" | typeof posSettingPages[number]["id"] | typeof settingsSections[number]["id"] | typeof salesSections[number]["id"] | typeof purchaseSections[number]["id"] | typeof posSections[number]["id"] | typeof inventorySections[number]["id"] | typeof producerSections[number]["id"] | typeof franchiseSections[number]["id"] | typeof workshopSections[number]["id"] | typeof customerSections[number]["id"] | typeof loyaltyDemoSections[number]["id"] | typeof manufacturingSections[number]["id"] | typeof financeSections[number]["id"] | typeof employeeSections[number]["id"];

const systemGroups = [
  { id: "overview", title: "نظرة عامة", icon: LayoutDashboard, children: [] },
  { id: "sales", title: "المبيعات", icon: ReceiptText, children: salesSections },
  { id: "purchases", title: "المشتريات", icon: ShoppingBag, children: purchaseSections },
  { id: "pos", title: "نقاط البيع", icon: Monitor, children: posSections },
  { id: "inventory", title: "المخزون", icon: Package, children: inventorySections },
  { id: "producers", title: "الأسر المنتجة", icon: UsersRound, children: producerSections },
  { id: "franchise", title: "الفرنشايز", icon: Store, children: franchiseSections },
  { id: "workshop", title: "المعمل", icon: Factory, children: workshopSections },
  { id: "customers", title: "العملاء", icon: UsersRound, children: customerSections },
  { id: "manufacturing", title: "المصنع", icon: Factory, children: manufacturingSections },
  { id: "finance", title: "المالية", icon: Wallet, children: financeSections },
  { id: "employees", title: "الموظفين", icon: UsersRound, children: employeeSections },
  { id: "settings", title: "الإعدادات", icon: Settings, children: settingsSections },
];

function SystemSectionSettings() {
  const [selected, setSelected] = useState("overview");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const group = systemGroups.find((item) => item.id === selected || item.children.some((child) => child.id === selected))!;
  const item = group.children.find((child) => child.id === selected) ?? group;
  const Icon = item.icon;
  return <div className={styles.sectionManager}>
    <aside className={styles.sectionDirectory} aria-label="أقسام النظام وإعداداتها">
      <div className={styles.directoryHeading}><LayoutGrid size={18} aria-hidden="true" /><h2>أقسام النظام</h2></div>
      <nav className={styles.directoryTree} aria-label="اختيار القسم لإعداداته">
        {systemGroups.map(({ id, title, icon: GroupIcon, children }) => <div key={id} className={styles.directoryGroup}>
          <div className={styles.directoryRow}>
            <button type="button" className={`${styles.navItem} ${selected === id ? styles.active : ""}`} aria-current={selected === id ? "true" : undefined} onClick={() => setSelected(id)}><GroupIcon size={17} aria-hidden="true" /><span>{title}</span></button>
            {children.length > 0 && <button type="button" className={styles.directoryToggle} aria-label={`${collapsed[id] ? "توسيع" : "طي"} ${title}`} aria-expanded={!collapsed[id]} aria-controls={`config-${id}`} onClick={() => setCollapsed((current) => ({ ...current, [id]: !current[id] }))}><ChevronDown size={16} className={`${styles.chevron} ${!collapsed[id] ? styles.expanded : ""}`} aria-hidden="true" /></button>}
          </div>
          {children.length > 0 && <div id={`config-${id}`} className={styles.submenu} hidden={!!collapsed[id]}>
            {children.map((child) => <button type="button" key={child.id} className={`${styles.subItem} ${selected === child.id ? styles.subActive : ""}`} aria-current={selected === child.id ? "true" : undefined} onClick={() => setSelected(child.id)}><child.icon size={15} aria-hidden="true" /><span>{child.title}</span></button>)}
          </div>}
        </div>)}
      </nav>
    </aside>
    <section className={styles.sectionConfiguration} aria-labelledby="section-settings-title">
      <header className={styles.configurationHeader}><div className={styles.configurationIcon}><Icon size={22} aria-hidden="true" /></div><div><span>{group.title}{item.id !== group.id ? ` / ${item.title}` : ""}</span><h2 id="section-settings-title">إعدادات {item.title}</h2></div></header>
      <div hidden={item.id !== "sales-invoices"}><AldeemSalesSettings /></div>
      {item.id !== "sales-invoices" && <div className={styles.configurationEmpty}><Settings size={32} strokeWidth={1.4} aria-hidden="true" /><h3>مساحة إعدادات {item.title}</h3><p>لم تُضف إعدادات لهذا القسم بعد</p></div>}
    </section>
  </div>;
}

function LogoutButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending}><LogOut size={17} aria-hidden="true" />{pending ? "جار الخروج" : "تسجيل الخروج"}</button>;
}

export function AldeemCleanDashboard({ maintenance, loyaltyEnabled = false, children }: { maintenance: boolean; loyaltyEnabled?: boolean; children?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const loyaltyPage = pathname === "/dashboard/loyalty" || pathname === "/dashboard/loyalty/guide" || pathname === "/dashboard/loyalty/settings" || pathname === "/dashboard/loyalty/branches";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [salesOpen, setSalesOpen] = useState(true);
  const [purchasesOpen, setPurchasesOpen] = useState(true);
  const [posOpen, setPosOpen] = useState(true);
  const [inventoryOpen, setInventoryOpen] = useState(true);
  const [producersOpen, setProducersOpen] = useState(true);
  const [franchiseOpen, setFranchiseOpen] = useState(true);
  const [workshopOpen, setWorkshopOpen] = useState(true);
  const [customersOpen, setCustomersOpen] = useState(true);
  const [loyaltyOpen, setLoyaltyOpen] = useState(true);
  const [manufacturingOpen, setManufacturingOpen] = useState(true);
  const [financeOpen, setFinanceOpen] = useState(true);
  const [employeesOpen, setEmployeesOpen] = useState(true);
  const [section, setWorkspaceSection, locationReady] = useAldeemLocation<Section>("section", "overview", ["overview", ...posSettingPages.map(item => item.id), ...systemGroups.flatMap(group => group.children.map(child => child.id)), ...loyaltyDemoSections.map(item => item.id)]);
  const [demo, setDemo] = useAldeemDemo();
  function setSection(value: Section) {
    if (loyaltyPage) router.push(`/dashboard?aldeem.section=${encodeURIComponent(value)}`);
    else setWorkspaceSection(value);
  }
  const [salesVisited, setSalesVisited] = useState(false);
  const [quotesVisited, setQuotesVisited] = useState(false);
  const [returnsVisited, setReturnsVisited] = useState(false);
  const [posVisited, setPosVisited] = useState(false);
  useEffect(() => { if (section === "branch-pos-management" || section === "pos-active-shifts" || section === "pos-price-management") setPosVisited(true); }, [section]);
  const [purchasesVisited, setPurchasesVisited] = useState<Record<string, boolean>>({});
  useEffect(() => { if (section.startsWith("purchase-")) setPurchasesVisited(current => current[section] ? current : { ...current, [section]: true }); }, [section]);
  const [customersVisited, setCustomersVisited] = useState(false);
  useEffect(() => { if (section === "customer-management") setCustomersVisited(true); }, [section]);
  useEffect(() => { if (section === "sales-invoices") setSalesVisited(true); }, [section]);
  useEffect(() => { if (section === "sales-quotes") setQuotesVisited(true); }, [section]);
  useEffect(() => { if (section === "sales-returns") setReturnsVisited(true); }, [section]);
  const selectedSettings = settingsSections.find((item) => item.id === section);
  const selectedSales = salesSections.find((item) => item.id === section);
  const selectedPurchase = purchaseSections.find((item) => item.id === section);
  const selectedPos = posSections.find((item) => item.id === section);
  const posSettingPage = posSettingPages.find(item => item.id === section);
  const inPosSettings = section === "pos-main-settings" || !!posSettingPage;
  const selectedInventory = inventorySections.find((item) => item.id === section);
  const selectedProducer = producerSections.find((item) => item.id === section);
  const selectedFranchise = franchiseSections.find((item) => item.id === section);
  const selectedWorkshop = workshopSections.find((item) => item.id === section);
  const selectedCustomer = customerSections.find((item) => item.id === section);
  const selectedLoyalty = demo ? loyaltyDemoSections.find((item) => item.id === section) : undefined;
  const selectedManufacturing = manufacturingSections.find((item) => item.id === section);
  const selectedFinance = financeSections.find((item) => item.id === section);
  const selectedEmployee = employeeSections.find((item) => item.id === section);
  const selectedPage = selectedSales ?? selectedPurchase ?? selectedPos ?? selectedInventory ?? selectedProducer ?? selectedFranchise ?? selectedWorkshop ?? selectedCustomer ?? selectedLoyalty ?? selectedManufacturing ?? selectedFinance ?? selectedEmployee ?? selectedSettings;
  // Old bookmarks reopen the new workspace, never the retired dashboard UI.
  useEffect(() => { if (pathname !== "/dashboard" && !loyaltyPage) router.replace(`/dashboard${window.location.search}`); }, [pathname, router, loyaltyPage]);
  function exitMaintenance() {
    setError("");
    startTransition(async () => {
      try { await exitMaintenanceModeAction(); window.location.assign("/admin/cafes"); }
      catch { setError("تعذر إنهاء وضع الصيانة حاول مجددًا"); }
    });
  }
  return <div className={styles.shell} dir="rtl">
    <a className={styles.skip} href="#aldeem-overview">انتقل إلى المحتوى</a>
    <aside className={styles.sidebar} aria-label="قائمة الديم">
      <Link href="/dashboard" onClick={() => setSection("overview")} className={styles.brand} aria-label="الديم نظرة عامة">
        <Image src="/aldeem/logo.webp" alt="الديم" width={389} height={73} priority />
      </Link>
      <div className={styles.workspace}><span className={styles.dot} aria-hidden="true" />مساحة عمل الديم</div>
      <DemoSwitch demo={demo} onChange={next => { setDemo(next); if (!next && section.startsWith("loyalty-")) setSection("overview"); }} />
      <nav aria-label="لوحة تحكم الديم">
        <button type="button" onClick={() => setSection("overview")} className={`${styles.navItem} ${section === "overview" ? styles.active : ""}`} aria-current={section === "overview" ? "page" : undefined}><LayoutDashboard size={19} strokeWidth={1.6} aria-hidden="true" /><span>نظرة عامة</span></button>
        <button type="button" className={`${styles.navItem} ${selectedSales ? styles.groupSelected : ""}`} onClick={() => setSalesOpen((open) => !open)} aria-expanded={salesOpen} aria-controls="aldeem-sales-menu">
          <ReceiptText size={19} strokeWidth={1.6} aria-hidden="true" /><span>المبيعات</span><ChevronDown size={15} className={`${styles.chevron} ${salesOpen ? styles.expanded : ""}`} aria-hidden="true" />
        </button>
        <div id="aldeem-sales-menu" className={styles.submenu} hidden={!salesOpen}>
          {salesSections.map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`${styles.subItem} ${section === id ? styles.subActive : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{title}</span></button>)}
        </div>
        <button type="button" className={`${styles.navItem} ${selectedPurchase ? styles.groupSelected : ""}`} onClick={() => setPurchasesOpen((open) => !open)} aria-expanded={purchasesOpen} aria-controls="aldeem-purchases-menu">
          <ShoppingBag size={19} strokeWidth={1.6} aria-hidden="true" /><span>المشتريات</span><ChevronDown size={15} className={`${styles.chevron} ${purchasesOpen ? styles.expanded : ""}`} aria-hidden="true" />
        </button>
        <div id="aldeem-purchases-menu" className={styles.submenu} hidden={!purchasesOpen}>
          {purchaseSections.map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`${styles.subItem} ${section === id ? styles.subActive : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{title}</span></button>)}
        </div>
        <button type="button" className={`${styles.navItem} ${selectedPos || posSettingPage ? styles.groupSelected : ""}`} onClick={() => setPosOpen((open) => !open)} aria-expanded={posOpen} aria-controls="aldeem-pos-menu">
          <Monitor size={19} strokeWidth={1.6} aria-hidden="true" /><span>نقاط البيع</span><ChevronDown size={15} className={`${styles.chevron} ${posOpen ? styles.expanded : ""}`} aria-hidden="true" />
        </button>
        <div id="aldeem-pos-menu" className={styles.submenu} hidden={!posOpen}>
          {posSections.map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`${styles.subItem} ${(section === id || (id === "pos-main-settings" && posSettingPage)) ? styles.subActive : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{title}</span></button>)}
        </div>
        <button type="button" className={`${styles.navItem} ${selectedInventory ? styles.groupSelected : ""}`} onClick={() => setInventoryOpen((open) => !open)} aria-expanded={inventoryOpen} aria-controls="aldeem-inventory-menu">
          <Package size={19} strokeWidth={1.6} aria-hidden="true" /><span>المخزون</span><ChevronDown size={15} className={`${styles.chevron} ${inventoryOpen ? styles.expanded : ""}`} aria-hidden="true" />
        </button>
        <div id="aldeem-inventory-menu" className={styles.submenu} hidden={!inventoryOpen}>
          {inventorySections.map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`${styles.subItem} ${section === id ? styles.subActive : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{title}</span></button>)}
        </div>
        <button type="button" className={`${styles.navItem} ${selectedProducer ? styles.groupSelected : ""}`} onClick={() => setProducersOpen((open) => !open)} aria-expanded={producersOpen} aria-controls="aldeem-producers-menu">
          <UsersRound size={19} strokeWidth={1.6} aria-hidden="true" /><span>الأسر المنتجة</span><ChevronDown size={15} className={`${styles.chevron} ${producersOpen ? styles.expanded : ""}`} aria-hidden="true" />
        </button>
        <div id="aldeem-producers-menu" className={styles.submenu} hidden={!producersOpen}>
          {producerSections.map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`${styles.subItem} ${section === id ? styles.subActive : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{title}</span></button>)}
        </div>
        <button type="button" className={`${styles.navItem} ${selectedFranchise ? styles.groupSelected : ""}`} onClick={() => setFranchiseOpen((open) => !open)} aria-expanded={franchiseOpen} aria-controls="aldeem-franchise-menu">
          <Store size={19} strokeWidth={1.6} aria-hidden="true" /><span>الفرنشايز</span><ChevronDown size={15} className={`${styles.chevron} ${franchiseOpen ? styles.expanded : ""}`} aria-hidden="true" />
        </button>
        <div id="aldeem-franchise-menu" className={styles.submenu} hidden={!franchiseOpen}>
          {franchiseSections.map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`${styles.subItem} ${section === id ? styles.subActive : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{title}</span></button>)}
        </div>
        <button type="button" className={`${styles.navItem} ${selectedWorkshop ? styles.groupSelected : ""}`} onClick={() => setWorkshopOpen((open) => !open)} aria-expanded={workshopOpen} aria-controls="aldeem-workshop-menu">
          <Factory size={19} strokeWidth={1.6} aria-hidden="true" /><span>المعمل</span><ChevronDown size={15} className={`${styles.chevron} ${workshopOpen ? styles.expanded : ""}`} aria-hidden="true" />
        </button>
        <div id="aldeem-workshop-menu" className={styles.submenu} hidden={!workshopOpen}>
          {workshopSections.map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`${styles.subItem} ${section === id ? styles.subActive : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{title}</span></button>)}
        </div>
        <button type="button" className={`${styles.navItem} ${selectedCustomer ? styles.groupSelected : ""}`} onClick={() => setCustomersOpen((open) => !open)} aria-expanded={customersOpen} aria-controls="aldeem-customers-menu">
          <UsersRound size={19} strokeWidth={1.6} aria-hidden="true" /><span>العملاء</span><ChevronDown size={15} className={`${styles.chevron} ${customersOpen ? styles.expanded : ""}`} aria-hidden="true" />
        </button>
        <div id="aldeem-customers-menu" className={styles.submenu} hidden={!customersOpen}>
          {customerSections.map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`${styles.subItem} ${section === id ? styles.subActive : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{title}</span></button>)}
        </div>
        {demo && !loyaltyPage ? <>
          <button type="button" className={`${styles.navItem} ${selectedLoyalty ? styles.groupSelected : ""}`} onClick={() => setLoyaltyOpen((open) => !open)} aria-expanded={loyaltyOpen} aria-controls="aldeem-loyalty-menu">
            <Star size={19} strokeWidth={1.6} aria-hidden="true" /><span>نقاط الولاء والاختام</span><ChevronDown size={15} className={`${styles.chevron} ${loyaltyOpen ? styles.expanded : ""}`} aria-hidden="true" />
          </button>
          <div id="aldeem-loyalty-menu" className={styles.submenu} hidden={!loyaltyOpen}>
            {loyaltyDemoSections.map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`${styles.subItem} ${section === id ? styles.subActive : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{title}</span></button>)}
          </div>
        </> : loyaltyEnabled && <>
          <button type="button" className={`${styles.navItem} ${loyaltyPage ? styles.groupSelected : ""}`} onClick={() => setLoyaltyOpen((open) => !open)} aria-expanded={loyaltyOpen} aria-controls="aldeem-loyalty-menu">
            <Star size={19} strokeWidth={1.6} aria-hidden="true" /><span>نقاط الولاء والاختام</span><ChevronDown size={15} className={`${styles.chevron} ${loyaltyOpen ? styles.expanded : ""}`} aria-hidden="true" />
          </button>
          <div id="aldeem-loyalty-menu" className={styles.submenu} hidden={!loyaltyOpen}>
            <Link href="/dashboard/loyalty/branches" className={`${styles.subItem} ${pathname === "/dashboard/loyalty/branches" ? styles.subActive : ""}`} aria-current={pathname === "/dashboard/loyalty/branches" ? "page" : undefined}><Store size={16} aria-hidden="true" /><span>الفروع</span></Link>
            <Link href="/dashboard/loyalty" className={`${styles.subItem} ${pathname === "/dashboard/loyalty" ? styles.subActive : ""}`} aria-current={pathname === "/dashboard/loyalty" ? "page" : undefined}><Star size={16} aria-hidden="true" /><span>إدارة المكافآت</span></Link>
            <Link href="/dashboard/loyalty/settings" className={`${styles.subItem} ${pathname === "/dashboard/loyalty/settings" ? styles.subActive : ""}`} aria-current={pathname === "/dashboard/loyalty/settings" ? "page" : undefined}><Settings size={16} aria-hidden="true" /><span>إعدادات الولاء</span></Link>
            <Link href="/dashboard/loyalty/guide" className={`${styles.subItem} ${pathname === "/dashboard/loyalty/guide" ? styles.subActive : ""}`} aria-current={pathname === "/dashboard/loyalty/guide" ? "page" : undefined}><FileText size={16} aria-hidden="true" /><span>دليل نظام الولاء</span></Link>
          </div>
        </>}
        <button type="button" className={`${styles.navItem} ${selectedManufacturing ? styles.groupSelected : ""}`} onClick={() => setManufacturingOpen((open) => !open)} aria-expanded={manufacturingOpen} aria-controls="aldeem-manufacturing-menu">
          <Factory size={19} strokeWidth={1.6} aria-hidden="true" /><span>المصنع</span><ChevronDown size={15} className={`${styles.chevron} ${manufacturingOpen ? styles.expanded : ""}`} aria-hidden="true" />
        </button>
        <div id="aldeem-manufacturing-menu" className={styles.submenu} hidden={!manufacturingOpen}>
          {manufacturingSections.map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`${styles.subItem} ${section === id ? styles.subActive : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{title}</span></button>)}
        </div>
        <button type="button" className={`${styles.navItem} ${selectedFinance ? styles.groupSelected : ""}`} onClick={() => setFinanceOpen((open) => !open)} aria-expanded={financeOpen} aria-controls="aldeem-finance-menu">
          <Wallet size={19} strokeWidth={1.6} aria-hidden="true" /><span>المالية</span><ChevronDown size={15} className={`${styles.chevron} ${financeOpen ? styles.expanded : ""}`} aria-hidden="true" />
        </button>
        <div id="aldeem-finance-menu" className={styles.submenu} hidden={!financeOpen}>
          {financeSections.map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`${styles.subItem} ${section === id ? styles.subActive : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{title}</span></button>)}
        </div>
        <button type="button" className={`${styles.navItem} ${selectedEmployee ? styles.groupSelected : ""}`} onClick={() => setEmployeesOpen((open) => !open)} aria-expanded={employeesOpen} aria-controls="aldeem-employees-menu">
          <UsersRound size={19} strokeWidth={1.6} aria-hidden="true" /><span>الموظفين</span><ChevronDown size={15} className={`${styles.chevron} ${employeesOpen ? styles.expanded : ""}`} aria-hidden="true" />
        </button>
        <div id="aldeem-employees-menu" className={styles.submenu} hidden={!employeesOpen}>
          {employeeSections.map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`${styles.subItem} ${section === id ? styles.subActive : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{title}</span></button>)}
        </div>
        <button type="button" className={`${styles.navItem} ${selectedSettings ? styles.groupSelected : ""}`} onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} aria-controls="aldeem-settings-menu">
          <Settings size={19} strokeWidth={1.6} aria-hidden="true" /><span>الإعدادات</span><ChevronDown size={15} className={`${styles.chevron} ${settingsOpen ? styles.expanded : ""}`} aria-hidden="true" />
        </button>
        <div id="aldeem-settings-menu" className={styles.submenu} hidden={!settingsOpen}>
          {settingsSections.map(({ id, title, icon: Icon }) => <button key={id} type="button" className={`${styles.subItem} ${section === id ? styles.subActive : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={16} strokeWidth={1.6} aria-hidden="true" /><span>{title}</span></button>)}
        </div>
      </nav>
      <footer className={styles.footer}>
        {maintenance ? <button onClick={exitMaintenance} disabled={pending}><LogOut size={17} aria-hidden="true" />{pending ? "جار إنهاء الصيانة" : "إنهاء وضع الصيانة"}</button> : <form action={logoutAction}><LogoutButton /></form>}
        {error && <p role="alert">{error}</p>}
        <div className={styles.platformSignature}>
          <span>يعمل بواسطة</span>
          <Image src="/brand/barndaksa-logo-brown.png" alt="برندة" width={80} height={43} />
        </div>
      </footer>
    </aside>
    <main id="aldeem-overview" className={`${styles.canvas} ${!loyaltyPage && posSettingPage ? styles.blankPosPage : ""}`} tabIndex={-1} aria-label={loyaltyPage ? "الولاء" : posSettingPage?.title ?? selectedPage?.title ?? "نظرة عامة"}>
      {loyaltyPage ? children : !locationReady ? <p role="status">جار استعادة الصفحة</p> : <>
      {selectedPage && <header className={styles.pageHeader}><span>{selectedSales ? "المبيعات" : selectedPurchase ? "المشتريات" : selectedPos ? "نقاط البيع" : selectedInventory ? "المخزون" : selectedProducer ? "الأسر المنتجة" : selectedFranchise ? "الفرنشايز" : selectedWorkshop ? "المعمل" : selectedCustomer ? "العملاء" : selectedLoyalty ? "نقاط الولاء والاختام" : selectedManufacturing ? "التصنيع" : selectedFinance ? "المالية" : selectedEmployee ? "الموظفين" : "الإعدادات"}</span><h1>{selectedPage.title}</h1></header>}
      {section === "pos-main-settings" && <nav className={styles.posSettingsList} aria-label="إعدادات نقاط البيع الرئيسية">
        {posSettingPages.map(item => <button key={item.id} type="button" className={styles.subItem} onClick={() => setSection(item.id)}>{item.title}</button>)}
      </nav>}
      {demo ? !inPosSettings && <AldeemDemo section={section} title={selectedPage?.title ?? "نظرة عامة"} go={value => setSection(value as Section)} /> : <>
      {section === "system-sections" && <SystemSectionSettings />}
      {section === "overview" ? <AldeemRealOverview onNavigate={value => setSection(value as Section)} /> : section === "inventory-warehouses" || section === "finance-treasuries" ? <AldeemOperationalPresentation key={section} section={section} /> : ALDEEM_OPERATIONAL_SECTIONS[section] && <AldeemOperationalWorkspace key={section} section={section} />}
      {selectedProducer && <AldeemFamilies section={section} />}
      {selectedManufacturing && <AldeemManufacturing key={section} initialTab={section === "manufacturing-quality-reports" ? "report" : section === "manufacturing-batches" ? "trace" : section === "manufacturing-operations" || section === "manufacturing-monitor" ? "production" : "quality"} />}
      {selectedWorkshop && <AldeemWorkshop section={section} />}
      {selectedFranchise && <AldeemFranchiseWorkspace key={section} section={section} />}
      {section === "customer-points" && <AldeemCustomerPoints />}
      {(customersVisited || section === "customer-balances") && <div hidden={section !== "customer-management" && section !== "customer-balances"}><AldeemCustomers /></div>}
      {salesVisited && <div hidden={section !== "sales-invoices"}><AldeemSalesInvoices /></div>}
      {quotesVisited && <div hidden={section !== "sales-quotes"}><AldeemSalesQuotes /></div>}
      {returnsVisited && <div hidden={section !== "sales-returns"}><AldeemSalesReturns /></div>}
      {posVisited && <div hidden={!selectedPos || inPosSettings}><AldeemPosManagement section={section === "pos-active-shifts" || section === "pos-price-management" ? section : "branch-pos-management"} /></div>}
      {purchasesVisited["purchase-invoices"] && <div hidden={section !== "purchase-invoices"}><AldeemPurchases kind="invoice" /></div>}
      {purchasesVisited["purchase-requests"] && <div hidden={section !== "purchase-requests"}><AldeemPurchases kind="request" /></div>}
      {purchasesVisited["purchase-orders"] && <div hidden={section !== "purchase-orders"}><AldeemPurchases kind="order" /></div>}
      {purchasesVisited["purchase-returns"] && <div hidden={section !== "purchase-returns"}><AldeemPurchaseReturns /></div>}
      </>}
      </>}
    </main>
  </div>;
}
