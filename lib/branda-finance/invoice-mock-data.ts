import type { MenuProduct } from "@/lib/mock/menu";
import type { CafeBranch } from "@/lib/mock/branches";
import type { CustomerProfileRow } from "@/lib/data/customers";
import type {
  BrandaFinanceAccount,
  BrandaFinanceBranch,
  BrandaFinanceCategory,
  BrandaFinanceCustomField,
  BrandaFinanceCustomer,
  BrandaFinanceDataset,
  BrandaFinancePaymentMethod,
  BrandaFinanceProduct,
  BrandaFinanceSupplier,
  BrandaFinanceTaxRate,
  BrandaFinanceWarehouse,
} from "@/lib/branda-finance/invoice-types";

export const financeAccounts: BrandaFinanceAccount[] = [
  { id: "sales-food", code: "4101", name: "مبيعات المنتجات" },
  { id: "sales-services", code: "4102", name: "مبيعات الخدمات" },
  { id: "discounts", code: "4201", name: "خصومات مسموحة" },
];

export const financeTaxRates: BrandaFinanceTaxRate[] = [
  { id: "vat-15", name: "ضريبة القيمة المضافة 15%", rate: 0.15 },
  { id: "zero", name: "صفرية", rate: 0 },
];

export const financePaymentMethods: { id: BrandaFinancePaymentMethod; label: string }[] = [
  { id: "unpaid", label: "غير مدفوعة" },
  { id: "cash", label: "كاش" },
  { id: "card", label: "بطاقة" },
  { id: "bank_transfer", label: "تحويل" },
  { id: "credit", label: "آجل" },
];

export const mockFinanceBranches: BrandaFinanceBranch[] = [
  {
    id: "main-branch",
    displayName: "الفرع الرئيسي",
    legalName: "شركة برندة التجريبية",
    phone: "05xxxxxxxx",
    city: "الرياض",
    address: "المملكة العربية السعودية",
    licenseType: "سجل تجاري",
    licenseNumber: "1010000000",
  },
];

export const mockWarehouses: BrandaFinanceWarehouse[] = [
  // TODO: Replace with a safe Branda Finance warehouses read model when the demo schema exists.
  { id: "main-warehouse", name: "المستودع الرئيسي", branchId: "main-branch", city: "الرياض", stockStatus: "demo" },
  { id: "display-warehouse", name: "مخزون واجهة البيع", branchId: "main-branch", city: "الرياض", stockStatus: "available" },
];

export const mockCustomers: BrandaFinanceCustomer[] = [
  {
    id: "customer-1",
    name: "شركة مذاق نجد",
    contactName: "عبدالله العتيبي",
    email: "billing@example.test",
    phone: "0500000000",
    country: "المملكة العربية السعودية",
    city: "الرياض",
    vatRegistered: true,
    taxNumber: "300000000000003",
    billingAddress: "الرياض، حي الصحافة",
    currency: "SAR",
    paymentTerms: "استحقاق خلال 15 يوم",
  },
  {
    id: "customer-2",
    name: "عميل نقدي",
    contactName: "عميل نقطة البيع",
    email: "",
    phone: "",
    country: "المملكة العربية السعودية",
    city: "الرياض",
    vatRegistered: false,
    billingAddress: "بيع مباشر من الكاشير",
    currency: "SAR",
    paymentTerms: "فوري",
  },
];

export const mockSuppliers: BrandaFinanceSupplier[] = [
  // TODO: Replace with suppliers from the purchase flow once a read-only helper is available.
  { id: "supplier-1", name: "مورد البن المختص", contactName: "فريق التوريد", phone: "0500000001", email: "supplier@example.test", category: "مواد خام" },
  { id: "supplier-2", name: "مورد التغليف", contactName: "خدمة العملاء", phone: "0500000002", email: "packaging@example.test", category: "تشغيل" },
];

export const mockCategories: BrandaFinanceCategory[] = [
  { id: "hot", name: "قهوة" },
  { id: "cold", name: "بارد" },
  { id: "sweets", name: "حلويات" },
  { id: "services", name: "خدمات" },
];

