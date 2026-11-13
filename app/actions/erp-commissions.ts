"use server";
import {actionResult} from '@/lib/platform/action-result';
import {readCommissions,writeCommission,readCommissionSales} from '@/lib/data/erp-commissions';
export async function readErpCommissions(id:string|null,slug:string){return actionResult(()=>readCommissions(id,slug),'تعذر تحميل العمولات');}
export async function executeErpCommission(input:unknown,requestId:string,slug:string){return actionResult(()=>writeCommission(input,requestId,slug),'تعذر حفظ العمولة');}
export async function readErpCommissionSales(input:unknown,slug:string){return actionResult(()=>readCommissionSales(input,slug),'تعذر تحميل المبيعات');}
