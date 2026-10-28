import { timingSafeEqual } from "node:crypto";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { getSubscriptionInvoice } from "@/lib/data/subscription-invoices";
import { createSubscriptionInvoicePdf } from "@/lib/export/subscription-invoice-pdf";
import { INVOICE_SELLER, invoiceLocalDate, previewSubscriptionInvoice } from "@/lib/platform/subscription-invoices";
export const dynamic="force-dynamic";export const runtime="nodejs";export const maxDuration=60;
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
  if(id==='health'){
    const secret=process.env.CRON_SECRET??'',a=Buffer.from(request.headers.get('authorization')??''),b=Buffer.from(`Bearer ${secret}`);
    if(secret.length<32||a.length!==b.length||!timingSafeEqual(a,b))return new Response(null,{status:401,headers});
    try{const invoice=previewSubscriptionInvoice({requestId:'00000000-0000-4000-8000-000000000001',customer:{...INVOICE_SELLER,name:'اختبار تقني غير صادر'},dueDate:invoiceLocalDate(),taxInclusive:true,lines:[{planId:'probe',months:3,amountCents:27600}]},[{id:'probe',name:'باقة تجريبية'}]);const bytes=await createSubscriptionInvoicePdf(invoice,true);return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'application/pdf'}});}
    catch(error){console.error('SUBSCRIPTION_INVOICE_PROBE_FAILED',error instanceof Error?error.message:'unknown');return new Response(null,{status:503,headers});}
  }
  try{await requirePlatformAdmin();}catch{return new Response(null,{status:401,headers});}
  let invoice;try{invoice=await getSubscriptionInvoice(id);}catch{return new Response(null,{status:404,headers});}
  try{const bytes=await createSubscriptionInvoicePdf(invoice);const mode=new URL(request.url).searchParams.get('download')==='1'?'attachment':'inline';return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`${mode}; filename="${invoice.number}.pdf"`}});}
  catch{return Response.json({error:'تعذر تجهيز ملف الفاتورة حاول مجددًا'},{status:503,headers});}
}
