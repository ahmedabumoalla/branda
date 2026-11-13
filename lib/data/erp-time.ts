import {branchFinanceSnapshot} from '@/lib/data/erp-branches';
import 'server-only';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import type {TimeSnapshot} from '@/lib/erp/time';
export async function timeContext(slug?:string){const c=await getBrandFinanceContext(slug);if(!['owner','manager','accountant','auditor'].includes(c.cafe.role))throw new Error('لا تملك صلاحية تتبع الوقت');return c;}
export function timeError(error:{code?:string;message?:string}|null){if(!error)return;if(error.code==='40001')throw new Error('تغير السجل أعد تحميله قبل الحفظ');if(error.code==='42501')throw new Error('صلاحيات تتبع الوقت لا تسمح بهذه العملية');if(error.code==='23503')throw new Error('السجل مرتبط بساعات أو معاملات أخرى');if(error.code==='23505')throw new Error('الاسم أو معدل الساعة أو المؤقت مستخدم مسبقًا');if(error.code==='23P01')throw new Error('توجد ساعات متداخلة للموظف نفسه');if(error.message&&error.message.length<300&&/[\u0600-\u06ff]/.test(error.message))throw new Error(error.message);throw new Error('تعذر تأكيد عملية تتبع الوقت');}
export async function readTime(slug?:string):Promise<TimeSnapshot>{const c=await timeContext(slug);const [r,finance]=await Promise.all([c.client.rpc('erp_time_read',{p_cafe_id:c.cafe.id}),branchFinanceSnapshot(c)]);timeError(r.error);return{...r.data,finance,slug:c.cafe.slug,brand:c.cafe.name} as TimeSnapshot;}
