import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { createAdminClient } from "@/lib/supabase/admin";
import { canFinance } from "@/lib/finance/permissions";
import { INVENTORY_IMAGE_BUCKET, inventoryImageUrl, isInventoryImagePath } from "@/lib/finance/inventory-catalog";
import { readInventoryUpload } from "@/lib/finance/inventory-image";

export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store",Vary:"Cookie","X-Content-Type-Options":"nosniff"};
type Context={params:Promise<{slug:string}>};
export async function POST(request:Request,{params}:Context) {
  if(request.headers.get("origin")!==new URL(request.url).origin)return Response.json({error:"طلب غير صالح"},{status:403,headers});
  const {slug}=await params;
  const context=await getBrandFinanceContext(slug).catch(()=>null);
  if(!context||!canFinance(context.cafe.role,"inventory_write"))return Response.json({error:"لا تملك صلاحية إضافة صورة للصنف"},{status:403,headers});
  try {
    const bytes=await readInventoryUpload(request);
    const path=`${context.cafe.id}/${randomUUID()}.webp`;
    const storage=createAdminClient().storage;
    const {data:bucket,error:bucketError}=await storage.getBucket(INVENTORY_IMAGE_BUCKET);
    if(bucketError||!bucket||bucket.public)throw new Error("تخزين صور المستودع الخاص غير متاح");
    const {error}=await storage.from(INVENTORY_IMAGE_BUCKET).upload(path,bytes,{contentType:"image/webp",upsert:false});
    if(error)throw new Error("تعذر رفع الصورة حاول مجددًا");
    return Response.json({path,url:inventoryImageUrl(path,slug)},{headers});
  }catch(error){return Response.json({error:error instanceof Error&&/[\u0600-\u06ff]/.test(error.message)?error.message:"تعذر قراءة الصورة اختر صورة سليمة"},{status:400,headers});}
}
export async function GET(request:Request,{params}:Context) {
  const {slug}=await params;
  const context=await getBrandFinanceContext(slug).catch(()=>null);
  const path=new URL(request.url).searchParams.get("path");
  if(!context||!canFinance(context.cafe.role,"inventory_read")||!isInventoryImagePath(path,context.cafe.id))return Response.json({error:"الصورة غير متاحة لهذا الحساب"},{status:403,headers});
  const {data,error}=await createAdminClient().storage.from(INVENTORY_IMAGE_BUCKET).createSignedUrl(path,60);
  if(error||!data?.signedUrl)return Response.json({error:"الصورة غير موجودة"},{status:404,headers});
  return NextResponse.redirect(data.signedUrl,{status:307,headers});
}
