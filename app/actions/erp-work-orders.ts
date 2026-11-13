'use server';
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {workContext,workError,readWorkOrders} from '@/lib/data/erp-work-orders';
import {workCommandSchema} from '@/lib/erp/work-orders';
import {actionResult} from '@/lib/platform/action-result';
import {invalidateFinanceViews} from '@/lib/performance/finance-route-invalidation';
export async function refreshWorkOrders(slug:string){return actionResult(()=>readWorkOrders(slug),'تعذر تحميل أوامر الشغل');}
export async function actWorkOrder(slug:string,input:unknown,requestId:string){return actionResult(async()=>{const parsed=workCommandSchema.safeParse(branchInput(input));if(!parsed.success||!z.uuid().safeParse(requestId).success)throw new Error('راجع الحقول المطلوبة والتواريخ والمبالغ');const c=await workContext(slug);const r=await branchRpc(c.client,c.cafe.id,'erp_work_orders_write',{p_cafe_id:c.cafe.id,p_action:parsed.data.action,p_payload:parsed.data.payload,p_request_id:requestId},input);workError(r.error);revalidatePath('/dashboard/system/work-orders','layout');revalidatePath('/dashboard/system/tasks','layout');invalidateFinanceViews(slug);return r.data as {id:string;draftId?:string}},'تعذر حفظ أمر الشغل');}
export async function findWorkTransactions(slug:string,kind:string,query:string){return actionResult(async()=>{if(!['document','quotation','credit_note','task'].includes(kind)||query.length>120)throw new Error('راجع نوع المعاملة ونص البحث');const c=await workContext(slug);const r=await c.client.rpc('erp_work_order_targets',{p_cafe_id:c.cafe.id,p_kind:kind,p_query:query});workError(r.error);return r.data as {id:string;label:string;amount:number;kind:string}[]},'تعذر البحث عن المعاملات');}
