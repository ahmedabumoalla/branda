"use server";
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {actionResult} from '@/lib/platform/action-result';
import {rentalContext,rentalError,getErpRentals} from '@/lib/data/erp-rentals';
import {rentalCommandSchema,type RentalQuoteLine} from '@/lib/erp/rentals';
import {invalidateFinanceViews} from '@/lib/performance/finance-route-invalidation';
export async function readErpRentals(slug:string){return actionResult(()=>getErpRentals(slug),'تعذر تحميل الإيجارات');}
export async function mutateErpRentals(slug:string,input:unknown,requestId:string){return actionResult(async()=>{const command=rentalCommandSchema.safeParse(branchInput(input));if(!command.success||!z.uuid().safeParse(requestId).success)throw new Error('راجع الحقول المطلوبة والمبالغ وفترة الحجز');const {client,cafe}=await rentalContext(slug,true);const r=await branchRpc(client,cafe.id,'erp_rentals_write',{p_cafe_id:cafe.id,p_action:command.data.action,p_payload:command.data.payload,p_request_id:requestId},input);rentalError(r.error);revalidatePath('/dashboard/system/rentals','layout');invalidateFinanceViews(slug);return r.data as {id:string;draftId?:string;invoiceId?:string;recurringId?:string}},'تعذر حفظ الإيجارات');}
export async function quoteErpRental(slug:string,input:unknown){return actionResult(async()=>{const p=z.object({unitIds:z.array(z.uuid()).min(1).max(100),start:z.iso.datetime({offset:true}),end:z.iso.datetime({offset:true}),exclude:z.uuid().nullable()}).parse(branchInput(input));const {client,cafe}=await rentalContext(slug);const r=await client.rpc('erp_rentals_quote',{p_cafe_id:cafe.id,p_unit_ids:p.unitIds,p_start:p.start,p_end:p.end,p_exclude:p.exclude});rentalError(r.error);return r.data as {total:number;lines:RentalQuoteLine[]}},'تعذر تسعير الوحدات والتحقق من توافرها');}
