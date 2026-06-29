import {
  financeMockAccounts,
  financeMockBranches,
  financeMockCategories,
  financeMockCustomers,
  financeMockPaymentMethods,
  financeMockProducts,
  financeMockSuppliers,
  financeMockTaxRates,
  financeMockWarehouses,
} from "@/lib/branda-finance/invoice-mock-data";
import type { BrandaFinanceDemoData } from "@/lib/branda-finance/types";

export const brandaFinanceDemoData: BrandaFinanceDemoData = {
  branches: financeMockBranches,
  warehouses: financeMockWarehouses,
  customers: financeMockCustomers,
  suppliers: financeMockSuppliers,
  employees: [
    { id: "emp-1", name: "سارة المالكي", role: "محاسبة داخلية", monthlySalary: 9200, custodyBalance: 450 },
    { id: "emp-2", name: "عبدالله الحربي", role: "مشرف فرع", monthlySalary: 7800, custodyBalance: 1200 },
    { id: "emp-3", name: "ريم العتيبي", role: "كاشير", monthlySalary: 5200, custodyBalance: 0 },
  ],
  products: financeMockProducts,
  services: financeMockProducts.filter((product) => product.category.includes("خدمات")),
  categories: financeMockCategories,
  taxRates: financeMockTaxRates,
  accounts: financeMockAccounts,
  chartOfAccounts: [
    { id: "cash", code: "1001", name: "الصندوق" },
    { id: "bank", code: "1002", name: "الحساب البنكي" },
    { id: "receivable", code: "1103", name: "الذمم المدينة" },
    { id: "inventory", code: "1301", name: "المخزون" },
    { id: "payable", code: "2101", name: "الذمم الدائنة" },
    { id: "vat", code: "2205", name: "ضريبة القيمة المضافة" },
    ...financeMockAccounts,
    { id: "cogs", code: "5101", name: "تكلفة البضاعة المباعة" },
    { id: "expenses", code: "6101", name: "مصروفات تشغيلية" },
  ],
  costCenters: [
    { id: "cc-main", name: "تشغيل الفرع الرئيسي", owner: "سارة المالكي", budget: 82000, actual: 67400 },
    { id: "cc-marketing", name: "تسويق العروض", owner: "عبدالله الحربي", budget: 26000, actual: 19850 },
    { id: "cc-delivery", name: "تجهيز التوصيل", owner: "ريم العتيبي", budget: 18000, actual: 14200 },
  ],
  projects: [
    { id: "project-catering", name: "عقود الضيافة الشهرية", branchId: "branch-main", revenue: 96000, cost: 53000, status: "نشط" },
    { id: "project-season", name: "موسم رمضان", branchId: "branch-north", revenue: 124000, cost: 76000, status: "تخطيط" },
  ],
  cashBoxes: [
    { id: "cash-main", name: "صندوق الفرع الرئيسي", branchId: "branch-main", balance: 18450, lastClosedAt: "2026-06-26" },
    { id: "cash-north", name: "صندوق فرع الشمال", branchId: "branch-north", balance: 9300, lastClosedAt: "2026-06-26" },
  ],
  bankAccounts: [
    { id: "bank-operating", name: "حساب التشغيل", iban: "SA00 0000 0000 0000 0000 0000", balance: 186420, status: "يتطلب ربط لاحق" },
    { id: "bank-tax", name: "حساب الضريبة", iban: "SA00 1111 1111 1111 1111 1111", balance: 28450, status: "يتطلب ربط لاحق" },
  ],
  paymentMethods: financeMockPaymentMethods,
  invoices: [
    {
      id: "inv-101",
      number: "LOCAL-000101",
      customerId: "customer-sahara",
      branchId: "branch-main",
      warehouseId: "warehouse-main",
      issueDate: "2026-06-27",
      dueDate: "2026-07-12",
      status: "مسودة",
      paymentMethodId: "credit",
      paidAmount: 0,
      items: [
        { productId: "product-latte", description: "لاتيه فاخر", quantity: 8, price: 18, discount: 0, taxRate: 15 },
        { productId: "product-catering", description: "باقة ضيافة مصغرة", quantity: 2, price: 145, discount: 20, taxRate: 15 },
      ],
    },
    {
      id: "inv-102",
      number: "LOCAL-000102",
      customerId: "customer-noura",
      branchId: "branch-north",
      warehouseId: "warehouse-display",
      issueDate: "2026-06-27",
      dueDate: "2026-06-27",
      status: "مدفوعة",
      paymentMethodId: "card",
      paidAmount: 220,
      items: [
        { productId: "product-cold-brew", description: "كولد برو", quantity: 5, price: 21, discount: 0, taxRate: 15 },
        { productId: "product-cookie", description: "كوكيز شوكولاتة", quantity: 8, price: 12, discount: 5, taxRate: 15 },
      ],
    },
  ],
  purchaseInvoices: [
    { id: "pinv-1", number: "PINV-00044", supplierId: "supplier-roastery", warehouseId: "warehouse-main", issueDate: "2026-06-20", status: "بانتظار المراجعة", subtotal: 18400, vat: 2760 },
    { id: "pinv-2", number: "PINV-00045", supplierId: "supplier-packaging", warehouseId: "warehouse-display", issueDate: "2026-06-24", status: "مسودة", subtotal: 7600, vat: 1140 },
  ],
  journalEntries: [
    {
      id: "je-101-preview",
      date: "2026-06-27",
      source: "LOCAL-000101",
      memo: "قيد آلي محلي من فاتورة مبيعات",
      lines: [
        { accountCode: "1103", accountName: "الذمم المدينة", debit: 476.1, credit: 0 },
        { accountCode: "4101", accountName: "إيرادات المبيعات", debit: 0, credit: 414 },
        { accountCode: "2205", accountName: "ضريبة القيمة المضافة", debit: 0, credit: 62.1 },
      ],
    },
  ],
  stockMovements: [
    { id: "sm-1", productId: "product-latte", warehouseId: "warehouse-main", type: "بيع", quantity: -8, date: "2026-06-27" },
    { id: "sm-2", productId: "product-cookie", warehouseId: "warehouse-display", type: "بيع", quantity: -8, date: "2026-06-27" },
    { id: "sm-3", productId: "product-cold-brew", warehouseId: "warehouse-main", type: "شراء", quantity: 48, date: "2026-06-24" },
  ],
  payrollItems: [
    { id: "emp-1", name: "سارة المالكي", role: "محاسبة داخلية", monthlySalary: 9200, custodyBalance: 450 },
    { id: "emp-2", name: "عبدالله الحربي", role: "مشرف فرع", monthlySalary: 7800, custodyBalance: 1200 },
  ],
  reports: [
    { slug: "profit-loss", title: "الأرباح والخسائر", description: "ملخص الإيرادات والتكاليف والمصروفات" },
    { slug: "cash-flow", title: "التدفق النقدي", description: "حركة النقد والصندوق والبنك" },
    { slug: "trial-balance", title: "ميزان المراجعة", description: "أرصدة الحسابات المحلية" },
    { slug: "general-ledger", title: "دفتر الأستاذ العام", description: "قيود وحركات الحسابات" },
    { slug: "customer-statement", title: "كشف حساب عميل", description: "حركة عميل ورصيد مستحق" },
    { slug: "supplier-statement", title: "كشف حساب مورد", description: "فواتير ومبالغ الموردين" },
    { slug: "sales", title: "تقرير المبيعات", description: "تحليل الفواتير والمنتجات" },
    { slug: "purchases", title: "تقرير المشتريات", description: "تحليل الموردين والمخزون" },
    { slug: "inventory", title: "تقرير المخزون", description: "الأرصدة والتنبيهات" },
    { slug: "vat", title: "تقرير الضريبة", description: "ضريبة المخرجات والمدخلات" },
    { slug: "branches", title: "تقرير الفروع", description: "أداء كل فرع ماليا" },
    { slug: "products", title: "تقرير المنتجات", description: "الربحية والمخزون" },
  ],
  templates: [
    { id: "tpl-invoice", name: "فاتورة ضريبية A4", type: "فاتورة", status: "محلي فقط" },
    { id: "tpl-receipt-80", name: "إيصال 80mm", type: "إيصال", status: "محلي فقط" },
    { id: "tpl-receipt-58", name: "إيصال 58mm", type: "إيصال", status: "محلي فقط" },
    { id: "tpl-quote", name: "عرض سعر", type: "قالب", status: "محلي فقط" },
    { id: "tpl-po", name: "أمر شراء", type: "مشتريات", status: "محلي فقط" },
  ],
  integrations: [
    { id: "zatca", name: "ZATCA", status: "معطل بوضوح", note: "يتطلب امتثال وربط رسمي لاحقا" },
    { id: "mada", name: "mada / أجهزة البطاقات", status: "معطل بوضوح", note: "يتطلب مزود دفع ومعتمد رسمي" },
    { id: "bank", name: "الربط البنكي", status: "معطل بوضوح", note: "يتطلب مزود Open Banking أو بنك" },
    { id: "printers", name: "الطابعات والأجهزة", status: "معطل بوضوح", note: "يتطلب Device Hub محلي" },
    { id: "ai", name: "استخراج ذكي", status: "معطل بوضوح", note: "يتطلب مزود خارجي وموافقة لاحقة" },
  ],
  alerts: [
    { id: "alert-stock", title: "منتجات قاربت النفاد", detail: "باقة ضيافة مصغرة تحت حد التنبيه", severity: "warning" },
    { id: "alert-receivable", title: "ذمم مستحقة", detail: "فاتورة LOCAL-000101 غير مدفوعة", severity: "info" },
    { id: "alert-integration", title: "التكاملات غير مفعلة", detail: "كل التكاملات الخارجية معطلة في المعاينة", severity: "danger" },
  ],
  permissions: [
    { id: "approve-invoice", title: "اعتماد فاتورة", readyFor: "صلاحيات قاعدة البيانات" },
    { id: "post-journal", title: "ترحيل قيد", readyFor: "محرك محاسبي لاحق" },
    { id: "close-day", title: "إغلاق يومية", readyFor: "تسوية الصندوق والبنك" },
  ],
};

export function getBrandaFinanceDemoData() {
  return brandaFinanceDemoData;
}
