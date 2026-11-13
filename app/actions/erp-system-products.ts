'use server';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {systemSettingsContext,systemSettingsError} from '@/lib/data/erp-settings';
import {systemTaxSchema,systemProductDefaultsSchema,type SystemProductDefaults} from '@/lib/erp/settings-products';
import {actionResult} from '@/lib/platform/action-result';
export async function saveSystemProductConfiguration(slug:string,action:'tax'|'defaults',input:unknown,request:string){return actionResult(async()=>{const data=(action==='tax'?systemTaxSchema:systemProductDefaultsSchema).parse(input),c=await systemSettingsContext(slug),r=await c.client.rpc('erp_system_product_configuration_save',{p_cafe:c.cafe.id,p_action:z.enum(['tax','defaults']).parse(action),p_input:data,p_request:z.uuid().parse(request)});systemSettingsError(r.error);revalidatePath('/dashboard/system/settings/taxes');revalidatePath('/dashboard/system/inventory','layout');revalidatePath(`/finance/${slug}/system/inventory`,'layout');return r.data as SystemProductDefaults;},'راجع إعدادات الضرائب والمنتجات');}
