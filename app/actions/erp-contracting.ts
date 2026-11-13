"use server";
import {branchRpc} from "@/lib/data/erp-branches";
import {branchInput,branchScopeOf} from "@/lib/erp/branches";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { contractingContext, contractingError } from "@/lib/data/erp-contracting";
import { contractingDocumentSchema, contractingSettingsSchema } from "@/lib/erp/contracting";
import { actionResult } from "@/lib/platform/action-result";

async function execute(action:string,input:Record<string,unknown>,requestId:string,slug?:string){const {client,cafe}=await contractingContext(true,action==="settings",slug);if(!z.uuid().safeParse(requestId).success)throw new Error("معرف العملية غير صالح");const r=await branchRpc(client,cafe.id,"erp_contracting",{p_cafe_id:cafe.id,p_action:action,p_input:branchInput(input),p_request_id:requestId},input);contractingError(r.error);revalidatePath("/dashboard/system/contracting","layout");if(slug)revalidatePath(`/finance/${slug}/system/contracting`,"layout");return r.data as {id:string;revision?:number;draft_id?:string;invoice_id?:string;deleted?:boolean};}
export async function saveContracting(input:unknown,draft:boolean,requestId:string,slug?:string){return actionResult(async()=>{const parsed=contractingDocumentSchema.safeParse(branchInput(input));if(!parsed.success)throw new Error(parsed.error.issues.find(i=>/[\u0600-\u06ff]/.test(i.message))?.message??"راجع بيانات المستند وبنود الأعمال");return execute("save",{...parsed.data,draft,branchScope:branchScopeOf(input)},requestId,slug);},"تعذر حفظ المستند");}
export async function saveContractingSettings(input:unknown,requestId:string,slug?:string){return actionResult(async()=>{const parsed=contractingSettingsSchema.safeParse(branchInput(input));if(!parsed.success)throw new Error("راجع إعدادات الترقيم والحالات والحقول");return execute("settings",{...parsed.data,branchScope:branchScopeOf(input)},requestId,slug);},"تعذر حفظ الإعدادات");}
const actionSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("advance"),id:z.uuid(),revision:z.number().int().positive(),account_id:z.uuid(),amount:z.number().finite().positive().max(1e9).multipleOf(.01),note:z.string().max(300)}).strict(),
 z.object({action:z.literal("project_invoice"),id:z.uuid(),revision:z.number().int().positive(),invoice_kind:z.enum(["invoice","advance"]),amount:z.number().positive().max(1e9),tax_rate:z.number().min(0).max(100)}).strict(),
 z.object({action:z.literal("activity"),id:z.uuid(),revision:z.number().int().positive(),activity_id:z.uuid(),activity_revision:z.number().int().min(0),kind:z.enum(["appointment","time","action"]),title:z.string().trim().min(1).max(160),note:z.string().max(5000),starts_at:z.iso.datetime({offset:true}),ends_at:z.iso.datetime({offset:true}),staff_id:z.uuid().nullable(),status:z.enum(["planned","done","cancelled"])}).strict(),
 z.object({action:z.literal("transition"),id:z.uuid(),revision:z.number().int().positive(),status:z.enum(["issued","approved","active","closed","cancelled","rejected"])}).strict(),
 z.object({action:z.enum(["delete","invoice"]),id:z.uuid(),revision:z.number().int().positive()}).strict(),
 z.object({action:z.literal("note"),id:z.uuid(),revision:z.number().int().positive(),note:z.string().trim().min(1).max(5000)}).strict(),
 z.object({action:z.literal("link"),id:z.uuid(),revision:z.number().int().positive(),document_id:z.uuid()}).strict(),
 z.object({action:z.literal("financial"),id:z.uuid(),revision:z.number().int().positive(),operation:z.enum(["treasury","settlement","refund","stock_adjust","stock_transfer","journal","purchase"]),payload:z.record(z.string(),z.unknown())}).strict(),
]);
export async function actContracting(input:unknown,requestId:string,slug?:string){return actionResult(async()=>{const parsed=actionSchema.safeParse(branchInput(input));if(!parsed.success)throw new Error("راجع بيانات الإجراء");const {action,...data}=parsed.data;return execute(action,{...data,branchScope:branchScopeOf(input)},requestId,slug);},"تعذر تنفيذ الإجراء");}
