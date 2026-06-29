import { getOwnerBranches } from "@/lib/data/branches";
import { getCafeCustomers } from "@/lib/data/customers";
import { getOwnerMenu } from "@/lib/data/menu";
import {
  financeMockAccounts,
  financeMockBranches,
  financeMockCategories,
  financeMockCustomFields,
  financeMockCustomers,
  financeMockPaymentMethods,
  financeMockProducts,
  financeMockSuppliers,
  financeMockTaxRates,
  financeMockWarehouses,
} from "@/lib/branda-finance/invoice-mock-data";
import type {
  FinanceBranch,
  FinanceCategory,
  FinanceCustomer,
  FinanceProduct,
  FinanceWarehouse,
  FinanceWorkspaceData,
} from "@/lib/branda-finance/invoice-types";
import type { MenuProduct } from "@/lib/mock/menu";

function productCode(id: string, prefix: string) {
  return `${prefix}-${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || "ITEM"}`;
}

function withFallbackBranch(branches: FinanceBranch[]) {
  const fallback = financeMockBranches[0];
  const exists = branches.some((branch) => branch.name === fallback.name || branch.id === fallback.id);
  return exists ? branches : [fallback, ...branches];
}

function withFallbackWarehouse(warehouses: FinanceWarehouse[]) {
  const fallback = financeMockWarehouses[0];
  const exists = warehouses.some((warehouse) => warehouse.name === fallback.name || warehouse.id === fallback.id);
  return exists ? warehouses : [fallback, ...warehouses];
}

function mapMenuProduct(product: MenuProduct): FinanceProduct {
  return {
    id: product.id,
    name: product.name,
    details: product.description || "منتج مرتبط من قائمة العلامة",
    category: product.category || "منتجات",
    sku: productCode(product.id, "MENU"),
    barcode: productCode(product.id, "628"),
    imageUrl: product.imageDataUrl ?? product.imageGallery?.find((image) => image.imageDataUrl)?.imageDataUrl ?? null,
    price: Number(product.price ?? 0),
    vatRate: 15,
    stock: product.available ? 24 : 0,
    accountId: "sales-food",
    revenueRecognition: "عند إصدار الفاتورة",
  };
}

async function readBranches(notes: string[]): Promise<FinanceBranch[]> {
  try {
    const branches = await getOwnerBranches();
    if (!branches.length) {
      notes.push("لم يتم العثور على فروع فعلية، تم استخدام فروع محلية للمعاينة.");
      return financeMockBranches;
    }

    notes.push("تمت قراءة الفروع من مسار المالك الآمن.");
    return withFallbackBranch(
      branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        displayName: branch.name,
        city: branch.city || "غير محدد",
        address: branch.address || "غير محدد",
        phone: branch.phone,
      })),
    );
  } catch {
    notes.push("تعذرت قراءة الفروع الحالية، تم استخدام فروع محلية للمعاينة.");
    return financeMockBranches;
  }
}

async function readCustomers(notes: string[]): Promise<FinanceCustomer[]> {
  try {
    const customers = await getCafeCustomers();
    if (!customers.length) {
      notes.push("لم يتم العثور على عملاء فعليين، تم استخدام عملاء محليين للمعاينة.");
      return financeMockCustomers;
    }

    notes.push("تمت قراءة العملاء من مسار المالك الآمن.");
    return customers.map((customer) => ({
      id: customer.id,
      name: String(customer.full_name ?? "عميل"),
      country: "المملكة العربية السعودية",
      vatRegistered: false,
      city: "غير محدد",
      address: "",
      email: customer.email ? String(customer.email) : undefined,
      phone: customer.phone ? String(customer.phone) : undefined,
      currency: "SAR",
      paymentTerms: "فوري",
    }));
  } catch {
    notes.push("تعذرت قراءة العملاء الحاليين، تم استخدام عملاء محليين للمعاينة.");
    return financeMockCustomers;
  }
}

async function readMenuProducts(notes: string[]): Promise<{
  products: FinanceProduct[];
  categories: FinanceCategory[];
}> {
  try {
    const menu = await getOwnerMenu();
    const products = menu.products.map(mapMenuProduct);
    const categories = menu.categories.map((category) => ({
      id: category.id,
      name: category.name,
    }));

    if (!products.length) {
      notes.push("لم يتم العثور على منتجات فعلية، تم استخدام منتجات محلية للمعاينة.");
      return { products: financeMockProducts, categories: financeMockCategories };
    }

    notes.push("تمت قراءة المنتجات والتصنيفات من قائمة العلامة الآمنة.");
    return {
      products,
      categories: categories.length ? categories : financeMockCategories,
    };
  } catch {
    notes.push("تعذرت قراءة المنتجات الحالية، تم استخدام منتجات محلية للمعاينة.");
    return { products: financeMockProducts, categories: financeMockCategories };
  }
}

export async function getBrandaFinanceInvoiceDemoData(): Promise<FinanceWorkspaceData> {
  const dataSourceNotes: string[] = [];
  const [branches, customers, menu] = await Promise.all([
    readBranches(dataSourceNotes),
    readCustomers(dataSourceNotes),
    readMenuProducts(dataSourceNotes),
  ]);

  return {
    branches: withFallbackBranch(branches.length ? branches : financeMockBranches),
    warehouses: withFallbackWarehouse(financeMockWarehouses),
    customers: customers.length ? customers : financeMockCustomers,
    suppliers: financeMockSuppliers,
    products: menu.products.length ? menu.products : financeMockProducts,
    categories: menu.categories.length ? menu.categories : financeMockCategories,
    accounts: financeMockAccounts,
    salesInvoices: [],
    payments: [],
    cashSessions: [],
    journalEntries: [],
    invoiceSequenceCount: 0,
    journalEntryLineCount: 0,
    auditEventCount: 0,
    taxRates: financeMockTaxRates,
    paymentMethods: financeMockPaymentMethods,
    customFields: financeMockCustomFields,
    dataSourceNotes,
  };
}
