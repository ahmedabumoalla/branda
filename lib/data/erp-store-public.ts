import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServiceRoleKey } from "@/lib/barndaksa/env";
import { publicStoreSchema, type PublicStore } from "@/lib/erp/store-public";

export async function readPublicStore(slug:string):Promise<PublicStore|null>{
 if(!slug||slug.length>160)return null;
 const {data,error}=await createAdminClient().rpc("erp_store_public_read",{p_slug:slug});
 if(error)throw new Error("تعذر تحميل المتجر");
 return data?publicStoreSchema.parse(data):null;
}
/** Only Vercel's overwritten client-IP header is trusted on Vercel. Local/self-hosted traffic shares a bucket. */
export function publicStoreFingerprint(headers:Headers,slug:string){
 const candidate=process.env.VERCEL==="1"?headers.get("x-vercel-forwarded-for")?.trim():null;
 const ip=candidate&&isIP(candidate)?candidate:"shared-untrusted-origin";
 return createHmac("sha256",getSupabaseServiceRoleKey()).update(`store-form:${slug}:${ip}`).digest("hex");
}
