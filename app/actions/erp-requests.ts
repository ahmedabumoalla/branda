'use server';
import{z}from'zod';
import{revalidatePath}from'next/cache';
import{actionResult}from'@/lib/platform/action-result';
import{requestsContext,requestError,readRequests}from'@/lib/data/erp-requests';
import{requestTypeSchema,staffRequestSchema,requestActionSchema,requestMoreSchema,requestEmailSchema,type RequestCommand}from'@/lib/erp/requests';
export async function refreshRequests(slug:string){return actionResult(()=>readRequests(slug),'تعذر تحميل الطلبات');}
export async function actRequests(slug:string,input:RequestCommand,requestId:string){return actionResult(async()=>{
 const schema=input.action==='type'?requestTypeSchema:input.action==='record'?staffRequestSchema:input.action==='more'?requestMoreSchema:input.action==='email_draft'?requestEmailSchema:requestActionSchema;
 if(!['type','type_delete','type_active','more','more_delete','record','submit','delete','approve','reject','revoke','close','reopen','email_draft'].includes(input.action))throw new Error('العملية غير صالحة');
 const p=schema.safeParse(input.payload);if(!p.success||!z.uuid().safeParse(requestId).success)throw new Error(p.error?.issues[0]?.message||'راجع بيانات الطلب');
 const c=await requestsContext(slug);const r=await c.client.rpc('erp_requests_write',{p_cafe:c.cafe.id,p_action:input.action,p_input:p.data,p_request:requestId});requestError(r.error);revalidatePath('/dashboard/system/requests','layout');revalidatePath(`/finance/${c.cafe.slug}/system/requests`,'layout');return r.data as{id:string;revision:number;deleted:boolean};
 },'تعذر حفظ الطلب');}
