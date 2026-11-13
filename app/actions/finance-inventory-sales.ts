"use server";
import {getBrandFinanceContext} from "@/lib/data/brand-finance";
import {actionResult} from "@/lib/platform/action-result";
import {inventorySalesCatalogSchema} from "@/lib/finance/inventory-sales";
export async function getInventorySalesCatalog(slug:string){return actionResult(async()=>{const{client,cafe}=await getBrandFinanceContext(slug);if(!['owner','manager','accountant','auditor'].includes(cafe.role))throw new Error('لا تملك صلاحية عرض أصناف الفواتير');const{data,error}=await client.rpc('erp_inventory_sales_catalog',{p_cafe:cafe.id});if(error)throw new Error('تعذر تحميل أصناف المخزون تحقق من إعدادات أسعارها وضرائبها');const parsed=inventorySalesCatalogSchema.safeParse(data);if(!parsed.success)throw new Error('تعذر قراءة أصناف المخزون');return parsed.data;},'تعذر تحميل أصناف المخزون');}
