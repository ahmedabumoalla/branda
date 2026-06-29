import type {
  FinanceAccount,
  FinanceBranch,
  FinanceCategory,
  FinanceCustomField,
  FinanceCustomer,
  FinancePaymentMethod,
  FinanceProduct,
  FinanceSupplier,
  FinanceTaxRate,
  FinanceWarehouse,
  FinanceWorkspaceData,
} from "@/lib/branda-finance/invoice-types";

export const financeMockBranches: FinanceBranch[] = [
  {
    id: "branch-main",
    name: "الفرع الرئيسي",
    displayName: "برندا - الفرع الرئيسي",
    city: "الرياض",
    address: "طريق الملك فهد، الرياض",
    phone: "0110000000",
    licenseType: "رخصة بلدية",
    licenseNumber: "BR-1001",
  },
  {
    id: "branch-north",
    name: "فرع الشمال",
    displayName: "برندا - فرع الشمال",
    city: "الرياض",
    address: "حي النخيل",
    phone: "0110000001",
    licenseType: "رخصة بلدية",
    licenseNumber: "BR-1002",
  },
];

export const financeMockWarehouses: FinanceWarehouse[] = [
  { id: "warehouse-main", name: "المستودع الرئيسي", branchId: "branch-main", city: "الرياض" },
  { id: "warehouse-display", name: "مخزون واجهة البيع", branchId: "branch-north", city: "الرياض" },
];

export const financeMockCustomers: FinanceCustomer[] = [
  {
    id: "customer-sahara",
    name: "شركة صحارى للضيافة",
    country: "المملكة العربية السعودية",
    vatRegistered: true,
    vatNumber: "300000000000003",
    city: "الرياض",
    address: "حي العليا",
    email: "finance@sahara.example",
    phone: "0500000001",
    currency: "SAR",
    paymentTerms: "15 يوم",
  },
  {
    id: "customer-noura",
    name: "نورة القحطاني",
    country: "المملكة العربية السعودية",
    vatRegistered: false,
    city: "جدة",
    address: "حي السلامة",
    email: "noura@example.com",
    phone: "0500000002",
    currency: "SAR",
    paymentTerms: "فوري",
  },
];

export const financeMockSuppliers: FinanceSupplier[] = [
  {
    id: "supplier-roastery",
    name: "محمصة المورد الذهبي",
    vatNumber: "300000000000004",
    phone: "0500000003",
    email: "supply@example.com",
  },
  {
    id: "supplier-packaging",
    name: "حلول التغليف العربية",
    vatNumber: "300000000000005",
    phone: "0500000004",
    email: "ops@example.com",
  },
];

export const financeMockAccounts: FinanceAccount[] = [
  { id: "sales-food", code: "4101", name: "إيرادات المنتجات" },
  { id: "sales-services", code: "4102", name: "إيرادات الخدمات" },
  { id: "sales-delivery", code: "4103", name: "إيرادات التوصيل" },
];

export const financeMockTaxRates: FinanceTaxRate[] = [
  { id: "vat-15", name: "ضريبة القيمة المضافة 15%", rate: 15 },
  { id: "vat-zero", name: "ضريبة صفرية", rate: 0 },
];

export const financeMockCategories: FinanceCategory[] = [
  { id: "cat-coffee", name: "قهوة" },
  { id: "cat-cold", name: "بارد" },
  { id: "cat-sweets", name: "حلويات" },
  { id: "cat-services", name: "خدمات" },
];

export const financeMockProducts: FinanceProduct[] = [
  {
    id: "product-latte",
    name: "لاتيه فاخر",
    englishName: "Signature Latte",
    details: "مشروب قهوة بالحليب للاستخدام في معاينة الفاتورة",
    category: "قهوة",
    sku: "BRD-LAT-001",
    barcode: "6281000000011",
    imageUrl: "https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=900&auto=format&fit=crop",
    price: 18,
    vatRate: 15,
    stock: 48,
    accountId: "sales-food",
    revenueRecognition: "عند إصدار الفاتورة",
  },
  {
    id: "product-cold-brew",
    name: "كولد برو",
    englishName: "Cold Brew",
    details: "قهوة باردة محضرة مسبقًا",
    category: "بارد",
    sku: "BRD-CBR-002",
    barcode: "6281000000028",
    imageUrl: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?q=80&w=900&auto=format&fit=crop",
    price: 21,
    vatRate: 15,
    stock: 35,
    accountId: "sales-food",
    revenueRecognition: "عند التسليم",
  },
  {
    id: "product-cookie",
    name: "كوكيز شوكولاتة",
    englishName: "Chocolate Cookie",
    details: "قطعة مخبوزة يوميًا",
    category: "حلويات",
    sku: "BRD-CKI-003",
    barcode: "6281000000035",
    imageUrl: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?q=80&w=900&auto=format&fit=crop",
    price: 12,
    vatRate: 15,
    stock: 72,
    accountId: "sales-food",
    revenueRecognition: "عند إصدار الفاتورة",
  },
  {
    id: "product-catering",
    name: "باقة ضيافة مصغرة",
    englishName: "Mini Catering Pack",
    details: "باقة تجهيز مناسبة لاجتماع قصير",
    category: "خدمات",
    sku: "BRD-SRV-004",
    barcode: "6281000000042",
    imageUrl: "https://images.unsplash.com/photo-1556911220-bff31c812dba?q=80&w=900&auto=format&fit=crop",
    price: 145,
    vatRate: 15,
    stock: 8,
    accountId: "sales-services",
    revenueRecognition: "حسب تاريخ الخدمة",
  },
];

export const financeMockPaymentMethods: FinancePaymentMethod[] = [
  { id: "unpaid", name: "غير مدفوعة", ledgerHint: "يبقى الرصيد على ذمة العميل" },
  { id: "cash", name: "كاش", ledgerHint: "يربط لاحقًا بصندوق الكاشير" },
  { id: "card", name: "بطاقة", ledgerHint: "يربط لاحقًا بمزود البطاقات" },
  { id: "mada", name: "مدى", ledgerHint: "يتطلب مزود دفع رسمي لاحقًا" },
  { id: "transfer", name: "تحويل", ledgerHint: "يربط لاحقًا بالحساب البنكي" },
  { id: "credit", name: "آجل", ledgerHint: "يرحل لاحقًا إلى الذمم المدينة" },
  { id: "loyalty_points", name: "نقاط الولاء", ledgerHint: "خصم ولاء محلي للمعاينة فقط" },
];

export const financeMockCustomFields: FinanceCustomField[] = [
  { id: "po", name: "أمر الشراء", appliesTo: "الفاتورة", type: "text" },
  { id: "reference", name: "المرجع", appliesTo: "الفاتورة", type: "text" },
  { id: "project", name: "المشروع", appliesTo: "الفاتورة", type: "select" },
  { id: "warehouse", name: "المستودع", appliesTo: "بند الفاتورة", type: "select" },
];

export const financeMockWorkspaceData: FinanceWorkspaceData = {
  branches: financeMockBranches,
  warehouses: financeMockWarehouses,
  customers: financeMockCustomers,
  suppliers: financeMockSuppliers,
  products: financeMockProducts,
  categories: financeMockCategories,
  accounts: financeMockAccounts,
  taxRates: financeMockTaxRates,
  paymentMethods: financeMockPaymentMethods,
  customFields: financeMockCustomFields,
  dataSourceNotes: ["بيانات معاينة محلية فقط إلى حين ربط جداول الفوترة الفعلية."],
};
