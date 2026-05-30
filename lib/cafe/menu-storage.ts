import { assertNoBase64Images, sanitizeMenuProducts } from "@/lib/cafe/entity-storage-sanitize";
import type { MenuProduct } from "@/lib/mock/menu";

export const MENU_STORAGE_KEY = "branda_qatrah_menu";

export function saveMenuProductsToStorage(products: MenuProduct[]) {
  const payload = sanitizeMenuProducts(products);
  const json = JSON.stringify(payload);
  assertNoBase64Images(json, "Menu products");
  localStorage.setItem(MENU_STORAGE_KEY, json);
}

export function loadMenuProductsFromStorage(): MenuProduct[] | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(MENU_STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as MenuProduct[];
  } catch {
    return null;
  }
}
