import 'server-only';
import {getBrandFinanceContext} from './brand-finance';
import {organizationActionSchema,type OrganizationSnapshot} from '@/lib/erp/organization';
import {z} from 'zod';
function failure(error:{code?:string;message?:string}|null){if(!error)return;if(error.code==='23503')throw new Error('السجل مرتبط بموظفين أو أقسام أخرى ولا يمكن حذفه');if(error.code==='23505')throw new Error('الاسم مستخدم بالفعل');if(error.message&&/[\u0600-\u06ff]/.test(error.message)&&error.message.length<300)throw new Error(error.message);throw new Error('تعذر تأكيد بيانات الهيكل التنظيمي');}
export async function readOrganization(slug?:string){const {client,cafe}=await getBrandFinanceContext(slug);const result=await client.rpc('erp_organization_read',{p_cafe_id:cafe.id});failure(result.error);return {snapshot:result.data as OrganizationSnapshot,slug:cafe.slug};}
export async function writeOrganization(input:unknown,requestId:string,slug:string){const parsed=organizationActionSchema.safeParse(input);if(!parsed.success||!z.uuid().safeParse(requestId).success)throw new Error('راجع الحقول المطلوبة وارتباطاتها');const {client,cafe}=await getBrandFinanceContext(slug);const result=await client.rpc('erp_organization_write',{p_cafe_id:cafe.id,p_action:parsed.data.action,p_data:parsed.data.data,p_request_id:requestId});failure(result.error);return result.data as {id:string};}
