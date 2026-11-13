"use server";
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import {readAccounting,accountingError} from '@/lib/data/erp-accounting';
import {accountingJournalSchema,accountingConfigurationSchema,costCenterSchema} from '@/lib/erp/accounting';
import type {LedgerDocument,LedgerReport,LedgerEvent} from '@/lib/finance/ledger';
import {actionResult} from '@/lib/platform/action-result';
import type {AccountingCostReport} from '@/lib/erp/accounting';
export async function getErpAccounting(slug:string,offset=0,id?:string){return actionResult(()=>readAccounting(z.number().int().min(0).max(1000000).parse(offset),slug,z.uuid().optional().parse(id)),'تعذر تحميل الحسابات');}
export async function mutateErpAccounting(slug:string,action:string,input:unknown,requestId:string){return actionResult(async()=>{
 const operation=z.enum(['configuration','cost_center','cost_center_delete','save','submit','approve','post','reverse','cancel','account_save','period_close','period_reopen','settings']).parse(action);
 const data=operation==='save'?accountingJournalSchema.parse(branchInput(input)):operation==='configuration'?accountingConfigurationSchema.parse(branchInput(input)):operation==='cost_center'?costCenterSchema.parse(branchInput(input)):z.record(z.string(),z.unknown()).parse(branchInput(input));
 if(JSON.stringify(data).length>400000)throw new Error('البيانات أكبر من الحد المسموح');
 const{client,cafe}=await getBrandFinanceContext(slug);const r=await branchRpc(client,cafe.id,'erp_accounting_write',{p_cafe_id:cafe.id,p_action:operation,p_data:data,p_request_id:z.uuid().parse(requestId)},input);accountingError(r.error);revalidatePath('/dashboard/system/accounting','layout');revalidatePath(`/finance/${cafe.slug}/system/accounting`,'layout');return r.data as {id:string;revision?:number};
},'تعذر حفظ العملية المحاسبية');}
export async function getErpAccountingDocument(slug:string,id:string){return actionResult(async()=>{const{client,cafe}=await getBrandFinanceContext(slug);const r=await client.rpc('erp_accounting_detail',{p_cafe_id:cafe.id,p_kind:'document',p_id:z.uuid().parse(id)});accountingError(r.error);return r.data as LedgerDocument;},'تعذر تحميل المستند');}
export async function getErpAccountingEvents(slug:string,id:string){return actionResult(async()=>{const{client,cafe}=await getBrandFinanceContext(slug);const r=await client.rpc('erp_accounting_detail',{p_cafe_id:cafe.id,p_kind:'events',p_id:z.uuid().parse(id)});accountingError(r.error);return r.data as LedgerEvent[];},'تعذر تحميل سجل النشاط');}
export async function getErpAccountingReport(slug:string,from:string,to:string,accountId:string|null,offset=0){return actionResult(async()=>{const{client,cafe}=await getBrandFinanceContext(slug);const r=await client.rpc('erp_accounting_report',{p_cafe_id:cafe.id,p_from:z.iso.date().parse(from),p_to:z.iso.date().parse(to),p_account_id:z.uuid().nullable().parse(accountId),p_offset:z.number().int().min(0).max(1000000).parse(offset)});accountingError(r.error);return r.data as LedgerReport;},'تعذر تحميل التقرير');}
export async function getErpAccountingCostReport(slug:string,from:string,to:string,center:string|null){return actionResult(async()=>{const{client,cafe}=await getBrandFinanceContext(slug);const r=await client.rpc('erp_accounting_cost_report',{p_cafe_id:cafe.id,p_from:z.iso.date().parse(from),p_to:z.iso.date().parse(to),p_center:z.uuid().nullable().parse(center)});accountingError(r.error);return r.data as AccountingCostReport;},'تعذر تحميل تقرير مراكز التكلفة');}
