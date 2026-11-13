'use server';
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {actionResult} from '@/lib/platform/action-result';
import {timeContext,timeError,readTime} from '@/lib/data/erp-time';
import {timeCommandSchema} from '@/lib/erp/time';
import {readTimeSpreadsheet} from '@/lib/data/erp-time-import';
import {invalidateFinanceViews} from '@/lib/performance/finance-route-invalidation';
export async function refreshTime(slug:string){return actionResult(()=>readTime(slug),'تعذر تحميل تتبع الوقت');}
export async function actTime(slug:string,input:unknown,requestId:string){return actionResult(async()=>{const p=timeCommandSchema.safeParse(branchInput(input));if(!p.success||!z.uuid().safeParse(requestId).success)throw new Error('راجع البيانات المطلوبة والفترة والأسعار');const c=await timeContext(slug);const r=await branchRpc(c.client,c.cafe.id,'erp_time_write',{p_cafe_id:c.cafe.id,p_action:p.data.action,p_payload:p.data.payload,p_request_id:requestId},input);timeError(r.error);revalidatePath('/dashboard/system/time','layout');invalidateFinanceViews(slug);return r.data as {id?:string;draftId?:string;ids?:string[];count?:number}},'تعذر حفظ تتبع الوقت');}
export async function previewTimeImport(slug:string,form:FormData){return actionResult(async()=>{const c=await timeContext(slug);const access=await c.client.rpc('erp_time_read',{p_cafe_id:c.cafe.id});timeError(access.error);if(!access.data?.canCreate)throw new Error('لا تملك صلاحية استيراد الوقت');const file=form.get('file');if(!(file instanceof File))throw new Error('اختر ملف الاستيراد');return{rows:await readTimeSpreadsheet(file,String(form.get('delimiter')||','))}},'تعذر قراءة ملف الاستيراد');}
export async function readTimeCost(slug:string,from:string,to:string){return actionResult(async()=>{const dates=z.object({from:z.iso.date(),to:z.iso.date()}).safeParse({from,to});if(!dates.success)throw new Error('اختر فترة التقرير');const c=await timeContext(slug);const r=await c.client.rpc('erp_time_cost_report',{p_cafe_id:c.cafe.id,p_from:from,p_to:to});timeError(r.error);return r.data as {enabled:boolean;currency:string;classification:string;cashPaid:number;total:number;rows:{entryId:string;workerKind:string;workerId:string;projectId:string;sourceKind:string;sourceId:string|null;seconds:number;hourlyRate:number;amount:number}[]}},'تعذر تحميل تقرير تكلفة الوقت');}
