import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerBranches } from "@/lib/data/branches";
import { getCafeCustomers } from "@/lib/data/customers";
import { getOwnerMenu } from "@/lib/data/menu";
import {
  branchFromCafeBranch,
  createFinanceDataset,
  customerFromProfile,
  mockCategories,
  productFromMenuProduct,
} from "@/lib/branda-finance/invoice-mock-data";
import type { BrandaFinanceCategory } from "@/lib/branda-finance/invoice-types";

export async function loadBrandaFinanceDemoData() {
  if (!isSupabaseConfigured()) {
    return createFinanceDataset({
      dataNotes: ["Supabase غير مهيأ، لذلك تعرض Branda Finance بيانات mock محلية فقط."],
    });
  }

  try {
    const [branches, customers, menu] = await Promise.all([
      getOwnerBranches().catch(() => []),
      getCafeCustomers().catch(() => []),
      getOwnerMenu().catch(() => null),
    ]);

    const products = menu?.products.map(productFromMenuProduct) ?? [];
    const categories: BrandaFinanceCategory[] =
      menu?.categories.map((category) => ({ id: category.id, name: category.name })) ??
      Array.from(new Set(products.map((product) => product.category))).map((name) => ({ id: name, name }));

    return createFinanceDataset({
      branches: branches.map(branchFromCafeBranch),
      customers: customers.map(customerFromProfile),
      products,
      categories: categories.length ? categories : mockCategories,
      dataNotes: [
        "تمت قراءة المنتجات والفروع والعملاء من مسارات dashboard الآمنة عند توفرها.",
        "الموردون والمستودعات وإجراءات الاعتماد لا تزال mock محلية للنسخة التجريبية.",
      ],
    });
  } catch {
    return createFinanceDataset({
      dataNotes: ["تعذر تحميل بيانات dashboard، لذلك تعرض Branda Finance بيانات mock محلية فقط."],
    });
  }
}
