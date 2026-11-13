import { createAdminClient } from "@/lib/supabase/admin";
import { publicStoreFormSchema } from "@/lib/erp/store-public";
import { publicStoreFingerprint } from "@/lib/data/erp-store-public";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}){
 const origin=request.headers.get("origin");if(!origin||origin!==new URL(request.url).origin)return Response.json({message:"طلب غير مسموح"},{status:403});
 if(!request.headers.get("content-type")?.startsWith("application/json"))return new Response(null,{status:415});
 const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400});let size=0;const chunks:Uint8Array[]=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>24000){await reader.cancel();return Response.json({message:"حجم النموذج أكبر من المسموح"},{status:413});}chunks.push(value);}
 const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}let input:unknown;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{return new Response(null,{status:400});}
 const parsed=publicStoreFormSchema.safeParse(input);if(!parsed.success)return Response.json({message:"راجع حقول النموذج"},{status:400});const {slug}=await params;if(slug.length>160)return new Response(null,{status:404});const f=parsed.data;
 const {error}=await createAdminClient().rpc("erp_store_public_submit",{p_slug:slug,p_version:f.versionId,p_page:f.pageId,p_form:f.formId,p_request:f.requestId,p_values:f.values,p_fingerprint:publicStoreFingerprint(request.headers,slug)});
 if(error)return Response.json({message:error.code==="54000"?"وصلت للحد المسموح حاول لاحقًا":error.code==="42501"?"تغيرت نسخة المتجر أعد تحميل الصفحة":"تعذر حفظ النموذج راجع الحقول وحاول مجددًا"},{status:error.code==="54000"?429:error.code==="42501"?409:400,headers:{"Cache-Control":"private, no-store"}});
 return Response.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
}
