import type { ComponentType } from "react";
import { FinanceEmptyState } from "@/components/branda-finance/finance-empty-state";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { BankReconciliationReport } from "@/components/branda-finance/reports/bank-reconciliation-report";
import { BranchesReport } from "@/components/branda-finance/reports/branches-report";
import { CashFlowReport } from "@/components/branda-finance/reports/cash-flow-report";
import { GeneralLedgerReport } from "@/components/branda-finance/reports/general-ledger-report";
import { InventoryReport } from "@/components/branda-finance/reports/inventory-report";
import { ProductsReport } from "@/components/branda-finance/reports/products-report";
import { ProfitLossReport } from "@/components/branda-finance/reports/profit-loss-report";
import { PurchasesReport } from "@/components/branda-finance/reports/purchases-report";
import { SalesReport } from "@/components/branda-finance/reports/sales-report";
import { StatementAccountReport } from "@/components/branda-finance/reports/statement-account-report";
import { TaxReport } from "@/components/branda-finance/reports/tax-report";
import { TrialBalanceReport } from "@/components/branda-finance/reports/trial-balance-report";
import {
  brandaFinanceReports,
  getBrandaFinanceReportBySlug,
} from "@/lib/branda-finance/reports";

const reportComponents: Record<string, ComponentType> = {
  "trial-balance": TrialBalanceReport,
  "statement-of-account": StatementAccountReport,
  "customer-statement": StatementAccountReport,
  "supplier-statement": StatementAccountReport,
  "customer-balances-summary": StatementAccountReport,
  "supplier-balances-summary": StatementAccountReport,
  "customer-aging": StatementAccountReport,
  "supplier-aging": StatementAccountReport,
  "general-ledger": GeneralLedgerReport,
  "audit-log": GeneralLedgerReport,
  "cash-flow": CashFlowReport,
  "cash-forecast": CashFlowReport,
  "consolidated-cash-flow": CashFlowReport,
  "bank-reconciliation": BankReconciliationReport,
  "income-statement": ProfitLossReport,
  "profit-loss": ProfitLossReport,
  "consolidated-income-statement": ProfitLossReport,
  "vat": TaxReport,
  "taxes": TaxReport,
  "sales": SalesReport,
  "purchase-bills": PurchasesReport,
  "purchases": PurchasesReport,
  "expenses": PurchasesReport,
  "purchases-by-product-service": PurchasesReport,
  "inventory": InventoryReport,
  "inventory-movement": InventoryReport,
  "monthly-inventory-summary": InventoryReport,
  "branches": BranchesReport,
  "products": ProductsReport,
};

export function generateStaticParams() {
  return brandaFinanceReports.map((report) => ({
    reportSlug: report.slug,
  }));
}

export default async function BrandaFinanceReportPage({
  params,
}: {
  params: Promise<{ reportSlug: string }>;
}) {
  const { reportSlug } = await params;
  const ReportComponent = reportComponents[reportSlug];

  if (ReportComponent) {
    return <ReportComponent />;
  }

  const report = getBrandaFinanceReportBySlug(reportSlug);

  return (
    <FinancePageShell
      title={report?.title ?? "تقرير غير متاح"}
      eyebrow="تقارير براندا المالية"
      description={report?.description ?? `لم يتم تجهيز تقرير ${decodeURIComponent(reportSlug)} بعد داخل ديمو براندا فاينانس.`}
      status="غير متاح"
      backHref="/dashboard/branda-finance/reports"
      actions={[{ label: "مركز التقارير", href: "/dashboard/branda-finance/reports", primary: true }]}
    >
      <FinanceEmptyState
        title="التقرير غير جاهز للعرض"
        detail="المسار يعمل ولا يكسر الصفحة. أضفنا هذه الحالة الفارغة حتى تظهر تجربة مهنية بدلاً من صفحة خطأ عند فتح تقرير غير معروف."
      />
    </FinancePageShell>
  );
}
