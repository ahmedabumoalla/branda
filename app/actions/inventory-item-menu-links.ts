"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { branchFinanceSnapshot, readBranchContext } from "@/lib/data/erp-branches";
import { getFinanceInventoryCatalog } from "@/lib/data/finance-inventory-catalog";
import { hasBrandFeature } from "@/lib/data/feature-entitlements";
import { canFinance } from "@/lib/finance/permissions";

/** Read only, same guards as loadInventoryMenuIngredients. Saving keeps the existing inventory item action and ledger. */
export async function loadInventoryItemMenuLinks(slug: string, itemId: string) {
  try {
    const id = z.uuid().parse(itemId);
    const context = await getBrandFinanceContext(slug);
    if (context.cafe.role !== "owner" || !await hasBrandFeature(context.cafe.id, "menu")) {
      return { ok: false as const, message: "ربط الأصناف بمنتجات المنيو متاح لمالك العلامة مع تفعيل خدمة المنيو" };
    }
    const [snapshot, catalog, branch] = await Promise.all([
      branchFinanceSnapshot(context),
      getFinanceInventoryCatalog(context.cafe.slug),
      readBranchContext(context.cafe.slug),
    ]);
    if (snapshot.cafe.id !== context.cafe.id) {
      return { ok: false as const, message: "تغير حساب العلامة أعد تحميل الصفحة" };
    }
    if (branch.requiresSelection) {
      return { ok: false as const, message: "اختر الفرع قبل ربط الصنف بمنتجات المنيو" };
    }
    const visible = snapshot.items.find(item => item.id === id);
    const item = catalog.items.find(row => row.id === id);
    if (!visible || !item) {
      return { ok: false as const, message: "الصنف غير متاح في المخزون المختار" };
    }
    return {
      ok: true as const,
      slug: context.cafe.slug,
      item: { ...item, quantity: visible.quantity },
      units: catalog.units,
      products: snapshot.products.map(product => ({ id: product.id, name: product.name })),
      canWrite: canFinance(snapshot.role, "inventory_write"),
    };
  } catch {
    return { ok: false as const, message: "تعذر تحميل روابط المنيو تحقق من صلاحياتك ثم أعد المحاولة" };
  }
}
