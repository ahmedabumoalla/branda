import { MenuPageClient } from "@/components/dashboard/pages/menu-page";
import { readInventoryMenu } from "@/lib/data/inventory-menu-link";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { isAldeemStockCatalog } from "@/lib/aldeem/catalog";
import { readInventory } from "@/lib/data/erp-inventory";
import { InventoryWorkspace } from "./workspace";

export async function InventoryMenuCatalog({ branchId, productId }: { branchId?: string; productId?: string }) {
  const { cafe } = await getBrandFinanceContext();
  if (isAldeemStockCatalog(cafe.slug)) {
    const snapshot = await readInventory({ catalog: true }, cafe.slug);
    return <InventoryWorkspace snapshot={snapshot} module="items" mode="list" />;
  }
  const { menu, branches, branch, servingCosts } = await readInventoryMenu(branchId);
  return <MenuPageClient
    key={`${branch?.id ?? "unbranched"}:${productId ?? "list"}`}
    inventoryCatalog
    servingCosts={servingCosts}
    initialProductId={productId}
    initialProducts={menu.products}
    initialCategories={menu.categories}
    businessCategory={menu.cafe.businessCategory}
    cafeSlug={menu.cafe.slug}
    branchId={branch?.id ?? null}
    branchName={branch?.name}
    branchSlug={branch?.slug}
    branches={branches}
  />;
}
