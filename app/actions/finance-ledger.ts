"use server";
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getBrandFinanceContext } from '@/lib/data/brand-finance';
import { ledgerActions, ledgerPilotEnabled, ledgerEditableAccountKinds, type LedgerSnapshot, type LedgerDraft, type LedgerEvent, type LedgerDocument, type LedgerReport } from '@/lib/finance/ledger';
import type { ActionResult } from '@/lib/platform/action-result';

async function result<T>(fn:()=>Promise<T>):Promise<ActionResult<T>> {
  try{return {ok:true,data:await fn()};}catch(error){
    if(error instanceof z.ZodError)return {ok:false,message:'راجع الحقول المطلوبة وحدود القيم ثم أعد المحاولة'};
    return {ok:false,message:error instanceof Error&&/[\u0600-\u06ff]/.test(error.message)&&error.message.length<400?error.message:'تعذر تنفيذ إجراء دفتر الأستاذ أعد المحاولة بنفس الطلب'};
  }
}
async function rpc<T>(name:string,args:Record<string,unknown>,slug?:string):Promise<T> {
  const {client,cafe}=await getBrandFinanceContext(slug);
  if (!ledgerPilotEnabled(cafe.id) || !['owner','manager','accountant','auditor'].includes(cafe.role)) throw new Error('دفتر الأستاذ غير متاح لهذه المنشأة أو لهذا الحساب');
  if (name === 'brand_finance_gl_execute' && (cafe.role === 'auditor' ||
    (args.p_action === 'account_save' && !['owner','accountant'].includes(cafe.role)) ||
    (['settings','period_close','period_reopen'].includes(String(args.p_action)) && cafe.role !== 'owner'))) throw new Error('لا تملك صلاحية تنفيذ هذا الإجراء');
  const {data,error}=await client.rpc(name,{p_cafe_id:cafe.id,...args});
  if(error)throw new Error(error.code==='40001'?'تغيرت البيانات حدث الصفحة وراجعها قبل إعادة الإجراء':error.message);
  return data as T;
}
export async function fetchLedgerAction(offset:number,slug?:string){return result(()=>rpc<LedgerSnapshot>('brand_finance_gl_snapshot',{p_offset:z.number().int().min(0).max(1000000).parse(offset)},slug));}
export async function executeLedgerAction(input:unknown,slug?:string){return result(async()=>{
  const v=z.object({action:z.enum(ledgerActions),requestId:z.uuid(),payload:z.record(z.string(),z.unknown())}).parse(input);
  if(JSON.stringify(v.payload).length>100000)throw new Error('حجم بيانات الطلب أكبر من المسموح');
  if (v.action === 'account_save') z.enum(ledgerEditableAccountKinds).parse(v.payload.kind);
  const data=await rpc<LedgerDraft>('brand_finance_gl_execute',{p_action:v.action,p_payload:v.payload,p_request_id:v.requestId},slug);
  revalidatePath(slug?`/finance/${slug}/ledger`:'/dashboard/finance/ledger');return data;
});}
export async function fetchLedgerEventsAction(id:string,before:number|null,slug?:string){return result(()=>rpc<LedgerEvent[]>('brand_finance_gl_events',{p_id:z.uuid().parse(id),p_before:before===null?null:z.number().int().positive().parse(before)},slug));}
export async function fetchLedgerDocumentAction(id:string,slug?:string){return result(()=>rpc<LedgerDocument>('brand_finance_gl_document',{p_id:z.uuid().parse(id)},slug));}
export async function fetchLedgerReportAction(from:string,to:string,accountId:string|null,offset:number,slug?:string){return result(()=>rpc<LedgerReport>('brand_finance_gl_report',{
  p_from:z.iso.date().parse(from),p_to:z.iso.date().parse(to),p_account_id:accountId===null?null:z.uuid().parse(accountId),p_offset:z.number().int().min(0).max(1000000).parse(offset)
},slug));}
