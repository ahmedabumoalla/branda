import { getOwnerBranches } from "@/lib/data/branches";
import { getCafeCustomers } from "@/lib/data/customers";
import { getOwnerMenu } from "@/lib/data/menu";
import type {
  FinanceAccount,
  FinanceBranch,
  FinanceCategory,
  FinanceCustomer,
  FinancePaymentMethod,
  FinanceProduct,
  FinanceTaxRate,
  FinanceWarehouse,
  FinanceWorkspaceData,
} from "@/lib/branda-finance/invoice-types";
import type { MenuProduct } from "@/lib/mock/menu";

const paymentMethods: FinancePaymentMethod[] = [
  { id: "cash", name: "كاش", ledgerHint: "واجهة محلية فقط" },
  { id: "card", name: "بطاقة", ledgerHint: "واجهة محلية فقط" },
  { id: "transfer", name: "تحويل", ledgerHint: "واجهة محلية فقط" },
  { id: "credit", name: "آجل", ledgerHint: "واجهة محلية فقط" },
  { id: "unpaid", name: "غير مدفوعة", ledgerHint: "بدون ترحيل" },
];

const taxRates: FinanceTaxRate[] = [
  { id: "vat-15", name: "VAT 15%", rate: 15 },
  { id: "vat-0", name: "VAT 0%", rate: 0 },
];

const accounts: FinanceAccount[] = [];

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function productReference(product: MenuProduct) {
  return product.id.slice(0, 8).toUpperCase();
}

function productImageUrl(product: MenuProduct) {
  return product.media?.find((item) => item.type === "image" && item.url)?.url ?? product.imageDataUrl ?? null;
}

function mapProduct(product: MenuProduct): FinanceProduct {
  const reference = productReference(product);

  return {
    id: product.id,
    name: product.name,
    details: product.description || "منتج حقيقي من قائمة العلامة",
    category: product.category || "غير مصنف",
    sku: reference,
    barcode: reference,
    imageUrl: productImageUrl(product),
    price: Number(product.price || 0),
    vatRate: 15,
    stock: product.available ? 1 : 0,
    accountId: "",
    revenueRecognition: "غير مربوط بدفتر أستاذ بعد",
    loyaltyPointsEarned: Number(product.loyaltyPoints || 0),
    loyaltyEarnEligible: Number(product.loyaltyPoints || 0) > 0,
  };
}

function mapBranch(branch: Awaited<ReturnType<typeof getOwnerBranches>>[number]): FinanceBranch {
  return {
    id: branch.id,
    name: branch.name,
    displayName: branch.name,
    city: branch.city || "",
    address: branch.address || "",
    phone: branch.phone,
  };
}

function mapCustomer(customer: Awaited<ReturnType<typeof getCafeCustomers>>[number]): FinanceCustomer {
  return {
    id: customer.id,
    name: asText(customer.full_name) || "عميل",
    country: "SA",
    vatRegistered: false,
    city: "",
    address: "",
    email: asText(customer.email) || undefined,
    phone: asText(customer.phone) || undefined,
    currency: "SAR",
    paymentTerms: "غير محدد",
  };
}

export async function getBrandaFinanceRealWorkspaceData(): Promise<FinanceWorkspaceData> {
  const [menu, branches, customers] = await Promise.all([
    getOwnerMenu(),
    getOwnerBranches(),
    getCafeCustomers(),
  ]);

  const products = menu.products.map(mapProduct);
  const categories: FinanceCategory[] = menu.categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));
  const financeBranches = branches.map(mapBranch);
  const warehouses: FinanceWarehouse[] = [];

  return {
    branches: financeBranches,
    warehouses,
    customers: customers.map(mapCustomer),
    suppliers: [],
    products,
    categories,
    accounts,
    taxRates,
    paymentMethods,
    customFields: [],
    dataSourceNotes: [
      "المنتجات والتصنيفات مقروءة من جداول menu_products و menu_categories عبر getOwnerMenu.",
      "الفروع مقروءة من جدول branches عبر getOwnerBranches.",
      "العملاء مقروؤون من جدول customer_profiles عبر getCafeCustomers.",
      "لا توجد جداول فواتير مبيعات أو بنود فواتير أو مستودعات مالية مفعلة بعد، لذلك الحفظ الحقيقي معطل.",
    ],
  };
}
