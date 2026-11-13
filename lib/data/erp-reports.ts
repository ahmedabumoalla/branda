import 'server-only';
import {branchRpc} from './erp-branches';
import {getBrandFinanceContext} from './brand-finance';
import type {ReportsSnapshot,ReportQuery,ReportResult} from '@/lib/erp/reports';
export function reportError(error:{code?:string;message?:string}|null){if(!error)return;if(error.code==='40001')throw new Error('تغير التقرير أعد تحميله');if(error.code==='42501')throw new Error('لا تملك صلاحية هذا التقرير أو مصدر بياناته');if(error.message&&/[\u0600-\u06ff]/.test(error.message)&&error.message.length<400)throw new Error(error.message);throw new Error('تعذر إعداد التقرير');}
export async function readReports(slug?:string):Promise<ReportsSnapshot>{const{client,cafe}=await getBrandFinanceContext(slug);const r=await client.rpc('erp_reports_read',{p_cafe_id:cafe.id});reportError(r.error);return{...r.data,slug:cafe.slug,brand:cafe.name};}
export async function runReport(query:ReportQuery,slug?:string,input?:unknown):Promise<ReportResult>{const{client,cafe}=await getBrandFinanceContext(slug);const expected=input??{branchScope:(await client.rpc('erp_branch_context',{p_cafe:cafe.id})).data?.scope};const r=await branchRpc(client,cafe.id,'erp_report_run',{p_cafe_id:cafe.id,p_query:query},expected);reportError(r.error);return r.data;}
