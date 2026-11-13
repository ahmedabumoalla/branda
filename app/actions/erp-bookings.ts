"use server";
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { actionResult } from "@/lib/platform/action-result";
import { erpBookingContext, erpBookingError, findErpBookingCustomers, getErpBookings } from "@/lib/data/erp-bookings";
import { bookingCommandSchema, type BookingCommand } from "@/lib/erp/bookings";
import { createAdminClient } from "@/lib/supabase/admin";
import sharp from "sharp";

export async function readErpBookings(slug:string,from:string,to:string) { return actionResult(()=>getErpBookings(slug,from,to),"تعذر تحميل الحجوزات"); }
export async function searchErpBookingCustomers(slug:string,query:string,offset=0) { return actionResult(()=>findErpBookingCustomers(slug,query,offset),"تعذر البحث عن العملاء"); }
export async function mutateErpBookings(slug:string,command:BookingCommand,requestId:string) {
 return actionResult(async()=>{
  const parsed=bookingCommandSchema.safeParse(branchInput(command));
  if(!parsed.success)throw new Error("راجع بيانات الحجز والخدمة والموظف والموعد");
  const request=z.uuid().safeParse(requestId);if(!request.success)throw new Error("تعذر التحقق من طلب الحفظ أعد المحاولة");
  const {client,cafe}=await erpBookingContext(slug,true);
  const {data,error}=await branchRpc(client,cafe.id,"erp_bookings_write",{p_cafe_id:cafe.id,p_action:parsed.data.action,p_payload:parsed.data.payload,p_request_id:request.data},command);
  erpBookingError(error);revalidatePath("/dashboard/system/bookings","layout");return data as {id:string;ids?:string[];documentId?:string};
 },"تعذر حفظ التغييرات");
}

export async function uploadErpBookingImage(slug:string,form:FormData){
 return actionResult(async()=>{
  const {cafe}=await erpBookingContext(slug,true);
  const file=form.get("image");
  if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>750000)throw new Error("اختر صورة بصيغة PNG أو JPEG أو WebP وحجم لا يتجاوز 750 كيلوبايت");
  const input=Buffer.from(await file.arrayBuffer());
  let bytes:Buffer;
  try{bytes=await sharp(input,{limitInputPixels:20000000,animated:false}).rotate().resize({width:1200,height:1200,fit:"inside",withoutEnlargement:true}).webp({quality:85}).toBuffer()}catch{throw new Error("تعذر قراءة الصورة اختر صورة سليمة")}
  const path=`${cafe.id}/${crypto.randomUUID()}.webp`,storage=createAdminClient().storage.from("erp-booking-images");
  const {error}=await storage.upload(path,bytes,{contentType:"image/webp",upsert:false});
  if(error)throw new Error("تعذر رفع صورة الخدمة");
  const {data:signed,error:signError}=await storage.createSignedUrl(path,3600);
  if(signError||!signed)throw new Error("تعذر عرض صورة الخدمة");
  return {path,url:signed.signedUrl};
 },"تعذر رفع صورة الخدمة");
}
