"use server";
import {branchRpc} from '@/lib/data/erp-branches';
import {branchInput} from '@/lib/erp/branches';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import {customerErpError} from '@/lib/data/erp-customers';
import {readCustomerOptions,readCustomerServices} from '@/lib/data/erp-customer-portal';
import {portalSettingsSchema} from '@/lib/erp/customer-portal';
import {actionResult} from '@/lib/platform/action-result';
export async function getCustomerOptions(slug:string){return actionResult(()=>readCustomerOptions(slug),'تعذر قراءة خيارات العميل');}
export async function getCustomerServices(slug:string,customerId:string){return actionResult(async()=>{if(!z.uuid().safeParse(customerId).success)throw new Error('العميل غير صالح');return readCustomerServices(slug,customerId);},'تعذر قراءة خدمات العميل');}
export async function saveCustomerOption(slug:string,action:string,input:unknown,request:string){return actionResult(async()=>{const identity={customerId:z.uuid(),revision:z.number().int().min(0)},schemas={portal:portalSettingsSchema,link:z.object({...identity,profileId:z.uuid().nullable(),enabled:z.boolean()}).strict(),price_group:z.object({...identity,priceListId:z.uuid().nullable()}).strict()};if(!Object.hasOwn(schemas,action)||!z.uuid().safeParse(request).success)throw new Error('الإجراء غير صالح');const parsed=schemas[action as keyof typeof schemas].safeParse(branchInput(input));if(!parsed.success)throw new Error('راجع خيارات العميل');const c=await getBrandFinanceContext(slug),r=await branchRpc(c.client,c.cafe.id,'erp_customer_options_write',{p_cafe:c.cafe.id,p_action:action,p_input:parsed.data,p_request:request},input);customerErpError(r.error);revalidatePath('/dashboard/system/customers','layout');revalidatePath(`/finance/${slug}/system/customers`,'layout');revalidatePath(`/c/${slug}/portal`);return r.data as {revision:number};},'تعذر حفظ خيارات العميل');}
export async function getCustomerDefaultPriceList(slug:string,customerId:string){return actionResult(async()=>{if(!z.uuid().safeParse(customerId).success)return null;const c=await getBrandFinanceContext(slug),r=await c.client.rpc('erp_customer_default_price_list',{p_cafe:c.cafe.id,p_customer:customerId});customerErpError(r.error);return r.data as string|null;},'تعذر قراءة مجموعة أسعار العميل');}
