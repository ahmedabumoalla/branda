'use server';
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {inventoryContext} from '@/lib/data/erp-inventory';
import {inventoryCommandSchema} from '@/lib/erp/inventory';
import {assetError} from '@/lib/data/erp-assets';
import {revalidatePath} from 'next/cache';
export async function executeInventory(input:unknown,slug?:string){try{const command=inventoryCommandSchema.parse(branchInput(input));const{client,cafe}=await inventoryContext(true,slug);const{data,error}=await branchRpc(client,cafe.id,'erp_inventory_write',{p_cafe:cafe.id,p_command:command},input);assetError(error);revalidatePath('/dashboard/system/inventory');revalidatePath(`/finance/${cafe.slug}/system/inventory`);return{ok:true as const,data:data as {id:string;financeDocumentId?:string;count?:number}};}catch(error){return{ok:false as const,message:error instanceof Error?error.message:'تعذر تنفيذ عملية المخزون'};}}
