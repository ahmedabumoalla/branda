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
  taxRates: FinanceTaxRate[];
  paymentMethods: FinancePaymentMethod[];
  customFields: FinanceCustomField[];
  dataSourceNotes: string[];
};
