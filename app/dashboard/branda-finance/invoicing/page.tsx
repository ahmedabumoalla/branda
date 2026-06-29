import { FinanceActionCard } from "@/components/branda-finance/finance-action-card";
import { FinanceEmptyState } from "@/components/branda-finance/finance-empty-state";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceStatCard } from "@/components/branda-finance/finance-stat-card";
import { FinanceTable } from "@/components/branda-finance/finance-table";
import { formatFinanceAmount } from "@/components/branda-finance/invoice-totals";
import { getBrandaFinanceRealWorkspaceData } from "@/lib/branda-finance/real-data";

export default async function BrandaFinanceInvoicingPage() {
  const data = await getBrandaFinanceRealWorkspaceData();
  const totalInvoiced = data.salesInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const totalDue = data.salesInvoices.reduce((sum, invoice) => sum + invoice.amountDue, 0);

  return (
    <FinancePageShell
      title="فواتير المبيعات"
      description="قائمة الفواتير التشغيلية تقرأ الآن من جداول Branda Finance في Supabase."
      status="مرتبط بقاعدة البيانات"
      actions={[
        { label: "إنشاء فاتورة", href: "/dashboard/branda-finance/invoicing/create", primary: true },
        { label: "فتح المبيعات", href: "/dashboard/branda-finance/sales" },
      ]}
    >
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceStatCard label="فواتير محفوظة" value={String(data.salesInvoices.length)} hint="من finance_sales_invoices" tone="green" />
        <FinanceStatCard label="إجمالي الفواتير" value={formatFinanceAmount(totalInvoiced)} hint="حسب السجلات المحفوظة" tone="brown" />
        <FinanceStatCard label="الرصيد المستحق" value={formatFinanceAmount(totalDue)} hint="amount_due" tone="gold" />
        <FinanceStatCard label="مدفوعات محفوظة" value={String(data.payments.length)} hint="من finance_payments" tone="green" />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          {data.salesInvoices.length ? (
            <FinanceTable
              headers={["رقم الفاتورة", "العميل", "الحالة", "التاريخ", "الإجمالي", "المستحق"]}
              minWidth="860px"
              rows={data.salesInvoices.map((invoice) => [
                invoice.invoiceNumber ?? invoice.id.slice(0, 8),
                invoice.customerName ?? "عميل نقدي",
                invoice.status,
                invoice.issueDate,
                <span key="total" dir="ltr">{formatFinanceAmount(invoice.total)}</span>,
                <span key="due" dir="ltr">{formatFinanceAmount(invoice.amountDue)}</span>,
              ])}
            />
          ) : (
            <FinanceEmptyState
              title="لا توجد فواتير محفوظة بعد"
              detail="ستظهر هنا السجلات التي يتم إنشاؤها من شاشة المبيعات أو نموذج إنشاء الفاتورة."
            />
          )}
          <div className="rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
            <h2 className="text-[14px] font-black text-[#2F241D]">مصادر البيانات</h2>
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
          <FinanceActionCard title="إنشاء فاتورة جديدة" href="/dashboard/branda-finance/invoicing/create" description="افتح نموذج الإنشاء واحفظ في Supabase" />
          <FinanceActionCard title="فتح شاشة المبيعات" href="/dashboard/branda-finance/sales" description="حوّل السلة إلى فاتورة محفوظة" />
        </aside>
      </section>
    </FinancePageShell>
  );
}
