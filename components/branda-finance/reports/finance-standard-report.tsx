import { FinanceReportPage } from "@/components/branda-finance/finance-report-page";
import { FinanceReportTable } from "@/components/branda-finance/finance-report-table";
import { FinanceStatusBadge } from "@/components/branda-finance/finance-status-badge";
import { formatFinanceAmount } from "@/components/branda-finance/invoice-totals";
import { getBrandaFinanceRealWorkspaceData } from "@/lib/branda-finance/real-data";

export type StandardReportKind =
  | "trial-balance"
  | "statement-account"
  | "general-ledger"
  | "cash-flow"
  | "bank-reconciliation"
  | "profit-loss"
  | "tax"
  | "sales"
  | "purchases"
  | "inventory"
  | "branches"
  | "products";

const reportTitle: Record<StandardReportKind, string> = {
  "trial-balance": "ميزان المراجعة",
  "statement-account": "كشف الحساب",
  "general-ledger": "دفتر الأستاذ العام",
  "cash-flow": "التدفق النقدي",
  "bank-reconciliation": "تسوية مصرفية",
  "profit-loss": "الأرباح والخسائر",
  tax: "تقرير الضريبة",
  sales: "تقرير المبيعات",
  purchases: "تقرير المشتريات",
  inventory: "تقرير المخزون",
  branches: "تقرير الفروع",
  products: "تقرير المنتجات",
};

export async function FinanceStandardReport({ kind }: { kind: StandardReportKind }) {
  const data = await getBrandaFinanceRealWorkspaceData();
  const salesTotal = data.salesInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const taxTotal = data.salesInvoices.reduce((sum, invoice) => sum + invoice.taxTotal, 0);
  const paidTotal = data.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const dueTotal = data.salesInvoices.reduce((sum, invoice) => sum + invoice.amountDue, 0);

  const sections =
    kind === "trial-balance"
      ? [
          {
            title: "الحسابات",
            headers: ["الكود", "الحساب", "مدين", "دائن"],
            rows: data.accounts.map((account) => [account.code, account.name, formatFinanceAmount(0), formatFinanceAmount(0)]),
            minWidth: "760px",
          },
        ]
      : kind === "general-ledger"
        ? [
            {
              title: "قيود اليومية",
              headers: ["التاريخ", "المصدر", "الحالة", "مدين", "دائن", "البيان"],
              rows: data.journalEntries.map((entry) => [
                entry.entryDate,
                entry.sourceType,
                entry.status,
                formatFinanceAmount(entry.totalDebit),
                formatFinanceAmount(entry.totalCredit),
                entry.memo ?? "",
              ]),
              minWidth: "900px",
            },
          ]
        : kind === "products" || kind === "inventory"
          ? [
              {
                title: "المنتجات",
                headers: ["المنتج", "التصنيف", "SKU", "المخزون", "السعر"],
                rows: data.products.map((product) => [product.name, product.category, product.sku, product.stock, formatFinanceAmount(product.price)]),
                minWidth: "900px",
              },
            ]
          : kind === "branches"
            ? [
                {
                  title: "الفروع",
                  headers: ["الفرع", "المدينة", "العنوان", "الهاتف"],
                  rows: data.branches.map((branch) => [branch.displayName || branch.name, branch.city, branch.address, branch.phone ?? ""]),
                  minWidth: "760px",
                },
              ]
            : kind === "purchases"
              ? [
                  {
                    title: "الموردون",
                    headers: ["المورد", "الرقم الضريبي", "الهاتف", "البريد"],
                    rows: data.suppliers.map((supplier) => [supplier.name, supplier.vatNumber ?? "", supplier.phone ?? "", supplier.email ?? ""]),
                    minWidth: "760px",
                  },
                ]
              : [
                  {
                    title: "فواتير المبيعات",
                    headers: ["الفاتورة", "العميل", "الحالة", "التاريخ", "الإجمالي", "المستحق"],
                    rows: data.salesInvoices.map((invoice) => [
                      invoice.invoiceNumber ?? invoice.id.slice(0, 8),
                      invoice.customerName ?? "عميل نقدي",
                      invoice.status,
                      invoice.issueDate,
                      formatFinanceAmount(invoice.total),
                      formatFinanceAmount(invoice.amountDue),
                    ]),
                    minWidth: "940px",
                  },
                ];

  return (
    <FinanceReportPage
      title={reportTitle[kind]}
      description="تقرير مبني على جداول Branda Finance المتاحة في Supabase. عند عدم وجود سجلات يظهر التقرير فارغًا بدون بيانات تجريبية."
      kpis={[
        { label: "إجمالي الفواتير", value: formatFinanceAmount(salesTotal), tone: "green" },
        { label: "المدفوع", value: formatFinanceAmount(paidTotal), tone: "gold" },
        { label: "المستحق", value: formatFinanceAmount(dueTotal), tone: "red" },
        { label: "الضريبة", value: formatFinanceAmount(taxTotal), tone: "brown" },
      ]}
      filters={["مصدر البيانات: Supabase", "العملة: SAR", "بدون بيانات demo"]}
    >
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {sections.map((section) => (
            <FinanceReportTable key={section.title} {...section} />
          ))}
        </div>
        <aside className="min-w-0 space-y-3">
          <div className="rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
            <h2 className="text-[13px] font-black text-[#2F241D]">حالة التقرير</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <FinanceStatusBadge tone="green">بيانات حقيقية</FinanceStatusBadge>
              <FinanceStatusBadge tone="gold">{`${data.salesInvoices.length} فاتورة`}</FinanceStatusBadge>
              <FinanceStatusBadge tone="brown">{`${data.journalEntries.length} قيد`}</FinanceStatusBadge>
            </div>
          </div>
        </aside>
      </div>
    </FinanceReportPage>
  );
}
