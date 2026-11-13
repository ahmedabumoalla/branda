"use server";
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import {readErpFinance,erpFinanceError} from '@/lib/data/erp-finance';
import {readTimeSpreadsheet} from '@/lib/data/erp-time-import';
import {financeVoucherSchema,financialCustodySchema,financeCategorySchema,financeSettingsSchema,financeScheduleSchema,bankStatementSchema,custodySettlementSchema,type BankStatementDetail} from '@/lib/erp/finance';
import {actionResult} from '@/lib/platform/action-result';
export async function getErpFinance(slug:string,query:{offset?:number;kind?:string;id?:string}={}){return actionResult(()=>readErpFinance(z.object({offset:z.number().int().min(0).max(1000000).optional(),kind:z.enum(['expense','receipt']).optional(),id:z.uuid().optional()}).parse(query),slug),'تعذر تحميل المالية');}
export async function mutateErpFinance(slug:string,action:string,input:unknown,requestId:string){return actionResult(async()=>{
 const operation=z.enum(['save_voucher','post','reverse','delete_voucher','save_custody','fund','settle_custody','return_custody','reverse_custody_movement','close_custody','cancel_custody','reopen_custody','category','delete_category','settings','schedule','generate_schedule','import_bank','match_bank','unmatch_bank']).parse(action);
 const schema=operation==='save_voucher'?financeVoucherSchema:operation==='save_custody'?financialCustodySchema:operation==='category'?financeCategorySchema:operation==='settings'?financeSettingsSchema:operation==='schedule'?financeScheduleSchema:operation==='import_bank'?bankStatementSchema:operation==='settle_custody'?custodySettlementSchema:z.record(z.string(),z.unknown());
 const parsed=schema.safeParse(branchInput(input));if(!parsed.success)throw new Error('راجع الحقول المطلوبة والمبالغ والتواريخ');const data=parsed.data;if(JSON.stringify(data).length>2500000)throw new Error('حجم البيانات أكبر من المسموح');
 const{client,cafe}=await getBrandFinanceContext(slug);const r=await branchRpc(client,cafe.id,'erp_finance_write',{p_cafe_id:cafe.id,p_action:operation,p_data:data,p_request_id:z.uuid().parse(requestId)},input);erpFinanceError(r.error);revalidatePath('/dashboard/system/finance','layout');revalidatePath(`/finance/${cafe.slug}/system/finance`,'layout');return r.data as {id:string;voucherId?:string};
 },'تعذر حفظ العملية المالية');}
export async function getErpFinanceBank(slug:string,id:string){return actionResult(async()=>{const{client,cafe}=await getBrandFinanceContext(slug);const r=await client.rpc('erp_finance_detail',{p_cafe_id:cafe.id,p_kind:'bank',p_id:z.uuid().parse(id)});erpFinanceError(r.error);return r.data as BankStatementDetail;},'تعذر تحميل المطابقة');}
export async function getErpFinanceHistory(slug:string,id:string,kind:'events'|'custody'){return actionResult(async()=>{const{client,cafe}=await getBrandFinanceContext(slug);const r=await client.rpc('erp_finance_detail',{p_cafe_id:cafe.id,p_kind:z.enum(['events','custody']).parse(kind),p_id:z.uuid().parse(id)});erpFinanceError(r.error);return r.data as {id:string;action?:string;created_at:string;kind?:string;amount?:number;document_id?:string;reversal_of?:string;effective_on?:string;payload?:Record<string,unknown>}[];},'تعذر تحميل سجل العمليات');}
export async function previewErpBankImport(slug:string,data:FormData){return actionResult(async()=>{await readErpFinance({},slug);const file=data.get('file');if(!(file instanceof File))throw new Error('اختر الملف');const rows=await readTimeSpreadsheet(file,z.enum([',',';','\t']).parse(data.get('delimiter')||','));if(rows.length>101)throw new Error('الحد الأقصى مائة حركة في الملف');return {rows,hash:createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'),name:file.name};},'تعذر قراءة الملف البنكي');}
