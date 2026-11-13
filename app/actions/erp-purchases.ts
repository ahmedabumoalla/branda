'use server';
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {actionResult} from '@/lib/platform/action-result';
import {purchasesContext,purchasesError,readPurchases} from '@/lib/data/erp-purchases';
import {purchaseCommandSchema} from '@/lib/erp/purchases';
import {readTimeSpreadsheet} from '@/lib/data/erp-time-import';
import {invalidateFinanceViews} from '@/lib/performance/finance-route-invalidation';
export async function refreshPurchases(slug:string){return actionResult(()=>readPurchases(slug),'تعذر تحميل المشتريات');}
export async function actPurchases(slug:string,input:unknown,requestId:string){return actionResult(async()=>{const p=purchaseCommandSchema.safeParse(branchInput(input));if(!p.success||!z.uuid().safeParse(requestId).success)throw new Error('راجع بيانات المستند والمورد والأصناف والأسعار');const c=await purchasesContext(slug);const r=await branchRpc(c.client,c.cafe.id,'erp_purchases_write',{p_cafe_id:c.cafe.id,p_action:p.data.action,p_payload:p.data.payload,p_request_id:requestId},input);purchasesError(r.error);revalidatePath('/dashboard/system/purchases','layout');revalidatePath('/dashboard/system/inventory','layout');invalidateFinanceViews(slug);return r.data as {id?:string;financeId?:string;count?:number}},'تعذر حفظ المشتريات');}
export async function previewSupplierImport(slug:string,form:FormData){return actionResult(async()=>{const c=await purchasesContext(slug);const access=await c.client.rpc('erp_purchases_read',{p_cafe_id:c.cafe.id});purchasesError(access.error);if(!access.data?.canCreate)throw new Error('لا تملك صلاحية استيراد الموردين');const file=form.get('file');if(!(file instanceof File))throw new Error('اختر ملف الاستيراد');return{rows:await readTimeSpreadsheet(file,String(form.get('delimiter')||','))}},'تعذر قراءة ملف الموردين');}
