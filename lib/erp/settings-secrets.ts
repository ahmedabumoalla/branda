import 'server-only';
import {createCipheriv,createDecipheriv,createHmac,randomBytes,createHash} from 'node:crypto';
import {getSupabaseServiceRoleKey} from '@/lib/barndaksa/env';
const key=()=>createHmac('sha256',getSupabaseServiceRoleKey()).update('branda:erp-integrations:v1').digest();
export function sealSystemSecrets(value:Record<string,string>,cafeId:string,id:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(`${cafeId}:${id}`));const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),bytes.toString('base64url')].join('.');}
export function openSystemSecrets(value:string,cafeId:string,id:string):Record<string,string>{const [version,iv,tag,data]=value.split('.');if(version!=='v1'||!iv||!tag||!data)throw new Error('INTEGRATION_SECRET_INVALID');const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));decipher.setAAD(Buffer.from(`${cafeId}:${id}`));decipher.setAuthTag(Buffer.from(tag,'base64url'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8'));}
export const systemApiHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function newSystemApiKey(){const token='branda_'+randomBytes(32).toString('base64url');return{token,hash:systemApiHash(token),prefix:token.slice(0,15)};}
