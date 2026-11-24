import "server-only";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AWLAD_CATEGORIES, AWLAD_PRODUCTS } from "@/lib/menu/awlad-al-izz-catalog";
import { AWLAD_ASSETS, isAwladAlIzz } from "@/lib/menu/awlad-al-izz";
import type { StandaloneMenu } from "@/lib/menu/standalone-menu";
import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";

type Draft = { products: MenuProduct[]; categories: MenuCategoryRecord[] };
const file = join(tmpdir(), "branda-awlad-local-catalog-v1.json");
export function canPreviewAwlad(id: string | undefined, products: unknown[], categories: unknown[], branch: unknown) {
  return process.env.NODE_ENV === "development" && process.env.BRANDA_AWLAD_CATALOG_PREVIEW === "true"
    && isAwladAlIzz(id) && !products.length && !categories.length && !branch;
}
export function readAwladDraft(): Draft {
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  return {
    categories: AWLAD_CATEGORIES.map((c, i) => ({ ...c, cafeSlug: "", sortOrder: i + 1, visible: true, featured: false, createdAt: "", updatedAt: "" })),
    products: AWLAD_PRODUCTS.map(({ image, ...p }) => ({
      ...p, category: AWLAD_CATEGORIES.find(c => c.id === p.categoryId)!.name,
      imageDataUrl: image ? `${AWLAD_ASSETS}/${image}` : null, imageVariant: "latte",
      available: true, ingredients: [], loyaltyPoints: 0,
    })),
  };
}
// Synchronous read-modify-rename in the single local preview process.
export function updateAwladDraft<T>(change: (draft: Draft) => T): T {
  const draft = readAwladDraft();
  const result = change(draft);
  const temporary = file + "." + process.pid;
  writeFileSync(temporary, JSON.stringify(draft), { mode: 0o600 });
  renameSync(temporary, file);
  return result;
}
export function withAwladCatalogPreview(menu: StandaloneMenu): { menu: StandaloneMenu; preview: boolean } {
  if (!canPreviewAwlad(menu.cafeId, menu.products, menu.categories, menu.branch)) return { menu, preview: false };
  const draft = readAwladDraft();
  const categories = draft.categories.filter(c => c.visible);
  const products = draft.products.filter(p => p.available && categories.some(c => c.id === p.categoryId));
  return { preview: true, menu: { ...menu, logoUrl: `${AWLAD_ASSETS}/logo.jpeg`,
    categories: categories.map(c => ({ id: c.id, name: c.name, description: c.description ?? null, icon: c.icon })),
    products: products.map(p => ({
      id: p.id, name: p.name, description: p.description, price: p.price, catalogKind: p.catalogKind,
      categoryId: p.categoryId, available: p.available, ingredients: p.ingredients, preparationTimeMinutes: p.preparationTimeMinutes,
      category: categories.find(c => c.id === p.categoryId)!.name,
      images: p.imageDataUrl ? [{ url: p.imageDataUrl, alt: p.name }] : [], videos: [], currencyCode: menu.currencyCode,
    })),
  } };
}
