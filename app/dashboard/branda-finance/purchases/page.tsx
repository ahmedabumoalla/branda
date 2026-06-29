import { FinanceEmptyState } from "@/components/branda-finance/finance-empty-state";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";

export default function BrandaFinancePurchasesPage() {
  return (
    <FinancePageShell
      title="فواتير المشتريات"
      description="تم إيقاف نموذج المشتريات المحلي في هذه الشاشة إلى أن تتوفر جداول الموردين وفواتير المشتريات وبنودها."
      status="بانتظار قاعدة البيانات"
    >
      <FinanceEmptyState
        title="لا توجد مشتريات حقيقية متاحة بعد"
        detail="الربط الآمن القادم يحتاج جداول الموردين، فواتير المشتريات، بنود المشتريات، وربطها بالمخزون والحسابات قبل تفعيل الحفظ."
      />
    </FinancePageShell>
  );
}
