export type FinanceBranch = {
  id: string;
  name: string;
  displayName: string;
  city: string;
  address: string;
  phone?: string;
  licenseType?: string;
  licenseNumber?: string;
};

export type FinanceWarehouse = {
  id: string;
  name: string;
  branchId?: string;
  city: string;
};

export type FinanceCustomer = {
  id: string;
  name: string;
  country: string;
  vatRegistered: boolean;
  vatNumber?: string;
  city?: string;
  address?: string;
  email?: string;
  phone?: string;
  currency: "SAR";
  paymentTerms: string;
};

export type FinanceSupplier = {
  id: string;
  name: string;
  vatNumber?: string;
  phone?: string;
  email?: string;
};

export type FinanceProduct = {
  id: string;
  name: string;
  englishName?: string;
  details: string;
  category: string;
  sku: string;
  barcode: string;
  imageUrl?: string | null;
  price: number;
  cost?: number;
  vatRate: number;
  stock: number;
  accountId: string;
  costAccountId?: string;
  inventoryAccountId?: string;
  defaultSupplierId?: string;
  purchaseUnit?: string;
  defaultWarehouseId?: string;
  costCenterId?: string;
  loyaltyPointsEarned?: number;
  loyaltyPointsRequired?: number;
  loyaltyEarnEligible?: boolean;
  loyaltyRedeemEligible?: boolean;
  revenueRecognition: string;
};

export type FinanceCategory = {
  id: string;
  name: string;
};

export type FinanceAccount = {
  id: string;
  code: string;
  name: string;
};

export type FinanceSalesInvoiceStatus =
  | "draft"
  | "approved"
  | "void"
  | "paid"
  | "partially_paid"
  | "unpaid";

export type FinanceSalesInvoiceSummary = {
  id: string;
  invoiceNumber?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  status: FinanceSalesInvoiceStatus;
  issueDate: string;
  dueDate?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  source: "branda_finance" | "cashier" | "import";
  createdAt: string;
};

export type FinancePaymentSummary = {
  id: string;
  invoiceId?: string | null;
  customerId?: string | null;
  paymentMethod: "cash" | "card" | "transfer" | "credit" | "other";
  amount: number;
  status: "recorded" | "void" | "refunded";
  paidAt: string;
};

export type FinanceCashSessionSummary = {
  id: string;
  branchId?: string | null;
  status: "open" | "closed" | "reconciled";
  openedAt: string;
  closedAt?: string | null;
  openingCash: number;
  closingCash?: number | null;
};

export type FinanceJournalEntrySummary = {
  id: string;
  branchId?: string | null;
  sourceType: "manual" | "sales_invoice" | "payment" | "cash_session";
  sourceId?: string | null;
  entryDate: string;
  status: "draft" | "posted" | "void";
  memo?: string | null;
  totalDebit: number;
  totalCredit: number;
};

export type FinanceTaxRate = {
  id: string;
  name: string;
  rate: number;
};

export type FinancePaymentMethod = {
  id: "unpaid" | "cash" | "card" | "mada" | "transfer" | "credit" | "loyalty_points";
  name: string;
  ledgerHint: string;
};

export type FinanceCustomField = {
  id: string;
  name: string;
  appliesTo: string;
  type: "text" | "textarea" | "number" | "date" | "select";
};

export type FinanceInvoiceItem = {
  id: string;
  productId?: string;
  description: string;
  quantity: number;
  price: number;
  discount: number;
  taxRate: number;
  accountId: string;
  warehouseId?: string;
  revenueRecognition: string;
};

export type FinanceWorkspaceData = {
  branches: FinanceBranch[];
  warehouses: FinanceWarehouse[];
  customers: FinanceCustomer[];
  suppliers: FinanceSupplier[];
  products: FinanceProduct[];
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  salesInvoices: FinanceSalesInvoiceSummary[];
  payments: FinancePaymentSummary[];
  cashSessions: FinanceCashSessionSummary[];
  journalEntries: FinanceJournalEntrySummary[];
  invoiceSequenceCount: number;
  journalEntryLineCount: number;
  auditEventCount: number;
  taxRates: FinanceTaxRate[];
  paymentMethods: FinancePaymentMethod[];
  customFields: FinanceCustomField[];
  dataSourceNotes: string[];
};
