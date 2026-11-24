"use server";

import { getOwnerMenu } from "@/lib/data/menu";
import { canPreviewAwlad, updateAwladDraft } from "@/lib/data/awlad-preview";
import type { MenuProduct } from "@/lib/mock/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";

async function requireLocalCatalog() {
  const { cafe, products, categories } = await getOwnerMenu("main");
  if (!canPreviewAwlad(cafe.id, products, categories, null)) throw new Error("المعاينة غير متاحة");
}

export async function saveDraftProduct(product: MenuProduct) {
  await requireLocalCatalog();
  return updateAwladDraft(draft => {
    if (!product.name.trim() || !Number.isFinite(product.price) || product.price < 0 || !draft.categories.some(c => c.id === product.categoryId)) throw new Error("تحقق من بيانات المنتج");
    const index = draft.products.findIndex(p => p.id === product.id);
    if (index < 0) draft.products.push(product);
    else draft.products[index] = product;
    return product.id;
  });
}
export async function deleteDraftProduct(id: string) {
  await requireLocalCatalog();
  updateAwladDraft(draft => { draft.products = draft.products.filter(p => p.id !== id); });
}
export async function saveDraftCategories(next: MenuCategoryRecord[]) {
  await requireLocalCatalog();
  return updateAwladDraft(draft => {
    for (const category of next) {
      const index = draft.categories.findIndex(c => c.id === category.id);
      if (index < 0) draft.categories.push(category);
      else draft.categories[index] = category;
    }
    return next;
  });
}
export async function deleteDraftCategory(id: string) {
  await requireLocalCatalog();
  return updateAwladDraft(draft => {
    const linkedProducts = draft.products.filter(p => p.categoryId === id).length;
    if (linkedProducts) return { ok: false, reason: "has_products", linkedProducts } as const;
    draft.categories = draft.categories.filter(c => c.id !== id);
    return { ok: true } as const;
  });
}
