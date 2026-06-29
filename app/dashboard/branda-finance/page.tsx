import { FinanceActionCard } from "@/components/branda-finance/finance-action-card";
import { FinanceEmptyState } from "@/components/branda-finance/finance-empty-state";
import { FinanceModuleGrid } from "@/components/branda-finance/finance-module-grid";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceStatCard } from "@/components/branda-finance/finance-stat-card";
import { brandaFinanceRoutes } from "@/lib/branda-finance/navigation";
import { getBrandaFinanceRealWorkspaceData } from "@/lib/branda-finance/real-data";
import { brandaFinanceWorkflowBoundaries } from "@/lib/branda-finance/workflows";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export default async function BrandaFinancePage() {
  const data = await getBrandaFinanceRealWorkspaceData();
  const features = await getOwnerFeatureCodes().catch(() => []);
  const loyaltyEnabled = featureCodesAllow(features, "loyalty");

  const stats = [
    ["المنتجات المرتبطة", String(data.products.length), "من قائمة العلامة الحقيقية", "green"],
    ["الفروع المرتبطة", String(data.branches.length), "من بيانات الفروع الحقيقية", "brown"],
    ["العملاء المرتبطون", String(data.customers.length), "من ملفات العملاء الحقيقية", "gold"],
    ["المستودعات", "غير مفعلة", "لا توجد جداول تشغيلية بعد", "red"],
    ["الحسابات المالية", "غير مفعلة", "لا توجد شجرة حسابات تشغيلية بعد", "red"],
    ["حفظ الفواتير", "معطل", "بانتظار جداول الفواتير والبنود", "red"],
    ["نقاط الولاء في الكاشير", loyaltyEnabled ? "مفعلة" : "مخفية", "حسب باقة العلامة", loyaltyEnabled ? "green" : "brown"],
    ["مصدر البيانات", "حقيقي", "بدون أرقام ديمو تشغيلية", "green"],
  ] as const;

  const actions = [
    { title: "إنشاء فاتورة مبيعات", href: "/dashboard/branda-finance/invoicing/create", description: "يقرأ منتجات وفروع وعملاء حقيقيين مع تعطيل الحفظ" },
    { title: "فتح شاشة المبيعات", href: "/dashboard/branda-finance/sales", description: "كاشير محلي ببيانات مرتبطة وحفظ معطل" },
    { title: "طلبات الصالة", href: "/dashboard/branda-finance/hall-orders", description: "واجهة محفوظة كمسار قادم للربط" },
    { title: "إضافة فاتورة مشتريات", href: "/dashboard/branda-finance/purchases", description: "بانتظار جداول الموردين والمشتريات" },
    { title: "إضافة عميل", href: "/dashboard/branda-finance/parties", description: "ملفات العملاء الحالية متاحة للقراءة فقط" },
    { title: "إضافة مورد", href: "/dashboard/branda-finance/parties", description: "بانتظار جدول الموردين" },
    { title: "تسجيل مصروف", href: "/dashboard/branda-finance/accountant", description: "بانتظار شجرة الحسابات والقيود" },
    { title: "فتح تقرير مالي", href: "/dashboard/branda-finance/reports", description: "تقارير تحتاج جداول مالية تشغيلية" },
    { title: "الكشوف الموحدة", href: "/dashboard/branda-finance/statements", description: "بانتظار أرصدة وحركات حقيقية" },
    { title: "شجرة الحسابات", href: "/dashboard/branda-finance/accountant/chart-of-accounts", description: "بانتظار جدول الحسابات" },
    ...(loyaltyEnabled
      ? [{ title: "نقاط الولاء", href: "/dashboard/branda-finance/loyalty-points", description: "تظهر فقط عند تفعيل الولاء في الباقة" }]
      : []),
  ];

  const visibleRoutes = brandaFinanceRoutes.filter((route) => {
    if (route.href === "/dashboard/branda-finance") return false;
    if (route.href === "/dashboard/branda-finance/loyalty-points") return loyaltyEnabled;
    return true;
  });

  return (
    <FinancePageShell
      title="برندا المالية"
      description="واجهة تجهيز للربط الحقيقي: تقرأ ما هو موجود فعليًا من المنتجات والفروع والعملاء، وتمنع حفظ الفواتير إلى أن تُضاف جداول الفواتير والبنود والمخزون والحسابات."
      status="جاهزية ربط"
      backHref="/dashboard"
      actions={[
        { label: "إنشاء فاتورة", href: "/dashboard/branda-finance/invoicing/create", primary: true },
        { label: "فتح الكاشير", href: "/dashboard/branda-finance/sales" },
      ]}
    >
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([label, value, hint, tone]) => (
          <FinanceStatCard key={label} label={label} value={value} hint={hint} tone={tone} />
        ))}
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
            <h2 className="text-[14px] font-black text-[#2F241D]">إجراءات سريعة</h2>
            <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {actions.map((action) => (
                <FinanceActionCard key={action.href + action.title} {...action} />
              ))}
            </div>
          </div>

          <div className="rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
            <h2 className="text-[14px] font-black text-[#2F241D]">الوحدات المالية</h2>
            <div className="mt-3">
              <FinanceModuleGrid routes={visibleRoutes} />
            </div>
          </div>
        </div>

        <aside className="min-w-0 space-y-3">
          <div className="rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
            <h2 className="text-[13px] font-black text-[#2F241D]">مصادر البيانات الحالية</h2>
            <div className="mt-2 space-y-2">
              {data.dataSourceNotes.map((note) => (
                <div key={note} className="rounded-[8px] border border-[#E8D8C2] bg-[#FAF3E8] p-2">
                  <p className="text-[11px] font-bold leading-5 text-[#806A58]">{note}</p>
                </div>
              ))}
            </div>
          </div>

          <FinanceEmptyState title="حدود الربط الحالي" detail={brandaFinanceWorkflowBoundaries.join(" ")} />
        </aside>
      </section>
    </FinancePageShell>
  );
}
