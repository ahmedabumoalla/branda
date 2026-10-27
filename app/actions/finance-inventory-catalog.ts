"use server";
import { revalidatePath } from "next/cache";
import { saveFinanceInventoryItem, saveFinanceInventoryUnit } from "@/lib/data/finance-inventory-catalog";
import { ZodError } from "zod";

function message(error:unknown) {
  if(error instanceof ZodError)return "راجع بيانات الصنف ووحدة القياس وكميات الاستهلاك";
  return error instanceof Error&&/[\u0600-\u06ff]/.test(error.message)?error.message:"تعذر تأكيد الحفظ أعد المحاولة بنفس البيانات لمنع التكرار";
}
export async function saveFinanceInventoryItemAction(input:unknown,slug?:string) {
  try { const result=await saveFinanceInventoryItem(input,slug);revalidatePath("/dashboard/finance","layout");return {ok:true as const,...result}; }
  catch(error){return {ok:false as const,message:message(error)};}
}
export async function saveFinanceInventoryUnitAction(input:unknown,slug?:string) {
  try {return {ok:true as const,...await saveFinanceInventoryUnit(input,slug)};}
  catch(error){return {ok:false as const,message:message(error)};}
}
