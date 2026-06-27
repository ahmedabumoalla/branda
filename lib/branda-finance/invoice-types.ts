export type BrandaFinanceBranch = {
  id: string;
  displayName: string;
  legalName: string;
  phone: string;
  city: string;
  address: string;
  licenseType?: string;
  licenseNumber?: string;
};

export type BrandaFinanceWarehouse = {
  id: string;
  name: string;
  branchId?: string;
  city: string;
  stockStatus: "available" | "low" | "demo";
};

export type BrandaFinanceCustomer = {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  vatRegistered: boolean;
  taxNumber?: string;
  billingAddress: string;
  currency: "SAR";
  paymentTerms: string;
};

export type BrandaFinanceSupplier = {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  category: string;
};

export type BrandaFinanceProduct = {
  id: string;
  name: string;
  englishName?: string;
  description: string;
  category: string;
  sku: string;
  barcode: string;
  price: number;
  imageUrl?: string | null;
  taxRateId: string;
  accountId: string;
  available: boolean;
  stock: number;
};

export type BrandaFinanceCategory = {
  id: string;
  name: string;
};

export type BrandaFinanceAccount = {
  id: string;
  name: string;
  code: string;
};

export type BrandaFinanceTaxRate = {
  id: string;
  name: string;
  rate: number;
};

export type BrandaFinancePaymentMethod = "unpaid" | "cash" | "card" | "bank_transfer" | "credit";

export type BrandaFinanceCustomField = {
  id: string;
  name: string;
  appliesTo: "invoice" | "customer" | "item";
  fieldType: "text" | "textarea" | "number" | "date" | "select";
  value?: string;
};

export type BrandaFinanceInvoiceLine = {
  id: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRateId: string;
  accountId: string;
  revenueRecognition: string;
};

export type BrandaFinanceDataset = {
  branches: BrandaFinanceBranch[];
  warehouses: BrandaFinanceWarehouse[];
  customers: BrandaFinanceCustomer[];
  suppliers: BrandaFinanceSupplier[];
  products: BrandaFinanceProduct[];
  categories: BrandaFinanceCategory[];
  accounts: BrandaFinanceAccount[];
  taxRates: BrandaFinanceTaxRate[];
  paymentMethods: { id: BrandaFinancePaymentMethod; label: string }[];
  customFields: BrandaFinanceCustomField[];
  dataNotes: string[];
};
