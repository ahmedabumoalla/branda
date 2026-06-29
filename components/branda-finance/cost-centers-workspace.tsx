import { FinanceEmptyState } from "@/components/branda-finance/finance-empty-state";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceStatCard } from "@/components/branda-finance/finance-stat-card";
import { formatFinanceAmount } from "@/components/branda-finance/invoice-totals";
import { getBrandaFinanceRealWorkspaceData } from "@/lib/branda-finance/real-data";

export async function CostCentersWorkspace() {
  const data = await getBrandaFinanceRealWorkspaceData();
  const totalInvoices = data.salesInvoices.reduce((sum, invoice) => sum + invoice.total, 0);

  return (
    <FinancePageShell
      title="مراكز التكلفة"
      description="لا يحتوي migration الحالي على جدول مراكز تكلفة. تظهر الصفحة حالة فارغة مع ملخص الفواتير الحقيقي فقط."
      status="حالة فارغة"
      actions={[{ label: "شجرة الحسابات", href: "/dashboard/branda-finance/accountant/chart-of-accounts" }]}
    >
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceStatCard label="مراكز محفوظة" value="0" hint="لا يوجد جدول مراكز تكلفة" />
        <FinanceStatCard label="الفواتير" value={String(data.salesInvoices.length)} tone="green" />
        <FinanceStatCard label="إجمالي الفواتير" value={formatFinanceAmount(totalInvoices)} tone="brown" />
        <FinanceStatCard label="القيود" value={String(data.journalEntries.length)} tone="gold" />
      </section>
      <FinanceEmptyState title="لا توجد مراكز تكلفة حقيقية بعد" detail="أنشئ migration مخصصًا لمراكز التكلفة قبل تمكين الإدخال أو التوزيع المحاسبي." />
    </FinancePageShell>
  );
}
