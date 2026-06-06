import { assertNoBase64Images, sanitizeMenuProducts } from "@/lib/cafe/entity-storage-sanitize";
import type { MenuProduct } from "@/lib/mock/menu";

export const MENU_STORAGE_KEY = "branda_qatrah_menu";

export function saveMenuProductsToStorage(_products: MenuProduct[]) {
  throw new Error("Use Supabase — save via app/actions/menu");
}

export function loadMenuProductsFromStorage(): MenuProduct[] | null {
  throw new Error("Use Supabase — fetch via lib/data/menu");
}
