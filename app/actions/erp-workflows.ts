'use server';
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {workflowContext,workflowError,readWorkflows} from '@/lib/data/erp-workflows';
import {workflowCommandSchema} from '@/lib/erp/workflows';
import {actionResult} from '@/lib/platform/action-result';
import {invalidateFinanceViews} from '@/lib/performance/finance-route-invalidation';
export async function refreshWorkflows(slug:string){return actionResult(()=>readWorkflows(slug),'تعذر تحميل دورات العمل');}
export async function actWorkflow(slug:string,input:unknown,requestId:string){return actionResult(async()=>{const parsed=workflowCommandSchema.safeParse(branchInput(input));if(!parsed.success||!z.uuid().safeParse(requestId).success)throw new Error('راجع بيانات الدورة والحقول المطلوبة والصلاحيات');const c=await workflowContext(slug);const r=await branchRpc(c.client,c.cafe.id,'erp_workflows_write',{p_cafe_id:c.cafe.id,p_action:parsed.data.action,p_payload:parsed.data.payload,p_request_id:requestId},input);workflowError(r.error);revalidatePath('/dashboard/system/workflows','layout');revalidatePath('/dashboard/system/tasks','layout');invalidateFinanceViews(slug);return r.data as {id:string;draftId?:string}},'تعذر حفظ دورة العمل');}
export async function findWorkflowTargets(slug:string,recordId:string,kind:string,query:string){return actionResult(async()=>{if(!z.uuid().safeParse(recordId).success||!['document','quotation','credit_note','task'].includes(kind)||query.length>120)throw new Error('راجع نوع المعاملة ونص البحث');const c=await workflowContext(slug);const r=await c.client.rpc('erp_workflow_targets',{p_cafe_id:c.cafe.id,p_record_id:recordId,p_kind:kind,p_query:query});workflowError(r.error);return r.data as {id:string;label:string;amount:number;kind:string}[]},'تعذر البحث عن المعاملات');}
