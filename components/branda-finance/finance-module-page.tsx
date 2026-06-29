import { FinanceActionCard } from "@/components/branda-finance/finance-action-card";
import { FinanceEmptyState } from "@/components/branda-finance/finance-empty-state";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceStatCard } from "@/components/branda-finance/finance-stat-card";
import { FinanceStatusBadge } from "@/components/branda-finance/finance-status-badge";
import { FinanceTable } from "@/components/branda-finance/finance-table";
import { FinanceTabs } from "@/components/branda-finance/finance-tabs";
import { formatFinanceAmount } from "@/components/branda-finance/invoice-totals";
import { getBrandaFinanceRealWorkspaceData } from "@/lib/branda-finance/real-data";
import { brandaFinanceWorkflowBoundaries } from "@/lib/branda-finance/workflows";

export type FinanceModuleKind =
  | "purchases"
  | "parties"
  | "catalog"
  | "accountant"
  | "banking"
  | "payroll"
  | "assets"
  | "costCenters"
  | "projects"
  | "branches"
  | "developer"
  | "integrations"
  | "templates"
  | "accountantService"
  | "help";

const moduleMeta: Record<FinanceModuleKind, { title: string; description: string; status: string }> = {
  purchases: { title: "المشتريات", description: "لا توجد جداول مشتريات في migration الحالي؛ تعرض الصفحة الموردين الحقيقيين وحالة فارغة للمشتريات.", status: "بيانات حقيقية" },
  parties: { title: "العملاء والموردون", description: "أطراف مالية مقروءة من finance_customers و finance_suppliers.", status: "مرتبط" },
  catalog: { title: "المنتجات والخدمات والمخزون", description: "المنتجات من القائمة التشغيلية والمستودعات من finance_warehouses.", status: "مرتبط" },
  accountant: { title: "للمحاسب", description: "الحسابات والقيود تقرأ من finance_accounts و finance_journal_entries.", status: "مرتبط" },
  banking: { title: "الحسابات البنكية والصناديق", description: "تعرض المدفوعات وجلسات النقد المتاحة من الجداول المالية.", status: "مرتبط" },
  payroll: { title: "الرواتب والموظفين", description: "لا توجد جداول رواتب في migration الحالي.", status: "حالة فارغة" },
  assets: { title: "الأصول الثابتة", description: "لا توجد جداول أصول في migration الحالي.", status: "حالة فارغة" },
  costCenters: { title: "مراكز التكلفة", description: "لا توجد جداول مراكز تكلفة في migration الحالي.", status: "حالة فارغة" },
  projects: { title: "المشاريع", description: "لا توجد جداول مشاريع في migration الحالي.", status: "حالة فارغة" },
  branches: { title: "الفروع", description: "الفروع الحقيقية من جدول branches مع ملخص فواتير Branda Finance.", status: "مرتبط" },
  developer: { title: "للمطورين", description: "ملخص الجداول المالية المقروءة من Supabase.", status: "مرتبط" },
  integrations: { title: "التكاملات", description: "لا توجد تكاملات خارجية مفعلة من هذا الربط.", status: "حالة فارغة" },
  templates: { title: "القوالب", description: "لا توجد جداول قوالب في migration الحالي.", status: "حالة فارغة" },
  accountantService: { title: "التعاقد مع محاسب", description: "لا توجد جداول خدمة محاسب في migration الحالي.", status: "حالة فارغة" },
  help: { title: "مركز المساعدة", description: "إرشادات مختصرة عن حالة الربط الحالي.", status: "جاهز" },
};

function moduleActions() {
  return [
    { title: "إنشاء فاتورة مبيعات", href: "/dashboard/branda-finance/invoicing/create", description: "يحفظ في finance_sales_invoices و finance_sales_invoice_items" },
    { title: "فتح شاشة المبيعات", href: "/dashboard/branda-finance/sales", description: "إنشاء فاتورة كاشير محفوظة" },
    { title: "فواتير المبيعات", href: "/dashboard/branda-finance/invoicing", description: "قائمة الفواتير الحقيقية" },
    { title: "التقارير المالية", href: "/dashboard/branda-finance/reports", description: "تقارير من الجداول المتاحة" },
  ];
}

