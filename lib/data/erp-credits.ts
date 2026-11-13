import "server-only";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import type { CreditSnapshot } from "@/lib/erp/credits";
export function creditError(e:{code?:string;message?:string}|null){if(!e)return;if(e.code==="42501")throw new Error("لا تملك صلاحية إدارة الأرصدة");if(e.code==="40001")throw new Error("تغيرت البيانات أعد تحميل الصفحة قبل الحفظ");if(e.code==="23503")throw new Error("السجل مرتبط بحركة أو المرجع غير متاح");if(e.code==="23505")throw new Error("الاسم مستخدم بالفعل");if(/[\u0600-\u06ff]/.test(e.message??""))throw new Error(e.message);throw new Error("تعذر تأكيد عملية الأرصدة");}
export async function readErpCredits(slug?:string):Promise<CreditSnapshot>{const c=await getBrandFinanceContext(slug);const r=await c.client.rpc("erp_credits_read",{p_cafe:c.cafe.id});creditError(r.error);return{...r.data,slug:c.cafe.slug,brand:c.cafe.name};}
