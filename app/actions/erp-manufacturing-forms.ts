'use server';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {manufacturingContext,manufacturingError} from '@/lib/data/erp-manufacturing';
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {manufacturingFormsCommand} from '@/lib/erp/manufacturing-forms';
import {actionResult} from '@/lib/platform/action-result';

export async function saveManufacturingForm(input:unknown,requestId:string,slug?:string){
 return actionResult(async()=>{
  const parsed=manufacturingFormsCommand.safeParse(branchInput(input));
  if(!parsed.success)throw new Error('راجع بيانات النموذج والحقول والصلاحيات');
  z.uuid().parse(requestId);
  const command=parsed.data;
  const context=await manufacturingContext(true,command.action==='model'||command.action==='delete'&&command.payload.entity==='model',slug);
  const result=await branchRpc(context.client,context.cafe.id,'erp_manufacturing_forms_write',{p_cafe:context.cafe.id,p_action:command.action,p_input:command.payload,p_request:requestId},input);
  manufacturingError(result.error);
  revalidatePath('/dashboard/system/manufacturing','layout');
  if(slug)revalidatePath(`/finance/${slug}/system/manufacturing`,'layout');
  return result.data as {id:string;revision?:number};
 },'تعذر حفظ نموذج التصنيع');
}
