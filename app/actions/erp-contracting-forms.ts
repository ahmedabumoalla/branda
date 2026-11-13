'use server';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {contractingContext,contractingError} from '@/lib/data/erp-contracting';
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {contractingFormsCommand} from '@/lib/erp/contracting-forms';
import {actionResult} from '@/lib/platform/action-result';
export async function saveContractingForm(input:unknown,requestId:string,slug?:string){return actionResult(async()=>{const parsed=contractingFormsCommand.safeParse(branchInput(input));if(!parsed.success)throw new Error('راجع بيانات النموذج والحقول والصلاحيات');z.uuid().parse(requestId);const command=parsed.data,ctx=await contractingContext(true,command.action==='model'||command.action==='delete'&&command.payload.entity==='model',slug);const r=await branchRpc(ctx.client,ctx.cafe.id,'erp_contracting_forms_write',{p_cafe:ctx.cafe.id,p_action:command.action,p_input:command.payload,p_request:requestId},input);contractingError(r.error);revalidatePath('/dashboard/system/contracting','layout');if(slug)revalidatePath(`/finance/${slug}/system/contracting`,'layout');return r.data as {id:string;revision?:number};},'تعذر حفظ نموذج المشروع');}
