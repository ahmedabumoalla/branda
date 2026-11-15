import { MenuPageClient } from "@/components/dashboard/pages/menu-page";
import { readInventoryMenu } from "@/lib/data/inventory-menu-link";

export async function InventoryMenuCatalog({ branchId, productId }: { branchId?: string; productId?: string }) {
  const { menu, branches, branch } = await readInventoryMenu(branchId);
  return <MenuPageClient
    key={`${branch?.id ?? "unbranched"}:${productId ?? "list"}`}
    inventoryCatalog
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
