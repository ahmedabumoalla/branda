import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {oauthHash,boundedRequestText} from '@/lib/erp/settings-oauth';
import {systemApiResponse} from '@/lib/erp/settings-api';
export async function POST(request:Request){try{const p=new URLSearchParams(await boundedRequestText(request)),id=z.uuid().parse(p.get('client_id')),token=z.string().min(32).max(100).parse(p.get('token')),r=await createAdminClient().rpc('erp_system_oauth_revoke',{p_client:id,p_hash:oauthHash(token)});if(r.error)return systemApiResponse({error:'server_error'},503);return new Response(null,{status:200,headers:{'Cache-Control':'no-store'}});}catch{return systemApiResponse({error:'invalid_request'},400);}}
