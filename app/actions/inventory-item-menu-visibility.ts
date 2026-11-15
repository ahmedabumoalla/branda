"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { saveMenuProductAction } from "@/app/actions/menu";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { getFinanceInventoryCatalog, saveFinanceInventoryItem } from "@/lib/data/finance-inventory-catalog";
import { readInventoryMenu } from "@/lib/data/inventory-menu-link";
import { upsertMenuProduct } from "@/lib/data/menu";
import type { FinanceItem } from "@/lib/finance/brand-finance";

// A stock item is never shown to customers on its own. The owner may opt in per item: that creates one menu
// product for it through the existing menu save, linked to the item through the existing consumption link,
// so the cashier and the menu list it and every sale deducts the chosen quantity from the item.
// No new tables or database functions: every write goes through the original menu and inventory actions.

const linksOf = (item: FinanceItem) => item.product_links ?? (item.menu_product_id ? [{ product_id: item.menu_product_id, quantity: 1 }] : []);
const failure = (error: unknown, fallback: string) => ({ ok: false as const, message: error instanceof Error && /[؀-ۿ]/.test(error.message) && error.message.length < 300 ? error.message : fallback });

async function load(slug: string, itemId: string) {
  const id = z.uuid().parse(itemId);
  // Owner with the menu service enabled, primary menu branch: the same guard as the menu tab of this section.
  const { menu, branch } = await readInventoryMenu();
  const context = await getBrandFinanceContext(slug);
  if (context.cafe.id !== menu.cafe.id) throw new Error("تغير حساب العلامة أعد تحميل الصفحة");
  const catalog = await getFinanceInventoryCatalog(context.cafe.slug);
  const item = catalog.items.find(row => row.id === id);
  if (!item) throw new Error("الصنف غير متاح في المخزون");
  return { menu, branch, context, catalog, item };
}

/** The item's own menu product: the one recorded on the item, else a linked product carrying the item's name. */
function ownProduct(menu: Awaited<ReturnType<typeof load>>["menu"], item: FinanceItem, hint?: string) {
  const linked = linksOf(item);
  const candidates = menu.products.filter(product => linked.some(link => link.product_id === product.id));
  return candidates.find(product => product.id === hint) ?? candidates.find(product => product.name.trim() === item.name.trim());
}

export async function readStockItemMenuState(slug: string, itemId: string, productHint?: string) {
  try {
    const { menu, branch, item } = await load(slug, itemId);
    const product = ownProduct(menu, item, productHint);
    return {
      ok: true as const,
      branchName: branch?.name ?? "",
      categories: menu.categories.map(category => ({ id: category.id, name: category.name })),
      product: product ? { id: product.id, name: product.name, price: product.price, available: product.available, quantity: linksOf(item).find(link => link.product_id === product.id)?.quantity ?? 1 } : null,
    };
  } catch (error) { return failure(error, "تعذر تحميل حالة ظهور الصنف في المنيو أعد المحاولة"); }
}

const showSchema = z.object({
  itemId: z.uuid(), productHint: z.uuid().optional(),
  price: z.number().finite().min(0).max(99999999),
  categoryId: z.union([z.uuid(), z.literal("")]),
  quantity: z.number().finite().positive().max(1000000).refine(n => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.000001, "استخدم ثلاث منازل عشرية كحد أقصى"),
}).strict();

/** First activation: create the menu product and link it. Safe to repeat: an existing own product is reused. */
export async function showStockItemInMenu(slug: string, input: unknown, requestId: string) {
  try {
    const request = z.uuid().parse(requestId);
    const parsed = showSchema.parse(input);
    const { menu, branch, context, catalog, item } = await load(slug, parsed.itemId);
    if (!item.active) throw new Error("فعّل الصنف المخزني أولا ثم أظهره في المنيو");
    let productId = ownProduct(menu, item, parsed.productHint)?.id;
    if (!productId) {
      const category = menu.categories.find(row => row.id === parsed.categoryId);
      if (parsed.categoryId && !category) throw new Error("تصنيف المنيو غير متاح اختر تصنيفا آخر");
      const row = await upsertMenuProduct({
        branchId: branch?.id ?? null, name: item.name, categoryId: category?.id ?? null, category: category?.name,
        description: "", price: parsed.price, loyaltyPoints: 0, redeemableWithPoints: false, availableForPickup: true,
        ingredients: [], available: true, imageVariant: "latte", imageGallery: [], media: [],
      });
      productId = String(row.id);
    }
    const links = linksOf(item);
    if (!links.some(link => link.product_id === productId)) {
      const unitId = catalog.units.find(unit => unit.id === item.unit_id)?.id ?? catalog.units.find(unit => unit.name === item.unit)?.id ?? item.unit_id ?? "";
      if (!unitId) throw new Error("حدد وحدة قياس الصنف من تعديل الصنف ثم أعد المحاولة");
      await saveFinanceInventoryItem({
        requestId: request,
        payload: {
          id: item.id, name: item.name.trim(), sku: (item.sku ?? "").trim(), unitId, barcode: (item.barcode ?? "").trim(),
          imagePath: item.image_path ?? null, minQuantity: Number(item.min_quantity ?? 0), costMode: item.cost_mode ?? "full",
          productLinks: [...links.map(link => ({ productId: link.product_id, quantity: Number(link.quantity) })), { productId, quantity: parsed.quantity }],
        },
      }, context.cafe.slug);
    }
    revalidatePath("/dashboard/system/inventory", "layout");
    revalidatePath("/dashboard/finance", "layout");
    return { ok: true as const, productId };
  } catch (error) {
    return error instanceof z.ZodError ? { ok: false as const, message: "راجع السعر والكمية المخصومة لكل بيعة" } : failure(error, "تعذر إظهار الصنف في المنيو أعد المحاولة بنفس البيانات");
  }
}

/** Later switches only show or hide the existing menu product through the original menu save. */
export async function setStockItemMenuVisibility(slug: string, itemId: string, productId: string, available: boolean) {
  try {
    const { menu, item } = await load(slug, itemId);
    const product = ownProduct(menu, item, z.uuid().parse(productId));
    if (!product || product.id !== productId) throw new Error("منتج المنيو المرتبط بهذا الصنف غير متاح");
    if (product.available !== available) await saveMenuProductAction({ ...product, available });
    revalidatePath("/dashboard/system/inventory", "layout");
    revalidatePath("/dashboard/finance", "layout");
    return { ok: true as const, available };
  } catch (error) { return failure(error, "تعذر تغيير ظهور الصنف في المنيو أعد المحاولة"); }
}
