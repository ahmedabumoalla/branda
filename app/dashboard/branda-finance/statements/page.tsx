import Link from "next/link";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceReportCard } from "@/components/branda-finance/finance-report-card";
import { FinanceStatCard } from "@/components/branda-finance/finance-stat-card";
import { getStatementEntities } from "@/lib/branda-finance/statements";

const typeLabels = {
  customer: "عميل",
  supplier: "مورد",
  product: "منتج",
  service: "خدمة",
} as const;

export default async function BrandaFinanceStatementsPage() {
  const entities = await getStatementEntities();

  return (
    <FinancePageShell
      title="كشوف الحسابات والمنتجات"
      description="كشوف موحدة مبنية على العملاء والموردين والمنتجات الحقيقية المتاحة في Supabase."
      status="بيانات حقيقية"
      actions={[
        { label: "تقرير المبيعات", href: "/dashboard/branda-finance/reports/sales" },
        { label: "إنشاء فاتورة", href: "/dashboard/branda-finance/invoicing/create", primary: true },
      ]}
    >
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceStatCard label="العملاء" value={String(entities.filter((item) => item.type === "customer").length)} tone="green" />
        <FinanceStatCard label="الموردون" value={String(entities.filter((item) => item.type === "supplier").length)} tone="brown" />
        <FinanceStatCard label="المنتجات" value={String(entities.filter((item) => item.type === "product").length)} tone="gold" />
        <FinanceStatCard label="الخدمات" value="0" tone="brown" />
      </section>

      <section className="grid min-w-0 gap-3 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3 sm:grid-cols-2 xl:grid-cols-4">
        {["من 2026-06-01", "إلى 2026-06-28", "كل الفروع", "كل الكيانات"].map((filter) => (
          <div key={filter} className="h-9 rounded-[8px] border border-[#E1D1BD] bg-white px-3 py-2 text-[12px] font-black text-[#6D5544]">{filter}</div>
        ))}
      </section>

      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {entities.map((entity) => (
          <FinanceReportCard
            key={`${entity.type}-${entity.id}`}
            title={entity.title}
            section={typeLabels[entity.type]}
            description={entity.detail}
            href={`/dashboard/branda-finance/statements/${entity.type}/${entity.id}`}
          />
        ))}
      </section>

      <Link href="/dashboard/branda-finance/parties" className="w-fit rounded-[8px] border border-[#D8C7B2] bg-white px-3 py-2 text-[12px] font-black text-[#5B3926]">
        فتح العملاء والموردين
      </Link>
    </FinancePageShell>
  );
}
