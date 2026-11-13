import {z} from "zod";
import type {FinanceProduct} from "./brand-finance";
import type {CompanyLine} from "./company-invoice";
import {moneyRound} from "./company-invoice";

export const inventorySalesCatalogSchema=z.array(z.object({id:z.uuid(),catalogSource:z.literal('inventory'),name:z.string(),sku:z.string(),barcode:z.string().nullable(),description:z.string(),kind:z.enum(['product','service']),available:z.boolean(),imageUrl:z.string().nullable(),stockTracked:z.boolean(),itemId:z.uuid(),quantity:z.number(),category:z.string(),unitName:z.string(),unitFactor:z.number().positive(),saleUnitFactor:z.number().positive(),units:z.array(z.object({name:z.string(),factor:z.number().positive()})),price:z.number().nonnegative(),minimumPrice:z.number().nonnegative(),discount:z.number().nonnegative(),discountKind:z.enum(['percent','amount']),vatRate:z.number(),taxCategory:z.enum(['S','Z','E','O']),exemptionReason:z.string()}));
export type InventorySaleProduct=z.infer<typeof inventorySalesCatalogSchema>[number];
export type InvoiceCatalogProduct=FinanceProduct & Partial<Omit<InventorySaleProduct,keyof FinanceProduct>>;
export function inventorySaleSelection(product:InvoiceCatalogProduct):Partial<CompanyLine>{
 return product.catalogSource==='inventory'?{catalogSource:'inventory',unitName:product.unitName,unitFactor:product.unitFactor,name:product.name,kind:product.kind,vatRate:product.vatRate,taxCategory:product.taxCategory,exemptionReason:product.exemptionReason,discount:product.discount,discountKind:product.discountKind}:{catalogSource:undefined,unitName:undefined,unitFactor:undefined};
}
export function inventoryUnitPrice(product:InvoiceCatalogProduct,unitName?:string){const factor=product.units?.find(u=>u.name===unitName)?.factor??product.unitFactor??1;return moneyRound(product.price*factor/(product.unitFactor??1));}
