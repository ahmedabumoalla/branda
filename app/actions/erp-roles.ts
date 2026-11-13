"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {getBrandFinanceContext} from "@/lib/data/brand-finance";
import {roleError} from "@/lib/data/erp-roles";
import {erpRoleSchema} from "@/lib/erp/roles";
import {actionResult} from "@/lib/platform/action-result";
const record=z.object({id:z.uuid(),revision:z.number().int().positive()}).strict();
const assignment=z.object({id:z.uuid(),revision:z.number().int().min(0),role_id:z.uuid(),user_id:z.uuid().nullable(),employee_id:z.uuid().nullable()}).strict().refine(v=>Number(!!v.user_id)+Number(!!v.employee_id)===1);
export async function actErpRole(slug:string,action:"save"|"delete"|"delete_many"|"assign"|"unassign",input:unknown,requestId:string){return actionResult(async()=>{const op=z.enum(["save","delete","delete_many","assign","unassign"]).parse(action),parsed=(op==="save"?erpRoleSchema:op==="assign"?assignment:op==="delete_many"?z.object({entries:z.array(record).min(1).max(100)}).strict():record).safeParse(input);if(!parsed.success||!z.uuid().safeParse(requestId).success)throw new Error(parsed.success?"معرف الطلب غير صالح":parsed.error.issues.find(i=>/[\u0600-\u06ff]/.test(i.message))?.message??"راجع بيانات الدور وصلاحياته");const {client,cafe}=await getBrandFinanceContext(slug);if(cafe.role!=="owner")throw new Error("إدارة الأدوار متاحة لمالك العلامة فقط");const r=await client.rpc("erp_roles",{p_cafe_id:cafe.id,p_action:op,p_input:parsed.data,p_request:requestId});roleError(r.error);revalidatePath("/dashboard/system","layout");return r.data as {id:string;revision:number};},"تعذر تأكيد تعديل الأدوار");}