export async function FinanceModulePage({ kind }: { kind: FinanceModuleKind }) {
  const meta = moduleMeta[kind];
  const data = await getBrandaFinanceRealWorkspaceData();
  const totalInvoices = data.salesInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const totalDue = data.salesInvoices.reduce((sum, invoice) => sum + invoice.amountDue, 0);

  const stats = [
    { label: "الفواتير", value: String(data.salesInvoices.length), hint: "finance_sales_invoices", tone: "green" as const },
    { label: "إجمالي محفوظ", value: formatFinanceAmount(totalInvoices), hint: "حسب الفواتير", tone: "brown" as const },
    { label: "الرصيد المستحق", value: formatFinanceAmount(totalDue), hint: "amount_due", tone: "gold" as const },
    { label: "المدفوعات", value: String(data.payments.length), hint: "finance_payments", tone: "green" as const },
  ];

  const rows =
    kind === "parties"
      ? [
          ...data.customers.map((customer) => [customer.name, "عميل", customer.vatNumber ?? customer.paymentTerms, customer.phone ?? "", customer.email ?? ""]),
          ...data.suppliers.map((supplier) => [supplier.name, "مورد", supplier.vatNumber ?? "", supplier.phone ?? "", supplier.email ?? ""]),
        ]
      : kind === "catalog"
        ? data.products.map((product) => [product.name, product.category, product.sku, product.stock, formatFinanceAmount(product.price)])
        : kind === "accountant"
          ? data.accounts.map((account) => [account.code, account.name, "نشط", "", ""])
          : kind === "branches"
            ? data.branches.map((branch) => [branch.displayName || branch.name, branch.city, branch.address, branch.phone ?? "", ""])
            : kind === "banking"
              ? data.payments.map((payment) => [payment.paymentMethod, payment.status, payment.paidAt, formatFinanceAmount(payment.amount), payment.invoiceId ?? ""])
              : data.salesInvoices.map((invoice) => [
                  invoice.invoiceNumber ?? invoice.id.slice(0, 8),
                  invoice.customerName ?? "عميل نقدي",
                  invoice.status,
                  invoice.issueDate,
                  formatFinanceAmount(invoice.total),
                ]);

  return (
    <FinancePageShell
      title={meta.title}
      description={meta.description}
      status={meta.status}
      actions={[
        { label: "المركز المالي", href: "/dashboard/branda-finance" },
        { label: "إنشاء فاتورة", href: "/dashboard/branda-finance/invoicing/create", primary: true },
      ]}
    >
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <FinanceStatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          <FinanceTabs tabs={["نظرة عامة", "بيانات حقيقية", "حالات فارغة"]} />
          {rows.length ? (
            <FinanceTable headers={["البند", "التصنيف", "الحالة", "التاريخ / الاتصال", "القيمة"]} rows={rows} minWidth="860px" />
          ) : (
            <FinanceEmptyState title="لا توجد بيانات محفوظة لهذا القسم" detail="لم يتم إدخال سجلات في الجداول المقابلة لهذا القسم بعد." />
          )}
        </div>
        <aside className="min-w-0 space-y-3">
          <div className="rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
            <h2 className="text-[13px] font-black text-[#2F241D]">روابط العمل</h2>
            <div className="mt-2 grid gap-2">
              {moduleActions().map((action) => (
                <FinanceActionCard key={action.href + action.title} {...action} />
              ))}
            </div>
          </div>
          <FinanceEmptyState title="حدود الربط الحالي" detail={brandaFinanceWorkflowBoundaries.join(" ")} />
          <div className="rounded-[8px] border border-[#E8D8C2] bg-[#FFFDF8] p-3">
            <h2 className="text-[13px] font-black text-[#2F241D]">حالة البيانات</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <FinanceStatusBadge tone="green">Supabase</FinanceStatusBadge>
              <FinanceStatusBadge tone="gold">بدون demo</FinanceStatusBadge>
              <FinanceStatusBadge tone="brown">{`${data.auditEventCount} سجل تدقيق`}</FinanceStatusBadge>
            </div>
          </div>
        </aside>
      </section>
    </FinancePageShell>
  );
}
