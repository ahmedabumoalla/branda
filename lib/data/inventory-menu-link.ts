import "server-only";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { hasBrandFeature } from "@/lib/data/feature-entitlements";
import { getOwnerMenu } from "@/lib/data/menu";
import { getOwnerMenuBranches } from "@/lib/data/menu-branches";

export async function readInventoryMenu(branchId?: string) {
  const { cafe } = await getBrandFinanceContext();
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
  return { menu, branches, branch };
}
