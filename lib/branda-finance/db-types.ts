export const BRANDA_FINANCE_CORE_TABLES = [
  "finance_customers",
  "finance_suppliers",
  "finance_warehouses",
  "finance_sales_invoices",
  "finance_sales_invoice_items",
  "finance_payments",
  "finance_cash_sessions",
  "finance_invoice_sequences",
  "finance_accounts",
  "finance_journal_entries",
  "finance_journal_entry_lines",
  "finance_audit_events",
] as const;

export type BrandaFinanceCoreTable = (typeof BRANDA_FINANCE_CORE_TABLES)[number];

export type BrandaFinanceDbReadiness = {
  active: boolean;
  migrationDraftPath: string;
  missingTables: BrandaFinanceCoreTable[];
  disabledReason: string;
  canPersistSalesInvoices: boolean;
  canPersistPayments: boolean;
  canPostAccounting: boolean;
};

export type BrandaFinanceReadinessResult<TData> = {
  data: TData;
  readiness: BrandaFinanceDbReadiness;
};
