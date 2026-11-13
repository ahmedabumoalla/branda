'use server';
import {revalidatePath} from 'next/cache';
import {inventoryContext} from '@/lib/data/erp-inventory';
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {assetError} from '@/lib/data/erp-assets';
import {salesRequisitionCommandSchema} from '@/lib/erp/sales-requisitions';
export async function executeSalesRequisition(input:unknown,slug?:string){try{const command=salesRequisitionCommandSchema.parse(branchInput(input));const{client,cafe}=await inventoryContext(true,slug);const{data,error}=await branchRpc(client,cafe.id,'erp_sales_requisitions_write',{p_cafe_id:cafe.id,p_action:command.action,p_payload:command.payload,p_request_id:command.requestId},input);assetError(error);revalidatePath('/dashboard/system/inventory');revalidatePath(`/finance/${cafe.slug}/system/inventory`);return{ok:true as const,data};}catch(error){return{ok:false as const,message:error instanceof Error?error.message:'تعذر اعتماد إذن المبيعات'};}}
