'use server';
import {branchInput} from '@/lib/erp/branches';
import {branchRpc} from '@/lib/data/erp-branches';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {actionResult} from '@/lib/platform/action-result';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import {readReports,runReport,reportError} from '@/lib/data/erp-reports';
import {reportQuerySchema,savedReportSchema,type ReportResult} from '@/lib/erp/reports';
export async function getErpReports(slug:string){return actionResult(()=>readReports(slug),'تعذر تحميل التقارير');}
export async function runErpReport(slug:string,input:unknown){return actionResult(async()=>{const p=reportQuerySchema.safeParse(branchInput(input));if(!p.success)throw new Error('راجع فترة التقرير والأعمدة والشروط');return runReport(p.data,slug,input);},'تعذر إعداد التقرير');}
export async function exportErpReport(slug:string,input:unknown){return actionResult(async()=>{const p=reportQuerySchema.safeParse(branchInput(input));if(!p.success)throw new Error('راجع خيارات التقرير قبل التصدير');const{client,cafe}=await getBrandFinanceContext(slug);const r=await branchRpc(client,cafe.id,'erp_report_export',{p_cafe_id:cafe.id,p_query:p.data},input);if(r.error?.code==='54000')throw new Error('تجاوز التقرير خمسين ألف صف حدد فترة أصغر أو أضف شرطًا ثم صدّر التقرير');reportError(r.error);return r.data as ReportResult;},'تعذر تصدير التقرير');}
export async function saveErpReport(slug:string,action:'save'|'delete',input:unknown,requestId:string){return actionResult(async()=>{const operation=z.enum(['save','delete']).parse(action);const p=(operation==='save'?savedReportSchema:z.object({id:z.uuid(),revision:z.number().int().positive()}).strict()).safeParse(branchInput(input));if(!p.success)throw new Error('راجع اسم التقرير وأعمدته وشروطه');const{client,cafe}=await getBrandFinanceContext(slug);const r=await branchRpc(client,cafe.id,'erp_reports_write',{p_cafe_id:cafe.id,p_action:operation,p_data:p.data,p_request_id:z.uuid().parse(requestId)},input);reportError(r.error);revalidatePath('/dashboard/system/reports','layout');revalidatePath(`/finance/${cafe.slug}/system/reports`,'layout');return r.data as{id:string};},'تعذر حفظ التقرير');}
