"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import sharp from "sharp";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import { ERP_FILE_BUCKET, ERP_FILE_MAX, erpFileEntitySchema, erpFileSchema } from "@/lib/erp/files";
import { isTemplateXlsx,templateTextMime } from "@/lib/erp/template-files";

const inputSchema = z.object({ entityType: erpFileEntitySchema, recordId: z.uuid(), id: z.uuid().optional() }).strict();
async function fileContext(slug: string, input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error("السجل أو الملف غير صالح");
  return {...await getBrandFinanceContext(slug),input:parsed.data};
}
function fail(error: {code?:string;message?:string}|null) {
  if (!error) return;
  if (error.code === "PGRST202") throw new Error("خدمة المرفقات تحتاج إلى تحديث قاعدة البيانات");
  if (error.message && /[\u0600-\u06ff]/u.test(error.message) && error.message.length<300) throw new Error(error.message);
  throw new Error("تعذر الوصول إلى مرفقات هذا السجل");
}
export async function listErpFiles(slug:string,input:unknown) {
  return actionResult(async()=>{
    const {client,cafe,input:target}=await fileContext(slug,input);
    const result=await client.rpc("erp_file",{p_cafe_id:cafe.id,p_action:"list",p_type:target.entityType,p_record_id:target.recordId});fail(result.error);
    return z.array(erpFileSchema).parse(result.data);
  },"تعذر تحميل المرفقات");
}
export async function uploadErpFile(slug:string,input:unknown,form:FormData) {
  return actionResult(async()=>{
    const {client,cafe,input:target}=await fileContext(slug,input);
    if (!target.id) throw new Error("معرف رفع الملف مطلوب");
    const file=form.get("file");
    if (!(file instanceof File) || file.size<1 || file.size>ERP_FILE_MAX || file.name.length>200) throw new Error("اختر ملفًا صالحًا بحجم لا يتجاوز خمسة ميجابايت");
    const bytes=Buffer.from(await file.arrayBuffer()),ext=file.name.split(".").pop()?.toLowerCase();
    let mime:string;
    if (ext==="png" || ext==="jpg" || ext==="jpeg") {
      const metadata=await sharp(bytes,{limitInputPixels:40_000_000,failOn:"warning"}).metadata();
      if (metadata.format!==(ext==="png"?"png":"jpeg")) throw new Error("محتوى الصورة لا يطابق امتدادها");
      await sharp(bytes,{limitInputPixels:40_000_000,failOn:"warning"}).resize(1,1).raw().toBuffer();
      mime=ext==="png"?"image/png":"image/jpeg";
    } else if (ext==="pdf"&&bytes.subarray(0,5).toString()==="%PDF-") mime="application/pdf";
    else if(ext==="docx"&&bytes.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04]))&&bytes.includes(Buffer.from("[Content_Types].xml"))&&bytes.includes(Buffer.from("word/"))) mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    else if(target.entityType==="document_template"&&ext&&['csv','txt'].includes(ext))mime=templateTextMime(bytes,ext)!;
    else if(target.entityType==="document_template"&&ext==="xlsx"&&isTemplateXlsx(bytes))mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    else throw new Error(target.entityType==="document_template"?"اختر صورة أو ملف PDF أو DOCX أو XLSX أو CSV أو TXT صالحًا":"الملفات المسموحة صور وملفات PDF وDOCX صالحة");
    const args={p_cafe_id:cafe.id,p_type:target.entityType,p_record_id:target.recordId,p_id:target.id};
    const checksum=createHash("sha256").update(bytes).digest("hex");
    const prepared=await client.rpc("erp_file",{...args,p_action:"prepare",p_metadata:{name:file.name,mime,size:bytes.length,sha256:checksum}});fail(prepared.error);
    const stored=erpFileSchema.parse(prepared.data);
    if(stored.uploaded)return stored;
    const upload=await client.storage.from(ERP_FILE_BUCKET).upload(stored.path,bytes,{contentType:mime,upsert:false});
    if(upload.error){
      const existing=await client.storage.from(ERP_FILE_BUCKET).download(stored.path);
      if(existing.error||!existing.data||createHash("sha256").update(Buffer.from(await existing.data.arrayBuffer())).digest("hex")!==checksum)throw new Error("تعذر رفع الملف أعد المحاولة بالملف نفسه");
    }
    const completed=await client.rpc("erp_file",{...args,p_action:"complete"});fail(completed.error);
    return erpFileSchema.parse(completed.data);
  },"تعذر رفع الملف تحقق من نوعه وحجمه ثم حاول مجددًا");
}
export async function downloadErpFile(slug:string,input:unknown) {
  return actionResult(async()=>{
    const {client,cafe,input:target}=await fileContext(slug,input);
    if(!target.id)throw new Error("حدد الملف المطلوب");
    const found=await client.rpc("erp_file",{p_cafe_id:cafe.id,p_action:"get",p_type:target.entityType,p_record_id:target.recordId,p_id:target.id});fail(found.error);
    const file=erpFileSchema.parse(found.data);if(!file.uploaded)throw new Error("لم يكتمل رفع الملف");
    const signed=await client.storage.from(ERP_FILE_BUCKET).createSignedUrl(file.path,60,{download:file.name});
    if(signed.error||!signed.data)throw new Error("تعذر تجهيز تنزيل الملف");
    return {url:signed.data.signedUrl};
  },"تعذر تنزيل الملف");
}
export async function removeErpFile(slug:string,input:unknown) {
  return actionResult(async()=>{
    const {client,cafe,input:target}=await fileContext(slug,input);
    if(!target.id)throw new Error("حدد الملف المطلوب");
    const args={p_cafe_id:cafe.id,p_type:target.entityType,p_record_id:target.recordId,p_id:target.id};
    const found=await client.rpc("erp_file",{...args,p_action:"get"});fail(found.error);
    const file=erpFileSchema.parse(found.data);
    const allowed=await client.rpc("erp_file_delete_access",{p_path:file.path});fail(allowed.error);
    if(allowed.data!==true)throw new Error("الملف مرتبط بسجل آخر أو لا تملك صلاحية حذفه");
    const removed=await client.storage.from(ERP_FILE_BUCKET).remove([file.path]);
    if(removed.error)throw new Error("تعذر حذف الملف");
    const result=await client.rpc("erp_file",{...args,p_action:"remove"});fail(result.error);
    return {removed:true};
  },"تعذر حذف المرفق");
}
