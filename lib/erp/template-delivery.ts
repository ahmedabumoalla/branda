import "server-only";
import { brandAllowsNewWork } from '@/lib/data/account-cancellation';
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { documentTemplateContext,documentTemplateError } from "@/lib/data/erp-templates";
import { sanitizeTemplateBody,templateEscape } from "@/lib/erp/templates-render";
import { substituteTemplate,type DocumentTemplateValues,type TemplateDelivery } from "@/lib/erp/templates";
import { isMetaWhatsAppConfigured,sendMetaWhatsAppText } from "@/lib/whatsapp/meta-cloud";
import { deliveryHttpState,normalizeTemplatePhone,templatePlainText } from "@/lib/erp/template-delivery-policy";
import { sendSavedSystemTemplate } from "@/lib/erp/settings-delivery";
type Claimed=TemplateDelivery&{cafe_id:string;lease_id:string;values:DocumentTemplateValues;cc:string[];bcc:string[]};
type Outcome={status:"sent"|"failed"|"unknown"|"blocked";message?:string;providerId?:string};
async function deliver(job:Claimed,manual=false):Promise<Outcome>{
 try{if(!await brandAllowsNewWork(job.cafe_id))return{status:'blocked',message:'حساب العلامة ملغى ولن ترسل رسائل جديدة'};}catch{return{status:'blocked',message:'تعذر التحقق من حالة حساب العلامة قبل الإرسال'};}
 const subject=substituteTemplate(job.subject,job.values),html=sanitizeTemplateBody(substituteTemplate(job.body,job.values,templateEscape)),text=templatePlainText(html);
 if(job.channel==="system")return{status:"sent",providerId:"internal:"+job.id};
 if(manual&&text){const saved=await sendSavedSystemTemplate({cafeId:job.cafe_id,id:job.id,channel:job.channel,recipient:job.recipient,subject,html,text,cc:job.cc,bcc:job.bcc});if(saved)return saved;}
 if(process.env.ERP_TEMPLATE_EXTERNAL_DELIVERY_ENABLED!=="true")return{status:"blocked",message:"الإرسال الخارجي للقوالب غير مفعل"};
 if(!text)return{status:"blocked",message:"محتوى الرسالة فارغ"};
 if((job.channel==="sms"&&text.length>1600)||(job.channel==="whatsapp"&&text.length>4096))return{status:"blocked",message:"نص الرسالة يتجاوز حد القناة اختر قالبًا أقصر"};
 try{
  if(job.channel==="email"){
   if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)return{status:"blocked",message:"خدمة البريد الإلكتروني غير مهيأة"};
   if(!z.email().safeParse(job.recipient).success||!z.array(z.email()).max(10).safeParse(job.cc).success||!z.array(z.email()).max(11).safeParse(job.bcc).success)return{status:"blocked",message:"عنوان البريد غير صالح"};
   const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,"Content-Type":"application/json","Idempotency-Key":`erp-template-${job.id}`},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:job.recipient,subject,html,text,cc:job.cc,bcc:job.bcc}),signal:AbortSignal.timeout(20000)});
   if(!response.ok)return{status:deliveryHttpState(response.status),message:"لم يؤكد مزود البريد قبول الرسالة"};const body=await response.json();return typeof body.id==="string"?{status:"sent",providerId:body.id}:{status:"unknown",message:"لم يصل معرف الرسالة من المزوّد"};
  }
  const phone=normalizeTemplatePhone(job.recipient);if(!phone)return{status:"blocked",message:"رقم المستلم غير صالح"};
  if(job.channel==="sms"){
   const sid=process.env.TWILIO_ACCOUNT_SID,token=process.env.TWILIO_AUTH_TOKEN,from=process.env.TWILIO_PHONE_NUMBER;if(!sid||!token||!from)return{status:"blocked",message:"خدمة الرسائل القصيرة غير مهيأة"};
   if(!/^AC[a-f0-9]{32}$/i.test(sid))return{status:"blocked",message:"إعداد حساب الرسائل القصيرة غير صالح"};
   const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{method:"POST",headers:{Authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64"),"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({To:phone,From:from,Body:text}),signal:AbortSignal.timeout(20000)});
   if(!response.ok)return{status:deliveryHttpState(response.status),message:"لم يؤكد مزود الرسائل القصيرة قبول الرسالة"};const body=await response.json();return typeof body.sid==="string"?{status:"sent",providerId:body.sid}:{status:"unknown",message:"لم يصل معرف الرسالة من المزوّد"};
  }
  if(job.channel==="whatsapp"){
   if(!isMetaWhatsAppConfigured())return{status:"blocked",message:"خدمة واتساب غير مهيأة"};const r=await sendMetaWhatsAppText({to:phone,body:text});if(r.ok)return r.messageId?{status:"sent",providerId:r.messageId}:{status:"unknown",message:"لم يصل تأكيد مزود واتساب"};return{status:r.skipped?"blocked":r.status?deliveryHttpState(r.status):"unknown",message:"لم يؤكد مزود واتساب قبول الرسالة"};
  }
  return{status:"blocked",message:"طريقة الإرسال غير متاحة"};
 }catch{return{status:"unknown",message:"انقطع الاتصال قبل تأكيد المزوّد ولن يتكرر الإرسال تلقائيًا"};}
}
async function processJobs(jobs:Claimed[],manual=false){const admin=createAdminClient(),results:{id:string;status:string}[]=[];for(const job of jobs){const result=await deliver(job,manual);const saved=await admin.rpc("erp_template_finish",{p_cafe_id:job.cafe_id,p_id:job.id,p_lease:job.lease_id,p_status:result.status,p_error:result.message??"",p_provider_id:result.providerId??null});if(saved.error||saved.data!==true)throw new Error("تعذر تثبيت تأكيد الإرسال ولن نكرر الرسالة تلقائيًا");results.push({id:job.id,status:result.status});}return results;}
export async function runTemplateDeliveriesForBrand(slug:string){const {client,cafe}=await documentTemplateContext(slug,true);const result=await client.rpc("erp_template_claim",{p_cafe_id:cafe.id,p_limit:5});documentTemplateError(result.error);return processJobs((result.data as Omit<Claimed,"cafe_id">[]).map(j=>({...j,cafe_id:cafe.id})),true);}
export async function runDueTemplateDeliveries(){const admin=createAdminClient();const result=await admin.rpc("erp_template_claim_due",{p_limit:5});documentTemplateError(result.error);return processJobs(result.data as Claimed[]);}
