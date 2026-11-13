import {branchFinanceSnapshot} from '@/lib/data/erp-branches';
import 'server-only';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import type {PurchaseSnapshot} from '@/lib/erp/purchases';
export async function purchasesContext(slug?:string){const c=await getBrandFinanceContext(slug);if(!['owner','manager','accountant','auditor'].includes(c.cafe.role))throw new Error('لا تملك صلاحية المشتريات');return c;}
export function purchasesError(e:{code?:string;message?:string}|null){if(!e)return;if(e.code==='40001')throw new Error('تغير السجل أعد تحميله قبل الحفظ');if(e.code==='42501')throw new Error('صلاحيات المشتريات لا تسمح بهذه العملية');if(e.code==='23503')throw new Error('السجل مرتبط بمعاملة أخرى');if(e.code==='23505')throw new Error('الرقم أو المرجع مستخدم مسبقًا');if(e.message&&e.message.length<300&&/[\u0600-\u06ff]/.test(e.message))throw new Error(e.message);throw new Error('تعذر إكمال عملية المشتريات');}
export async function readPurchases(slug?:string):Promise<PurchaseSnapshot>{const c=await purchasesContext(slug);const [r,finance]=await Promise.all([c.client.rpc('erp_purchases_read',{p_cafe_id:c.cafe.id}),branchFinanceSnapshot(c)]);purchasesError(r.error);return{...r.data,finance,slug:c.cafe.slug,brand:c.cafe.name} as PurchaseSnapshot;}
