import { Star } from "lucide-react";
import { FinanceEmptyState } from "@/components/branda-finance/finance-empty-state";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceStatCard } from "@/components/branda-finance/finance-stat-card";
import { FinanceTable } from "@/components/branda-finance/finance-table";
import { getBrandaFinanceRealWorkspaceData } from "@/lib/branda-finance/real-data";

export async function LoyaltyPointsWorkspace() {
  const data = await getBrandaFinanceRealWorkspaceData();
  const eligibleProducts = data.products.filter((product) => product.loyaltyEarnEligible);

  return (
    <FinancePageShell
      title="نقاط الولاء المتقدمة"
      description="تعرض الصفحة المنتجات الحقيقية المؤهلة للولاء من القائمة. لا يتم تعديل أرصدة ولاء من Branda Finance."
      status="قراءة حقيقية"
      actions={[{ label: "الكاشير", href: "/dashboard/branda-finance/sales", primary: true }, { label: "بطاقات الولاء", href: "/dashboard/loyalty" }]}
    >
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceStatCard label="منتجات القائمة" value={String(data.products.length)} tone="green" />
        <FinanceStatCard label="مؤهلة للكسب" value={String(eligibleProducts.length)} tone="gold" />
        <FinanceStatCard label="الفواتير" value={String(data.salesInvoices.length)} tone="brown" />
        <FinanceStatCard label="تعديل أرصدة" value="غير مفعل" tone="red" />
      </section>

      {data.products.length ? (
        <FinanceTable
          minWidth="860px"
          headers={["المنتج", "التصنيف", "نقاط الكسب", "مؤهل", "ملاحظة"]}
          rows={data.products.map((product) => [
            product.name,
            product.category,
            product.loyaltyPointsEarned ?? 0,
            product.loyaltyEarnEligible ? "نعم" : "لا",
            "قراءة فقط من بيانات المنتج",
          ])}
        />
      ) : (
        <FinanceEmptyState title="لا توجد منتجات حقيقية بعد" detail="أضف منتجات في القائمة قبل استخدام إعدادات الولاء المالية." />
      )}

      <div className="rounded-[8px] border border-[#D6B677] bg-[#FFF8EA] p-3 text-[12px] font-bold leading-6 text-[#6B431C]">
        <div className="mb-2 inline-flex items-center gap-2 font-black">
          <Star className="h-4 w-4" />
          حالة الربط
        </div>
        <p>لا توجد كتابة في أرصدة الولاء من هذه الصفحة. إنشاء الفواتير المحفوظة يتم من شاشة المبيعات أو نموذج الفاتورة.</p>
      </div>
    </FinancePageShell>
  );
}
