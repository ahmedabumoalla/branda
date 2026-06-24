"use server";

import {
  getOwnerMenu,
  saveAllMenuCategories,
  softDeleteMenuProduct,
  upsertMenuCategory,
  upsertMenuProduct,
} from "@/lib/data/menu";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { MenuProduct } from "@/lib/mock/menu";

export async function fetchOwnerMenuAction() {
  return getOwnerMenu();
}

export async function saveMenuProductAction(product: MenuProduct) {
  const eventTicketSettings = product.eventTicketSettings
    ? {
        ...product.eventTicketSettings,
        checkinPolicy: product.eventTicketSettings.checkinPolicy ?? "single_use",
      }
    : null;

  const row = await upsertMenuProduct({
    id: /^[0-9a-f-]{36}$/i.test(product.id) ? product.id : undefined,
    name: product.name,
    categoryId: product.categoryId ?? null,
    category: product.category,
    description: product.description,
    price: product.price,
    calories: product.calories ?? null,
    loyaltyPoints: 0,
    preparationTimeMinutes: product.preparationTimeMinutes ?? null,
    redeemableWithPoints: false,
    redemptionPoints: null,
    availableForPickup: product.availableForPickup ?? true,
    pickupLeadTimeMinutes: product.pickupLeadTimeMinutes ?? null,
    ingredients: product.ingredients,
    available: product.available,
    imageVariant: product.imageVariant,
    imageStoragePath: product.imageAssetId ?? null,
    imageUrl: product.imageDataUrl ?? null,
    imageGallery: product.imageGallery ?? [],
    videoStoragePath: product.videoAssetId ?? null,
    media: product.media ?? [],
    promo: product.promo ?? null,
    eventTicketSettings,
  });
  return row.id;
}

export async function deleteMenuProductAction(productId: string) {
  await softDeleteMenuProduct(productId);
}

export async function saveMenuCategoriesAction(categories: MenuCategoryRecord[]) {
  return saveAllMenuCategories(categories);
}

export async function saveMenuCategoryAction(category: MenuCategoryRecord) {
  return upsertMenuCategory({
    id: /^[0-9a-f-]{36}$/i.test(category.id) ? category.id : undefined,
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    visible: category.visible,
    featured: category.featured,
    icon: category.icon,
    imageStoragePath: category.imageAssetId ?? null,
    imageUrl: null,
  });
}
