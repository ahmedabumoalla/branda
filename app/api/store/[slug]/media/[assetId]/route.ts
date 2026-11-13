import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{slug:string;assetId:string}>}){
 const {slug,assetId}=await params;if(slug.length>160||!z.uuid().safeParse(assetId).success)return new Response(null,{status:404});
 const client=createAdminClient();const {data,error}=await client.rpc("erp_store_public_media",{p_slug:slug,p_asset:assetId});if(error||!data||typeof data.path!=="string"||!/^[-\da-f]{36}\/[-\da-f]{36}\.webp$/i.test(data.path))return new Response(null,{status:404,headers:{"Cache-Control":"private, no-store"}});
 const file=await client.storage.from("erp-store-media").download(data.path);if(file.error||!file.data)return new Response(null,{status:404});
 // Recheck after Storage I/O so an unpublish/archive during the download cannot release the bytes.
 const gate=await client.rpc("erp_store_public_media",{p_slug:slug,p_asset:assetId});if(gate.error||gate.data?.path!==data.path)return new Response(null,{status:404});
 return new Response(file.data,{headers:{"Content-Type":"image/webp","Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'"}});
}
