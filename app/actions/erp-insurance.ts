"use server";
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import {insuranceError} from '@/lib/data/erp-insurance';
import {insuranceCompanySchema,insuranceClassSchema,insuranceEnrollmentSchema} from '@/lib/erp/insurance';
import {actionResult} from '@/lib/platform/action-result';
const remove=z.object({id:z.uuid(),revision:z.number().int().positive()}).strict(),prepare=z.object({draftId:z.uuid(),revision:z.number().int().positive()}).strict(),collect=z.object({id:z.uuid(),payer:z.enum(['company','customer']),amount:z.number().finite().positive().max(1e9).multipleOf(.01),accountId:z.uuid(),note:z.string().max(500)}).strict();
export async function mutateInsurance(slug:string,action:string,input:unknown,request:string){return actionResult(async()=>{const schemas={company:insuranceCompanySchema,class:insuranceClassSchema,enrollment:insuranceEnrollmentSchema,company_delete:remove,class_delete:remove,unlink:remove,prepare,collect};if(!Object.hasOwn(schemas,action)||!z.uuid().safeParse(request).success)throw new Error('الإجراء غير صالح');const parsed=schemas[action as keyof typeof schemas].safeParse(branchInput(input));if(!parsed.success)throw new Error(parsed.error.issues.find(i=>/[\u0600-\u06ff]/.test(i.message))?.message??'راجع بيانات التأمين والنسب');const c=await getBrandFinanceContext(slug),r=await branchRpc(c.client,c.cafe.id,'erp_insurance_write',{p_cafe:c.cafe.id,p_action:action,p_input:parsed.data,p_request:request},input);insuranceError(r.error);for(const part of ['insurance','customers']){revalidatePath('/dashboard/system/'+part,'layout');revalidatePath(`/finance/${slug}/system/${part}`,'layout');}return r.data as {id:string;revision?:number;draftId?:string;deleted?:boolean};},'تعذر تأكيد عملية التأمين');}
