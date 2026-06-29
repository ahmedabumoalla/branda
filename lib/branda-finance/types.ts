import type {
  FinanceAccount,
  FinanceBranch,
  FinanceCategory,
  FinanceCustomer,
  FinancePaymentMethod,
  FinanceProduct,
  FinanceSupplier,
  FinanceTaxRate,
  FinanceWarehouse,
} from "@/lib/branda-finance/invoice-types";

export type FinanceDemoStatus = "جاهز" | "محلي فقط" | "يتطلب ربط لاحق" | "معطل بوضوح";

export type FinanceCostCenter = {
  id: string;
  name: string;
  owner: string;
  budget: number;
  actual: number;
};

export type FinanceProject = {
  id: string;
  name: string;
  branchId: string;
  revenue: number;
  cost: number;
  status: string;
};

export type FinanceCashBox = {
  id: string;
  name: string;
  branchId: string;
  balance: number;
  lastClosedAt: string;
};

export type FinanceBankAccount = {
  id: string;
  name: string;
  iban: string;
  balance: number;
  status: FinanceDemoStatus;
};

export type FinanceDemoInvoice = {
  id: string;
  number: string;
  customerId: string;
  branchId: string;
  warehouseId: string;
  issueDate: string;
  dueDate: string;
  status: string;
  paymentMethodId: FinancePaymentMethod["id"];
  paidAmount: number;
  items: Array<{
    productId: string;
    description: string;
    quantity: number;
    price: number;
    discount: number;
    taxRate: number;
  }>;
};

export type FinancePurchaseInvoice = {
  id: string;
  number: string;
  supplierId: string;
  warehouseId: string;
  issueDate: string;
  status: string;
  subtotal: number;
  vat: number;
};

export type FinanceJournalEntry = {
  id: string;
  date: string;
  source: string;
  memo: string;
  lines: Array<{
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
  }>;
};

export type FinanceStockMovement = {
  id: string;
  productId: string;
  warehouseId: string;
  type: "بيع" | "شراء" | "تسوية";
  quantity: number;
  date: string;
};

export type FinanceEmployee = {
  id: string;
  name: string;
  role: string;
  monthlySalary: number;
  custodyBalance: number;
};

export type FinanceTemplate = {
  id: string;
  name: string;
  type: string;
  status: FinanceDemoStatus;
};

export type FinanceIntegration = {
  id: string;
  name: string;
  status: FinanceDemoStatus;
  note: string;
};

export type FinanceAlert = {
  id: string;
  title: string;
  detail: string;
  severity: "info" | "warning" | "danger";
};

export type FinanceActionPermission = {
  id: string;
  title: string;
  readyFor: string;
};

export type BrandaFinanceDemoData = {
  branches: FinanceBranch[];
  warehouses: FinanceWarehouse[];
  customers: FinanceCustomer[];
  suppliers: FinanceSupplier[];
  employees: FinanceEmployee[];
  products: FinanceProduct[];
  services: FinanceProduct[];
  categories: FinanceCategory[];
  taxRates: FinanceTaxRate[];
  accounts: FinanceAccount[];
  chartOfAccounts: FinanceAccount[];
  costCenters: FinanceCostCenter[];
  projects: FinanceProject[];
  cashBoxes: FinanceCashBox[];
  bankAccounts: FinanceBankAccount[];
  paymentMethods: FinancePaymentMethod[];
  invoices: FinanceDemoInvoice[];
  purchaseInvoices: FinancePurchaseInvoice[];
  journalEntries: FinanceJournalEntry[];
  stockMovements: FinanceStockMovement[];
  payrollItems: FinanceEmployee[];
  reports: Array<{ slug: string; title: string; description: string }>;
  templates: FinanceTemplate[];
  integrations: FinanceIntegration[];
  alerts: FinanceAlert[];
  permissions: FinanceActionPermission[];
};
