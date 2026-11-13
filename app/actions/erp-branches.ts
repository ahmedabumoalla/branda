'use server';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import {readBranches,readBranchContext,branchError} from '@/lib/data/erp-branches';
import {branchCommandSchema} from '@/lib/erp/branches';
import {actionResult} from '@/lib/platform/action-result';
export async function refreshBranches(slug:string){return actionResult(()=>readBranches(slug),'تعذر تحميل الفروع');}
export async function getBranchContext(slug?:string){return actionResult(()=>readBranchContext(slug),'تعذر تحميل فرع العمل');}
export async function actBranches(slug:string,input:unknown,requestId:string){return actionResult(async()=>{const p=branchCommandSchema.parse(input);const c=await getBrandFinanceContext(slug);const r=await c.client.rpc('erp_branches_write',{p_cafe:c.cafe.id,p_action:p.action,p_input:p.payload,p_request:z.uuid().parse(requestId)});branchError(r.error);revalidatePath('/dashboard/system','layout');revalidatePath(`/finance/${c.cafe.slug}/system`,'layout');return r.data;},'تعذر حفظ بيانات الفرع');}
