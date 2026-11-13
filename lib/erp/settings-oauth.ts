import 'server-only';
import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
export const oauthScopes=['customers:read','invoices:read','inventory:read','requests:read'] as const;
export const oauthRedirectSchema=z.url().max(2000).refine(s=>{const u=new URL(s);return !u.username&&!u.password&&!u.hash&&(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname));});
export const oauthAuthorizationSchema=z.object({client_id:z.uuid(),redirect_uri:oauthRedirectSchema,response_type:z.literal('code'),code_challenge:z.string().regex(/^[A-Za-z0-9_-]{43}$/),code_challenge_method:z.literal('S256'),scope:z.string().max(300),state:z.string().max(2000),resource:z.string().max(2000).optional()}).strict();
export const oauthHash=(s:string)=>createHash('sha256').update(s).digest('hex');
export const oauthCode=()=>randomBytes(32).toString('base64url');
export const oauthChallenge=(s:string)=>createHash('sha256').update(s).digest('base64url');
export function oauthScopeList(value:string){const scopes=[...new Set(value.split(' ').filter(Boolean))];if(!scopes.length||scopes.some(s=>!oauthScopes.includes(s as typeof oauthScopes[number])))throw new Error('invalid_scope');return scopes;}
export async function boundedRequestText(request:Request,max=16384){if(Number(request.headers.get('content-length')||0)>max)throw new Error('body_too_large');const reader=request.body?.getReader();if(!reader)return '';let bytes=0;const chunks:Uint8Array[]=[];try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>max){await reader.cancel();throw new Error('body_too_large');}chunks.push(r.value);}}finally{reader.releaseLock();}return Buffer.concat(chunks).toString('utf8');}
export function oauthOrigin(request:Request){const origin=new URL(request.url);return process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(origin.hostname)?origin.origin:'https://barndaksa.com';}
export async function readOAuthClient(id:string){const r=await createAdminClient().rpc('erp_system_oauth_client',{p_id:id});if(r.error||!r.data)throw new Error('تطبيق الاتصال غير متاح');return r.data as {id:string;name:string;redirectUris:string[]};}
