import "server-only";
import { z } from "zod";
import { getBrandFinanceContext } from "./brand-finance";
import type { FinanceControlReport, JournalExportPage } from "@/lib/finance/control-report";
const date=z.union([z.literal(""),z.iso.date()]);
export async function getFinanceControlReport(slug?: string): Promise<FinanceControlReport> {
  const {client,cafe}=await getBrandFinanceContext(slug);
  const {data,error}=await client.rpc("brand_finance_control_report",{p_cafe_id:cafe.id});
  if(error || !data) throw new Error("تعذر تحميل الرقابة المالية تحقق من الاتصال وصلاحية التقارير");
  return data as FinanceControlReport;
}
export async function getFinanceJournalExport(input: unknown,slug?: string): Promise<JournalExportPage> {
  const filter=z.object({from:date,to:date,query:z.string().trim().max(120),asOf:z.iso.datetime({offset:true}).optional(),afterTime:z.iso.datetime({offset:true}).optional(),afterId:z.uuid().optional()}).strict().parse(input);
  const {client,cafe}=await getBrandFinanceContext(slug);
  const {data,error}=await client.rpc("brand_finance_journal_export",{p_cafe_id:cafe.id,p_from:filter.from||null,p_to:filter.to||null,p_query:filter.query,p_as_of:filter.asOf??null,p_after_time:filter.afterTime??null,p_after_id:filter.afterId??null});
  if(error || !data) throw new Error("تعذر تصدير اليومية تحقق من الفترة وصلاحية التقارير");
  return data as JournalExportPage;
}
export async function getFinancePeriodClosures(slug?: string) {
  const {client,cafe}=await getBrandFinanceContext(slug);
  const {data,error}=await client.rpc("brand_finance_period_closures",{p_cafe_id:cafe.id});
  if(error || !data) throw new Error("تعذر تحميل سجل إقفال الفترات");
  return data as {rows:{id:string;previous_closed_through:string|null;closed_through:string;reason:string;actor_name:string;created_at:string}[];total:number;hasMore:boolean};
}
