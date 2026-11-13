import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {systemApiHash} from './settings-secrets';
export function systemRequestToken(request:Request){const token=request.headers.get('authorization')?.match(/^Bearer (branda_[A-Za-z0-9_-]{43})$/)?.[1];return token||null;}
export async function executeSystemApi(token:string,resource:string,method='GET',input:unknown={}){const r=await createAdminClient().rpc('erp_system_api',{p_hash:systemApiHash(token),p_resource:resource,p_method:method,p_input:input});if(r.error)return{status:503,error:'service_unavailable',data:null};return r.data as {status:number;error?:string;data:unknown};}
export function systemApiResponse(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(status===401?{'WWW-Authenticate':'Bearer realm="Branda ERP"'}:{}),...(status===429?{'Retry-After':'60'}:{})}});}
