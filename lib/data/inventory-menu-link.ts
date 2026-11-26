import "server-only";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { hasBrandFeature } from "@/lib/data/feature-entitlements";
import { getOwnerMenu } from "@/lib/data/menu";
import { getOwnerMenuBranches } from "@/lib/data/menu-branches";

import { MIND_HOSPITAL_SLUG } from "@/lib/commerce/hospital-profile";
import { getFinanceInventoryCatalog } from "./finance-inventory-catalog";
import { menuServingCosts, recipeLinks } from "@/lib/finance/menu-serving-cost";

async function readServingCosts(context: Awaited<ReturnType<typeof getBrandFinanceContext>>, productIds: string[]) {
  const visible = new Set(productIds);
  if (!visible.size) return {};
  const { items } = await getFinanceInventoryCatalog(context.cafe.slug);
  const live = new Set(visible);
  // The allocation divisor includes live products in other branches, even if hidden from the public menu.
  const otherIds = new Set<string>();
  for (const item of items) {
    if (!item.active || item.cost_mode !== "equal_split") continue;
    const links = recipeLinks(item);
    if (!links.some(link => visible.has(link.product_id))) continue;
    for (const link of links) if (!visible.has(link.product_id)) otherIds.add(link.product_id);
  }
  const ids = [...otherIds];
  for (let start = 0; start < ids.length; start += 100) {
    const { data, error } = await context.client.from("menu_products").select("id")
      .eq("cafe_id", context.cafe.id).is("deleted_at", null).in("id", ids.slice(start, start + 100));
    if (error) throw error;
    for (const product of data) live.add(product.id);
  }
  return menuServingCosts(items, visible, live);
}

export async function readInventoryMenu(branchId?: string) {
  const context = await getBrandFinanceContext();
  const { cafe } = context;
  if (cafe.role !== "owner" || !await hasBrandFeature(cafe.id, "menu")) {
    throw new Error("إدارة منتجات المنيو متاحة لمالك العلامة عند تفعيل خدمة المنيو");
  }
  const { branches, cafe: menuCafe } = await getOwnerMenuBranches();
  if (menuCafe.id !== cafe.id) throw new Error("تغير حساب العلامة أعد تحميل الصفحة");
  const unbranched = branchId === "unbranched";
  const branch = unbranched ? undefined : branchId
    ? branches.find(item => item.id === branchId)
    : branches.find(item => item.primary) ?? branches[0];
  if (branchId && !unbranched && !branch) throw new Error("الفرع غير متاح");
  const menu = await getOwnerMenu(branch?.id ?? null);
  if (menu.cafe.id !== cafe.id) throw new Error("تغير حساب العلامة أعد تحميل الصفحة");
  const servingCosts = cafe.slug === MIND_HOSPITAL_SLUG
    ? await readServingCosts(context, menu.products.map(product => product.id)).catch(() => null)
    : undefined;
  return { menu, branches, branch, servingCosts };
}
