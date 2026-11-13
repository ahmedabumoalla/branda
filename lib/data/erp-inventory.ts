import {branchFinanceSnapshot} from '@/lib/data/erp-branches';
import 'server-only';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import {assetError} from '@/lib/data/erp-assets';
import type {InventorySnapshot} from '@/lib/erp/inventory';
export async function inventoryContext(write=false,slug?:string){const ctx=await getBrandFinanceContext(slug);if(!['owner','manager','warehouse','accountant','auditor'].includes(ctx.cafe.role)||write&&!['owner','manager','warehouse'].includes(ctx.cafe.role))throw new Error('لا تملك صلاحية المخزون');return ctx;}
export async function readInventory(query:{id?:string;prices?:boolean}={},slug?:string):Promise<InventorySnapshot>{const ctx=await inventoryContext(false,slug);const{data,error}=await ctx.client.rpc('erp_inventory_read',{p_cafe:ctx.cafe.id,p_query:{id:query.id||null}});assetError(error);if(!data?.items)throw new Error('تعذر تحميل المخزون');const defaults=await ctx.client.rpc('erp_system_product_configuration',{p_cafe:ctx.cafe.id});if(defaults.error&&defaults.error.code!=='PGRST202')assetError(defaults.error);const finance=query.prices?await branchFinanceSnapshot(ctx):undefined;return{...data,slug:ctx.cafe.slug,cafeName:ctx.cafe.name,productDefaults:defaults.data??undefined,finance} as InventorySnapshot;}
