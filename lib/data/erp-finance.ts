import 'server-only';
import {getBrandFinanceContext} from './brand-finance';
import type {ErpFinanceSnapshot} from '@/lib/erp/finance';
export function erpFinanceError(error:{code?:string;message?:string}|null){if(!error)return;if(error.code==='40001')throw new Error('تغيرت البيانات أعد تحميل الصفحة');if(error.code==='23505')throw new Error('الرمز مستخدم أو أن الملف مستورد مسبقًا');if(error.code==='23503')throw new Error('السجل مرتبط بمعاملات أخرى');if(error.message&&/[\u0600-\u06ff]/.test(error.message)&&error.message.length<400)throw new Error(error.message);throw new Error('تعذر تأكيد العملية المالية');}
export async function readErpFinance(query:{offset?:number;kind?:string;id?:string}={},slug?:string):Promise<ErpFinanceSnapshot>{const{client,cafe}=await getBrandFinanceContext(slug);const r=await client.rpc('erp_finance_read',{p_cafe_id:cafe.id,p_query:query});erpFinanceError(r.error);return {...r.data,slug:cafe.slug,brand:cafe.name,role:cafe.role};}
