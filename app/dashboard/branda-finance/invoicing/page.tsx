import { FinanceActionCard } from "@/components/branda-finance/finance-action-card";
import { FinanceEmptyState } from "@/components/branda-finance/finance-empty-state";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceStatCard } from "@/components/branda-finance/finance-stat-card";
import { getBrandaFinanceRealWorkspaceData } from "@/lib/branda-finance/real-data";

export default async function BrandaFinanceInvoicingPage() {
  const data = await getBrandaFinanceRealWorkspaceData();

  return (
    <FinancePageShell
      title="فواتير المبيعات"
      description="قائمة الفواتير التشغيلية لا تعرض بيانات مصطنعة. إنشاء الفواتير يقرأ المنتجات والفروع والعملاء الحقيقيين، لكن الحفظ معطل إلى أن تتوفر جداول الفواتير وبنودها."
      status="بانتظار قاعدة البيانات"
      actions={[
        { label: "إنشاء فاتورة", href: "/dashboard/branda-finance/invoicing/create", primary: true },
        { label: "فتح المبيعات", href: "/dashboard/branda-finance/sales" },
      ]}
    >
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceStatCard label="فواتير محفوظة" value="0" hint="لا توجد جداول فواتير تشغيلية بعد" tone="red" />
        <FinanceStatCard label="منتجات متاحة للنموذج" value={String(data.products.length)} hint="من قائمة العلامة" tone="green" />
        <FinanceStatCard label="فروع متاحة للنموذج" value={String(data.branches.length)} hint="من جدول الفروع" tone="brown" />
        <FinanceStatCard label="عملاء متاحون للنموذج" value={String(data.customers.length)} hint="من ملفات العملاء" tone="gold" />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          <FinanceEmptyState
            title="لا توجد قائمة فواتير حقيقية بعد"
            detail="تم إيقاف عرض الفواتير المحلية في هذه الشاشة. عند إضافة جداول فواتير المبيعات وبنودها يمكن ربط هذه القائمة بالقراءة الحقيقية مع RLS وفلاتر الفرع والعميل والحالة."
          />
          <div className="rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
            <h2 className="text-[14px] font-black text-[#2F241D]">مصادر النموذج المتاحة</h2>
            <div className="mt-2 space-y-2">
              {data.dataSourceNotes.map((note) => (
                <p key={note} className="rounded-[8px] border border-[#E8D8C2] bg-[#FAF3E8] p-2 text-[11px] font-bold leading-5 text-[#806A58]">
                  {note}
                </p>
              ))}
            </div>
          </div>
        </div>

        <aside className="min-w-0 space-y-3">
          <FinanceActionCard title="إنشاء فاتورة جديدة" href="/dashboard/branda-finance/invoicing/create" description="افتح نموذج الإنشاء ببيانات حقيقية وحفظ معطل" />
          <FinanceActionCard title="فتح شاشة المبيعات" href="/dashboard/branda-finance/sales" description="حوّل السلة إلى معاينة فاتورة بدون حفظ" />
        </aside>
      </section>
    </FinancePageShell>
  );
}
