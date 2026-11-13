import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {openSystemSecrets} from './settings-secrets';
import {sendSystemProvider,type ProviderOutcome} from './settings-providers';
/** Called only with a server-claimed delivery lease; never an arbitrary browser recipient. */
export async function sendSavedSystemTemplate(input:{cafeId:string;id:string;channel:string;recipient:string;subject:string;html:string;text:string;cc:string[];bcc:string[]}):Promise<ProviderOutcome|null>{
 const active=await createAdminClient().rpc('brand_account_not_cancelled',{p_cafe_id:input.cafeId});
 if(active.error||active.data!==true)return{status:'blocked',message:'الإرسال غير متاح لهذه العلامة'};
 const r=await createAdminClient().rpc('erp_system_delivery_connection',{p_cafe:input.cafeId,p_channel:input.channel});
 if(r.error){if(r.error.code==='PGRST202')return null;return{status:'blocked',message:'تعذر التحقق من إعدادات اتصال العلامة'};}if(!r.data)return null;
 const row=r.data;if(input.channel==='whatsapp'&&row.provider!=='whatsapp'||input.channel==='sms'&&row.provider==='whatsapp')return{status:'blocked',message:'الاتصال المحفوظ لا يدعم قناة هذه الرسالة'};
 try{return await sendSystemProvider({...row,secrets:openSystemSecrets(row.ciphertext,input.cafeId,row.id)},input);}catch{return{status:'blocked',message:'تعذر قراءة بيانات الاتصال المحمية'};}
}
