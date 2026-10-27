import { z } from "zod";
import type { FinanceItem, FinanceProduct, FinanceStock } from "./brand-finance";

export type FinanceInventoryUnit = { id: string; name: string };
export type FinanceInventoryLink = { product_id: string; quantity: number };
export type FinanceInventoryCatalog = { items: FinanceItem[]; units: FinanceInventoryUnit[] };
export const INVENTORY_IMAGE_BUCKET = "bf-inventory-images";
export const INVENTORY_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const inventoryItemInputSchema = z.object({
  requestId: z.uuid(),
  payload: z.object({
    id: z.uuid().optional(), name: z.string().trim().min(1).max(150),
    sku: z.string().trim().max(60).optional(), unitId: z.uuid(),
    barcode: z.string().trim().regex(/^(?:[A-Za-z0-9][A-Za-z0-9._\/-]{0,63})?$/, "أدخل باركود صالحًا حتى 64 خانة").default(""),
    imagePath: z.string().max(150).nullable().optional(),
    minQuantity: z.number().finite().min(0).max(99999999),
    costMode: z.enum(["equal_split", "full"]),
    productLinks: z.array(z.object({ productId: z.uuid(), quantity: z.number().finite().positive().max(1000000).refine(n=>Math.abs(n*1000-Math.round(n*1000))<0.000001,"استخدم ثلاث منازل عشرية كحد أقصى") })).max(200)
      .refine(links=>new Set(links.map(link=>link.productId)).size===links.length,"لا تكرر المنتج في الربط"),
  }).strict(),
}).strict();
export const inventoryUnitInputSchema = z.object({requestId:z.uuid(),name:z.string().trim().min(1).max(30)}).strict();
export function isInventoryImagePath(path: unknown, cafeId: string): path is string {
  return typeof path === "string" && path.startsWith(`${cafeId}/`) && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(path);
}
export function inventoryImageUrl(path: string, slug: string) {
  return `/api/finance/${encodeURIComponent(slug)}/inventory-image?path=${encodeURIComponent(path)}`;
}
/** Refresh the local recipe after an item save without reloading the entire finance snapshot. */
export function inventoryProductsAfterSave(products:FinanceProduct[],items:FinanceItem[],stock:FinanceStock[]):FinanceProduct[] {
  return products.map(product=>{
    const components=items.filter(item=>item.active).flatMap(item=>(item.product_links??(item.menu_product_id?[{product_id:item.menu_product_id,quantity:1}]:[])).filter(link=>link.product_id===product.id).map(link=>({item_id:item.id,quantity:link.quantity})));
    const quantity=components.length?Math.min(...components.map(component=>stock.filter(row=>row.item_id===component.item_id).reduce((sum,row)=>sum+row.quantity,0)/component.quantity)):0;
    return {...product,stock_components:components,stockTracked:components.length>0,itemId:components[0]?.item_id??null,quantity};
  });
}
