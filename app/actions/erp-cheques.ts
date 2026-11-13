'use server';
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {actionResult} from '@/lib/platform/action-result';
import {chequesContext,chequeError,readCheques} from '@/lib/data/erp-cheques';
import {chequeCommandSchema} from '@/lib/erp/cheques';
import {invalidateFinanceViews} from '@/lib/performance/finance-route-invalidation';
export async function refreshCheques(slug:string){return actionResult(()=>readCheques(slug),'تعذر تحميل الشيكات');}
export async function actCheques(slug:string,input:unknown,requestId:string){return actionResult(async()=>{const p=chequeCommandSchema.safeParse(branchInput(input));if(!p.success||!z.uuid().safeParse(requestId).success)throw new Error('راجع بيانات الشيك والحسابات والتواريخ');const c=await chequesContext(slug);const r=await branchRpc(c.client,c.cafe.id,'erp_cheques_write',{p_cafe_id:c.cafe.id,p_action:p.data.action,p_payload:p.data.payload,p_request_id:requestId},input);chequeError(r.error);revalidatePath('/dashboard/system/cheques','layout');invalidateFinanceViews(slug);return r.data as{id?:string;documentId?:string;status?:string}},'تعذر حفظ الشيك');}
