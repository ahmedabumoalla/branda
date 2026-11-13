import 'server-only';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import type {InsuranceSnapshot} from '@/lib/erp/insurance';
export function insuranceError(e:{code?:string;message?:string}|null){if(!e)return;if(e.code==='42501')throw new Error('لا تملك صلاحية إدارة التأمين');if(e.code==='40001')throw new Error('تغيرت البيانات أعد تحميل الصفحة قبل الحفظ');if(e.code==='23503')throw new Error('السجل مرتبط بعميل أو مستند ولا يمكن حذفه');if(e.code==='23505')throw new Error('الاسم أو الربط مستخدم بالفعل');if(/[\u0600-\u06ff]/.test(e.message??''))throw new Error(e.message);throw new Error('تعذر تأكيد عملية التأمين');}
export async function readErpInsurance(slug?:string):Promise<InsuranceSnapshot>{const c=await getBrandFinanceContext(slug),r=await c.client.rpc('erp_insurance_read',{p_cafe:c.cafe.id});insuranceError(r.error);return{...r.data,slug:c.cafe.slug,brand:c.cafe.name};}
