import type { StandaloneMenu, StandaloneMenuProduct } from "./standalone-menu";
import { AWLAD_CATEGORY_IDS, type AwladSection } from "./awlad-al-izz-catalog";

export const AWLAD_CAFE_ID = "dfa5934b-a097-4fcd-bc5f-2fc8b974e545";
export const AWLAD_SLUG = "brand-7060952bf681";
export const AWLAD_ASSETS = "/brand-assets/awlad-al-izz";
export const AWLAD_BLUE = "#1609b8";
export const isAwladAlIzz = (cafeId?: string) => cafeId === AWLAD_CAFE_ID;

export function awladSectionHref(slug: string, section?: AwladSection) {
  const safeSlug = encodeURIComponent(slug);
  return section === "salon" ? `/salon/${safeSlug}` : `/menu/${safeSlug}${section ? `/${section}` : ""}`;
}

export function awladCategorySection(category?: { id: string; icon?: string | null }): AwladSection | undefined {
  if (!category) return undefined;
  for (const section of ["salon", "laser", "cafe"] as const) {
    if (category.icon === `awlad-${section}`) return section;
  }
  if (category.id === AWLAD_CATEGORY_IDS.salon) return "salon";
  if (category.id === AWLAD_CATEGORY_IDS.laser) return "laser";
  if (Object.values(AWLAD_CATEGORY_IDS).some(id => id === category.id)) return "cafe";
}

export function awladProductSection(product: Pick<StandaloneMenuProduct, "catalogKind" | "categoryId">, category?: { id: string; icon?: string | null }): AwladSection {
  const section = awladCategorySection(category);
  if (section) return section;
  if (product.categoryId === AWLAD_CATEGORY_IDS.laser) return "laser";
  return product.catalogKind === "service" ? "salon" : "cafe";
}

export function awladSectionMenu(menu: StandaloneMenu, section: AwladSection): StandaloneMenu {
  const products = menu.products.filter(product => awladProductSection(product, menu.categories.find(c => c.id === product.categoryId)) === section);
  const ids = new Set(products.map(product => product.categoryId));
  return { ...menu, products, categories: menu.categories.filter(category => ids.has(category.id)) };
}
