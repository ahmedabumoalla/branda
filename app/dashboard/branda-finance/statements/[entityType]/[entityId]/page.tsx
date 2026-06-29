import { FinanceEmptyState } from "@/components/branda-finance/finance-empty-state";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceReportTable } from "@/components/branda-finance/finance-report-table";
import { FinanceStatCard } from "@/components/branda-finance/finance-stat-card";
import { financeAmount } from "@/lib/branda-finance/calculations";
import { getFinanceStatement, type FinanceStatementEntityType } from "@/lib/branda-finance/statements";

export default async function BrandaFinanceStatementDetailPage({
  params,
}: {
  params: Promise<{ entityType: string; entityId: string }>;
}) {
  const { entityType, entityId } = await params;
  const statement = getFinanceStatement(entityType as FinanceStatementEntityType, entityId);

  if (!statement) {
    return (
      <FinancePageShell title="كشف غير متاح" description="لم يتم العثور على الكيان المطلوب داخل بيانات المعاينة." status="غير متاح" backHref="/dashboard/branda-finance/statements">
        <FinanceEmptyState title="لا يوجد كشف لهذا المسار" detail="المسار يعمل بشكل آمن ويعرض هذه الحالة بدلاً من كسر الصفحة." />
      </FinancePageShell>
    );
  }

  return (
    <FinancePageShell
      title={statement.title}
      description={statement.description}
      status="ديمو محلي"
      backHref="/dashboard/branda-finance/statements"
      actions={[{ label: "كل الكشوف", href: "/dashboard/branda-finance/statements", primary: true }]}
    >
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <FinanceStatCard label="الرصيد الافتتاحي" value={financeAmount(statement.summary.openingBalance)} />
        <FinanceStatCard label="مدين" value={financeAmount(statement.summary.debit)} tone="green" />
        <FinanceStatCard label="دائن" value={financeAmount(statement.summary.credit)} tone="gold" />
        <FinanceStatCard label="صافي الحركة" value={financeAmount(statement.summary.netMovement)} tone="brown" />
        <FinanceStatCard label="الرصيد الختامي" value={financeAmount(statement.summary.closingBalance)} tone="green" />
      </section>

      <section className="grid min-w-0 gap-3 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3 sm:grid-cols-2 xl:grid-cols-4">
        {["الفترة: يونيو 2026", "الفرع: الكل", "العملة: SAR", "المصدر: ديمو محلي"].map((filter) => (
          <div key={filter} className="h-9 rounded-[8px] border border-[#E1D1BD] bg-white px-3 py-2 text-[12px] font-black text-[#6D5544]">{filter}</div>
        ))}
      </section>

      <FinanceReportTable title="تفاصيل الحركة" headers={statement.headers} rows={statement.rows} minWidth={statement.minWidth} />
    </FinancePageShell>
  );
}
