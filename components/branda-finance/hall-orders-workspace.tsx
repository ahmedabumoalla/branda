import { FinanceEmptyState } from "@/components/branda-finance/finance-empty-state";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceStatCard } from "@/components/branda-finance/finance-stat-card";
import { getBrandaFinanceRealWorkspaceData } from "@/lib/branda-finance/real-data";

export async function HallOrdersWorkspace() {
  const data = await getBrandaFinanceRealWorkspaceData();

  return (
    <FinancePageShell
      title="طلبات الصالة / الويتر"
      description="لا توجد جداول طلبات صالة ضمن migration المالي الحالي. استخدم شاشة المبيعات لإنشاء فاتورة محفوظة."
      status="حالة فارغة"
      actions={[{ label: "الكاشير", href: "/dashboard/branda-finance/sales", primary: true }]}
    >
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceStatCard label="طلبات محفوظة" value="0" hint="لا يوجد جدول طلبات صالة" />
        <FinanceStatCard label="منتجات متاحة" value={String(data.products.length)} tone="green" />
        <FinanceStatCard label="فروع متاحة" value={String(data.branches.length)} tone="brown" />
        <FinanceStatCard label="فواتير محفوظة" value={String(data.salesInvoices.length)} tone="gold" />
      </section>
      <FinanceEmptyState title="لا توجد طلبات صالة حقيقية بعد" detail="الصفحة لا تعرض بيانات تجريبية. عند إضافة جدول طلبات صالة يمكن ربطه هنا وتحويل الطلب إلى finance_sales_invoices." />
    </FinancePageShell>
  );
}
