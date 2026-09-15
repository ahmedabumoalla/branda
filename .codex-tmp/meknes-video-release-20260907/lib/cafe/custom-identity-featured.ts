import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import { FEATURED_SECTION_LABELS } from "@/lib/mock/custom-identity-theme";
import { isPromoActive } from "@/lib/mock/menu";
import {
  getCategoryNameById,
  type MenuCategoryRecord,
} from "@/lib/mock/menu-categories";

export function resolveFeaturedProducts(
  props: Pick<
    CafeThemePageProps,
    "availableProducts" | "popularProducts" | "latestProducts"
  >,
  identity: CustomIdentityTheme,
  categories: MenuCategoryRecord[]
) {
  const { availableProducts, popularProducts, latestProducts } = props;

  switch (identity.featuredSectionMode) {
    case "popular":
      return popularProducts;
    case "latest":
      return latestProducts;
    case "new-products":
      return latestProducts;
    case "offers":
      return availableProducts
        .filter((p) => p.promo && isPromoActive(p.promo))
        .slice(0, 4);
    case "category": {
      const catName = getCategoryNameById(
        categories,
        identity.featuredCategoryId,
        ""
      );
      if (!catName) return popularProducts;
      return availableProducts
        .filter(
          (p) =>
            p.category === catName ||
            catName.includes(p.category) ||
            p.category.includes(catName.split(/\s+/)[0] ?? "")
        )
        .slice(0, 4);
    }
    default:
      return popularProducts;
  }
}

export function featuredSectionTitle(
  identity: CustomIdentityTheme,
  categories: MenuCategoryRecord[]
) {
  if (identity.featuredSectionMode === "category" && identity.featuredCategoryId) {
    return getCategoryNameById(categories, identity.featuredCategoryId, "مختارات");
  }
  return FEATURED_SECTION_LABELS[identity.featuredSectionMode];
}
