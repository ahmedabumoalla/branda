"use server";
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {actionResult} from "@/lib/platform/action-result";
import {invalidateFinanceViews} from "@/lib/performance/finance-route-invalidation";
import {getErpInstallmentDetail,getErpInstallments,installmentContext,installmentError} from "@/lib/data/erp-installments";
import {installmentCommandSchema,type InstallmentCommand} from "@/lib/erp/installments";
export async function readErpInstallments(slug:string,filters:unknown={}){return actionResult(()=>getErpInstallments(slug,filters),"تعذر تحميل الأقساط")}
export async function readErpInstallmentDetail(slug:string,id:string){return actionResult(()=>getErpInstallmentDetail(slug,id),"تعذر تحميل الاتفاقية")}
export async function mutateErpInstallments(slug:string,command:InstallmentCommand,requestId:string){return actionResult(async()=>{const parsed=installmentCommandSchema.safeParse(branchInput(command));if(!parsed.success||!z.uuid().safeParse(requestId).success)throw new Error("راجع مبلغ القسط ومواعيده وحقول التحصيل المطلوبة");const {client,cafe}=await installmentContext(slug,true);const {data,error}=await branchRpc(client,cafe.id,'erp_installments_write',{p_cafe_id:cafe.id,p_action:parsed.data.action,p_payload:parsed.data.payload,p_request_id:requestId},command);installmentError(error);invalidateFinanceViews(slug);revalidatePath('/dashboard/system/installments','layout');return data as {id?:string;invoiceId?:string;revision?:number}},"تعذر تأكيد العملية أعد المحاولة بالبيانات نفسها")}
