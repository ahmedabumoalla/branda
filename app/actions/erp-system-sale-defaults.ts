'use server';
import {z} from 'zod';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import {actionResult} from '@/lib/platform/action-result';
export async function getSystemSalePriceSuggestion(slug:string,customerId:string){return actionResult(async()=>{const c=await getBrandFinanceContext(slug);if(customerId){z.uuid().parse(customerId);const r=await c.client.rpc('erp_customer_default_price_list',{p_cafe:c.cafe.id,p_customer:customerId});if(r.error)throw new Error('تعذر قراءة مجموعة العميل');if(r.data)return{id:r.data as string,source:'customer' as const};}const r=await c.client.rpc('erp_system_appearance',{p_cafe:c.cafe.id});if(r.error?.code==='PGRST202')return null;if(r.error)throw new Error('تعذر قراءة قائمة الأسعار الافتراضية');return r.data?.general?.defaultPriceListId?{id:r.data.general.defaultPriceListId as string,source:'system' as const}:null;},'تعذر قراءة قائمة الأسعار المقترحة');}
