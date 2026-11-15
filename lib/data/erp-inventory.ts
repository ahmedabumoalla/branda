import {branchFinanceSnapshot} from '@/lib/data/erp-branches';
import 'server-only';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import {assetError} from '@/lib/data/erp-assets';
import type {InventorySnapshot} from '@/lib/erp/inventory';
import {hasBrandFeature} from '@/lib/data/feature-entitlements';
export async function inventoryContext(write=false,slug?:string){const ctx=await getBrandFinanceContext(slug);if(ctx.cafe.role!=='owner'&&(ctx.cafe.employeePermissions?!Object.entries(ctx.cafe.employeePermissions).some(([key,rule])=>key.startsWith('inventory.')&&(!write||!key.endsWith('.read'))&&rule.enabled):!['manager','warehouse','accountant','auditor'].includes(ctx.cafe.role)||write&&!['manager','warehouse'].includes(ctx.cafe.role)))throw new Error('لا تملك صلاحية المخزون');return ctx;}
export async function readInventory(query:{id?:string;prices?:boolean;catalog?:boolean}={},slug?:string):Promise<InventorySnapshot>{
  const ctx=await inventoryContext(false,slug);
  const [{data,error},defaults,menuCatalogAvailable]=await Promise.all([
    ctx.client.rpc('erp_inventory_read',{p_cafe:ctx.cafe.id,p_query:{id:query.id||null}}),
    ctx.client.rpc('erp_system_product_configuration',{p_cafe:ctx.cafe.id}),
    query.catalog&&ctx.cafe.role==='owner'?hasBrandFeature(ctx.cafe.id,'menu'):Promise.resolve(false),
  ]);
  assetError(error);
  if(!data?.items)throw new Error('تعذر تحميل المخزون');
  if(defaults.error&&defaults.error.code!=='PGRST202')assetError(defaults.error);
  // The inventory read initializes its catalog before the finance snapshot uses it.
  const finance=query.prices?await branchFinanceSnapshot(ctx):undefined;
  return {...data,slug:ctx.cafe.slug,cafeName:ctx.cafe.name,productDefaults:defaults.data??undefined,menuCatalogAvailable,finance} as InventorySnapshot;
}
