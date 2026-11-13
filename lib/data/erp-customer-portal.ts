import 'server-only';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import {customerErpError} from '@/lib/data/erp-customers';
import {getCustomerProfileForCustomerSession} from '@/lib/data/customers';
import {getCafeBySlug} from '@/lib/data/cafes';
import {createAdminClient} from '@/lib/supabase/admin';
import type {CustomerOptions,CustomerPortalData,CustomerServices} from '@/lib/erp/customer-portal';
export async function readCustomerOptions(slug?:string):Promise<CustomerOptions>{const c=await getBrandFinanceContext(slug),r=await c.client.rpc('erp_customer_options',{p_cafe:c.cafe.id});customerErpError(r.error);return r.data;}
export async function readCustomerServices(slug:string,customerId:string):Promise<CustomerServices>{const c=await getBrandFinanceContext(slug),r=await c.client.rpc('erp_customer_services',{p_cafe:c.cafe.id,p_customer:customerId});customerErpError(r.error);if(r.data.insurance)r.data.insurance={...r.data.insurance,slug:c.cafe.slug,brand:c.cafe.name};return r.data;}
export async function readVerifiedCustomerPortal(slug:string){const [cafe,profile]=await Promise.all([getCafeBySlug(slug),getCustomerProfileForCustomerSession(slug)]);if(!cafe)return{state:'missing' as const};if(!profile)return{state:'login' as const,brand:cafe.name};if(profile.cafe_id!==cafe.id)return{state:'unavailable' as const,brand:cafe.name};const r=await createAdminClient().rpc('erp_customer_portal_read',{p_cafe:cafe.id,p_profile:profile.id});if(r.error){if(r.error.code==='42501')return{state:'unavailable' as const,brand:cafe.name};throw new Error('تعذر قراءة بوابة العميل');}return{state:'ready' as const,brand:cafe.name,data:r.data as CustomerPortalData};}
