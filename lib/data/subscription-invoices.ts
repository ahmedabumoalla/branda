import "server-only";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";
import { subscriptionInvoiceSchema, previewSubscriptionInvoice, type SubscriptionInvoice, type InvoiceList, type InvoicePlan } from "@/lib/platform/subscription-invoices";

export async function getSubscriptionInvoicePlans():Promise<InvoicePlan[]> {
  await requirePlatformAdmin();const db=await createClient();
  const result=await db.from('platform_plans').select('id,name').eq('active',true).order('sort_order');
  if(result.error)throw Error('تعذر تحميل الباقات');return result.data??[];
}
export async function listSubscriptionInvoices(input:unknown={page:0,search:''}):Promise<InvoiceList>{
  await requirePlatformAdmin();const {page,search}=z.object({page:z.number().int().min(0).max(100000),search:z.string().trim().max(160)}).parse(input);
  const db=await createClient();let query=db.from('platform_subscription_invoices').select('id,invoice_number,issued_at,customer_name,total_cents',{count:'exact'});
  if(search){const safe=search.replace(/[\\%_]/g,c=>'\\'+c);query=query.ilike(search.toUpperCase().startsWith('INV-')?'invoice_number':'customer_name',`%${safe}%`);}
  const result=await query.order('issued_at',{ascending:false}).order('id').range(page*20,page*20+19);
  if(result.error)throw Error('تعذر تحميل فواتير الاشتراكات');return {rows:result.data??[],total:result.count??0,page,search};
}
function parsedInvoice(input:unknown){const parsed=subscriptionInvoiceSchema.safeParse(input);if(!parsed.success)throw Error('راجع بيانات العميل والرقم الضريبي والباقات والمبالغ');return parsed.data;}
export async function prepareSubscriptionInvoicePreview(input:unknown){await requirePlatformAdmin();return previewSubscriptionInvoice(parsedInvoice(input),await getSubscriptionInvoicePlans());}
export async function issueSubscriptionInvoice(input:unknown):Promise<SubscriptionInvoice>{
  await requirePlatformAdmin();const {requestId,...draft}=parsedInvoice(input);const db=await createClient();
  const result=await db.rpc('admin_issue_subscription_invoice',{p_id:requestId,p_input:draft});
  if(result.error){const message=String(result.error.message);if(message.includes('INVOICE_REQUEST_CHANGED'))throw Error('تم إصدار هذه المحاولة ببيانات مختلفة حدّث السجل قبل إنشاء فاتورة جديدة');if(message.includes('INVOICE_PLAN_UNAVAILABLE'))throw Error('إحدى الباقات لم تعد متاحة حدّث قائمة الباقات');throw Error('تعذر تأكيد الإصدار أعد المحاولة بنفس البيانات لتجنب تكرار الفاتورة');}
  return getSubscriptionInvoice(result.data);
}
export async function getSubscriptionInvoice(input:unknown):Promise<SubscriptionInvoice>{
  await requirePlatformAdmin();const id=z.uuid().parse(input);const db=await createClient();const result=await db.from('platform_subscription_invoices').select('data').eq('id',id).maybeSingle();
  if(result.error||!result.data)throw Error('الفاتورة غير متاحة');return result.data.data as SubscriptionInvoice;
}
