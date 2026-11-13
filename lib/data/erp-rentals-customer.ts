import 'server-only';
import {getCustomerProfileForCustomerSession} from '@/lib/data/customers';
import {createAdminClient} from '@/lib/supabase/admin';
import {rentalError} from '@/lib/data/erp-rentals';
export type RentalCustomerSnapshot={units:{id:string;name:string;type:string}[];fields:{key:string;label:string;type:'text'|'number'|'date'|'checkbox';required:boolean}[];reservations:{id:string;number:number;startsAt:string;endsAt:string;total:number;status:string;canCancel:boolean}[]};
export async function rentalCustomerCall(slug:string,action:'read'|'quote'|'book'|'cancel',input:unknown={},request?:string){const profile=await getCustomerProfileForCustomerSession(slug);if(!profile?.cafe_id)throw new Error('سجل الدخول بحساب العميل أولًا');const r=await createAdminClient().rpc('erp_rental_customer',{p_cafe:profile.cafe_id,p_profile:profile.id,p_action:action,p_input:input,p_request:request??null});rentalError(r.error);return r.data;}
