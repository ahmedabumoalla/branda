import 'server-only';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import type {ChequeSnapshot} from '@/lib/erp/cheques';
export async function chequesContext(slug?:string){const c=await getBrandFinanceContext(slug);if(!['owner','manager','accountant','auditor'].includes(c.cafe.role))throw new Error('لا تملك صلاحية دورة الشيكات');return c;}
export function chequeError(e:{code?:string;message?:string}|null){if(!e)return;if(e.code==='40001')throw new Error('تغير السجل أعد تحميله قبل الحفظ');if(e.code==='42501')throw new Error('لا تملك صلاحية الشيكات المطلوبة');if(e.code==='23505')throw new Error('رقم الشيك أو الدفتر مستخدم مسبقًا');if(e.code==='23503')throw new Error('السجل مرتبط بمعاملة أخرى');if(e.message&&e.message.length<300&&/[\u0600-\u06ff]/.test(e.message))throw new Error(e.message);throw new Error('تعذر إكمال عملية الشيكات');}
export async function readCheques(slug?:string):Promise<ChequeSnapshot>{const c=await chequesContext(slug);const r=await c.client.rpc('erp_cheques_read',{p_cafe_id:c.cafe.id});chequeError(r.error);return {...r.data,slug:c.cafe.slug,brand:c.cafe.name} as ChequeSnapshot;}
