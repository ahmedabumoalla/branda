"use server";
import {actionResult} from '@/lib/platform/action-result';
import {readOrganization,writeOrganization} from '@/lib/data/erp-organization';
export async function readErpOrganization(slug:string){return actionResult(()=>readOrganization(slug),'تعذر تحميل الهيكل التنظيمي');}
export async function writeErpOrganization(input:unknown,requestId:string,slug:string){return actionResult(()=>writeOrganization(input,requestId,slug),'تعذر حفظ الهيكل التنظيمي');}
