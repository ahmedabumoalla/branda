import { timingSafeEqual } from "node:crypto";
import { runDueTemplateDeliveries } from "@/lib/erp/template-delivery";
export const runtime="nodejs";
export const maxDuration=120;
export async function GET(request:Request){return POST(request);}
export async function POST(request:Request){const expected=process.env.CRON_SECRET;if(!expected)return Response.json({error:"Worker is not configured"},{status:503});const token=request.headers.get("authorization")?.replace(/^Bearer /,"")??"";const a=Buffer.from(token),b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))return Response.json({error:"Unauthorized"},{status:401});try{return Response.json({results:await runDueTemplateDeliveries()});}catch{return Response.json({error:"Delivery confirmation unavailable"},{status:503});}}