export const mockProducts: BrandaFinanceProduct[] = [
  {
    id: "product-1",
    name: "لاتيه فانيلا",
    englishName: "Vanilla Latte",
    description: "مشروب قهوة حار مع حليب وفانيلا.",
    category: "قهوة",
    sku: "BR-HOT-001",
    barcode: "6281000000011",
    price: 18,
    imageUrl: "https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=800&auto=format&fit=crop",
    taxRateId: "vat-15",
    accountId: "sales-food",
    available: true,
    stock: 42,
  },
  {
    id: "product-2",
    name: "آيس سبانش لاتيه",
    englishName: "Iced Spanish Latte",
    description: "مشروب بارد مناسب للبيع السريع.",
    category: "بارد",
    sku: "BR-CLD-002",
    barcode: "6281000000028",
    price: 21,
    imageUrl: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?q=80&w=800&auto=format&fit=crop",
    taxRateId: "vat-15",
    accountId: "sales-food",
    available: true,
    stock: 31,
  },
  {
    id: "product-3",
    name: "كوكيز شوكولاتة",
    englishName: "Chocolate Cookie",
    description: "قطعة حلى مضافة للفاتورة أو الكاشير.",
    category: "حلويات",
    sku: "BR-SWT-003",
    barcode: "6281000000035",
    price: 12,
    imageUrl: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?q=80&w=800&auto=format&fit=crop",
    taxRateId: "vat-15",
    accountId: "sales-food",
    available: true,
    stock: 18,
  },
];

export const mockCustomFields: BrandaFinanceCustomField[] = [
  // TODO: Persist custom field definitions only after Branda Finance settings tables are introduced.
  { id: "po", name: "أمر الشراء", appliesTo: "invoice", fieldType: "text", value: "" },
  { id: "reference", name: "المرجع", appliesTo: "invoice", fieldType: "text", value: "" },
  { id: "project", name: "المشروع", appliesTo: "invoice", fieldType: "text", value: "" },
  { id: "warehouse", name: "المستودع", appliesTo: "invoice", fieldType: "select", value: "المستودع الرئيسي" },
];

export function branchFromCafeBranch(branch: CafeBranch): BrandaFinanceBranch {
  return {
    id: branch.id,
    displayName: branch.name || "الفرع الرئيسي",
    legalName: branch.name || "الفرع الرئيسي",
    phone: branch.phone ?? "",
    city: branch.city || "الرياض",
    address: branch.address || "المملكة العربية السعودية",
  };
}

export function customerFromProfile(row: CustomerProfileRow): BrandaFinanceCustomer {
  return {
    id: row.id,
    name: String(row.full_name ?? row.name ?? "عميل"),
    contactName: String(row.full_name ?? row.name ?? "عميل"),
    email: String(row.email ?? ""),
    phone: String(row.phone ?? ""),
    country: "المملكة العربية السعودية",
    city: String(row.city ?? "الرياض"),
    vatRegistered: false,
    billingAddress: String(row.address ?? ""),
    currency: "SAR",
    paymentTerms: "فوري",
  };
}

export function productFromMenuProduct(product: MenuProduct, index: number): BrandaFinanceProduct {
  return {
    id: product.id,
    name: product.name,
    englishName: undefined,
    description: product.description || "صنف من المنيو مرتبط بواجهة برندة.",
    category: product.category || "أخرى",
    sku: `MENU-${String(index + 1).padStart(4, "0")}`,
    barcode: `62810${String(index + 1).padStart(8, "0")}`,
    price: Number(product.price ?? 0),
    imageUrl: product.imageDataUrl ?? product.imageGallery?.[0]?.imageDataUrl ?? null,
    taxRateId: "vat-15",
    accountId: "sales-food",
    available: product.available,
    stock: product.available ? 25 : 0,
  };
}

export function createFinanceDataset(input?: {
  branches?: BrandaFinanceBranch[];
  customers?: BrandaFinanceCustomer[];
  products?: BrandaFinanceProduct[];
  categories?: BrandaFinanceCategory[];
  dataNotes?: string[];
}): BrandaFinanceDataset {
  return {
    branches: input?.branches?.length ? input.branches : mockFinanceBranches,
    warehouses: mockWarehouses,
    customers: input?.customers?.length ? input.customers : mockCustomers,
    suppliers: mockSuppliers,
    products: input?.products?.length ? input.products : mockProducts,
    categories: input?.categories?.length ? input.categories : mockCategories,
    accounts: financeAccounts,
    taxRates: financeTaxRates,
    paymentMethods: financePaymentMethods,
    customFields: mockCustomFields,
    dataNotes: input?.dataNotes ?? ["بيانات تجريبية محلية، لا توجد أي كتابة في قاعدة البيانات."],
  };
}
