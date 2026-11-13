import "server-only";
import {getBrandFinanceContext} from "@/lib/data/brand-finance";
import type {MembershipSnapshot,CustomerAttendanceSnapshot} from "@/lib/erp/memberships";
export function membershipError(e:{code?:string;message?:string}|null){if(!e)return;if(e.code==='42501')throw new Error('لا تملك صلاحية تنفيذ عملية العضوية');if(e.code==='40001')throw new Error('تغيرت البيانات أعد تحميل الصفحة قبل الحفظ');if(e.code==='23503')throw new Error('السجل مرتبط بفاتورة أو حركة ولا يمكن حذفه');if(/[\u0600-\u06ff]/.test(e.message??''))throw new Error(e.message);throw new Error('تعذر تأكيد عملية العضوية');}
export async function readErpMemberships(slug?:string):Promise<MembershipSnapshot>{const c=await getBrandFinanceContext(slug),r=await c.client.rpc('erp_memberships_read',{p_cafe:c.cafe.id});membershipError(r.error);return{...r.data,slug:c.cafe.slug,brand:c.cafe.name};}
export async function readCustomerAttendance(slug?:string):Promise<CustomerAttendanceSnapshot>{const c=await getBrandFinanceContext(slug),r=await c.client.rpc('erp_customer_attendance_read',{p_cafe:c.cafe.id});membershipError(r.error);return{...r.data,slug:c.cafe.slug,brand:c.cafe.name};}
