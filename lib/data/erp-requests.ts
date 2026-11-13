import 'server-only';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import type {RequestsSnapshot} from '@/lib/erp/requests';
export async function requestsContext(slug?:string){return getBrandFinanceContext(slug);}
export function requestError(e:{code?:string;message?:string}|null){if(!e)return;if(e.code==='40001')throw new Error('تغير السجل أعد تحميله قبل الحفظ');if(e.code==='42501')throw new Error('لا تملك صلاحية الطلب المطلوبة');if(e.code==='23505')throw new Error('اسم النوع أو قيمة الحقل مستخدمة');if(e.code==='23503')throw new Error('النوع مرتبط بطلبات ولا يمكن حذفه');if(e.message&&e.message.length<300&&/[\u0600-\u06ff]/.test(e.message))throw new Error(e.message);throw new Error('تعذر إكمال عملية الطلب');}
export async function readRequests(slug?:string):Promise<RequestsSnapshot>{const c=await requestsContext(slug);const r=await c.client.rpc('erp_requests_read',{p_cafe:c.cafe.id});requestError(r.error);return {...r.data,slug:c.cafe.slug,brand:c.cafe.name};}
