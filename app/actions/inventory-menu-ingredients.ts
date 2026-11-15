"use server";

import { inventoryMenuProductIdSchema } from "@/lib/finance/inventory-catalog";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { branchFinanceSnapshot, readBranchContext } from "@/lib/data/erp-branches";
import { getFinanceInventoryCatalog } from "@/lib/data/finance-inventory-catalog";
import { hasBrandFeature } from "@/lib/data/feature-entitlements";
import type { InventorySnapshot } from "@/lib/erp/inventory";

/** Read only. Component edits retain the existing inventory item action and ledger. */
export async function loadInventoryMenuIngredients(slug: string, productId: string) {
  try {
    const id = inventoryMenuProductIdSchema.parse(productId);
    const context = await getBrandFinanceContext(slug);
    if (context.cafe.role !== "owner" || !await hasBrandFeature(context.cafe.id, "menu")) {
      return { ok: false as const, message: "إدارة مكونات المنيو متاحة لمالك العلامة مع تفعيل خدمة المنيو" };
    }
    const [snapshot, catalog, branch, product, inventory] = await Promise.all([
      branchFinanceSnapshot(context),
      getFinanceInventoryCatalog(context.cafe.slug),
      readBranchContext(context.cafe.slug),
      context.client.from("menu_products").select("id,branch_id").eq("cafe_id", context.cafe.id).eq("id", id).is("deleted_at", null).maybeSingle(),
      context.client.rpc("erp_inventory_read", { p_cafe: context.cafe.id, p_query: {} }),
    ]);
    if (product.error || inventory.error || !Array.isArray(inventory.data?.items)) {
      return { ok: false as const, message: "تعذر تحميل المكونات أعد المحاولة" };
    }
    if (snapshot.cafe.id !== context.cafe.id || !product.data || !snapshot.products.some(row => row.id === id)) {
      return { ok: false as const, message: "منتج المنيو غير متاح لهذه العلامة" };
    }
    if (branch.requiresSelection || (branch.scope.branchId && product.data.branch_id && branch.scope.branchId !== product.data.branch_id)) {
      return { ok: false as const, message: "اختر فرع منتج المنيو قبل إدارة مكوناته" };
    }
    const visibleItems = new Map(snapshot.items.map(item => [item.id, item]));
    const stockIds = new Set((inventory.data as InventorySnapshot).items.filter(item => item.meta.kind === "product").map(item => item.id));
    return {
      ok: true as const,
      snapshot: {
        ...snapshot,
        items: catalog.items.filter(item => visibleItems.has(item.id) && stockIds.has(item.id)).map(item => ({ ...item, quantity: visibleItems.get(item.id)!.quantity })),
        units: catalog.units,
      },
    };
  } catch {
    return { ok: false as const, message: "تعذر تحميل مكونات المنيو تحقق من صلاحياتك ثم أعد المحاولة" };
  }
}
