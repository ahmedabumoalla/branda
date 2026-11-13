import "server-only";
import {z} from "zod";
import {getBrandFinanceContext} from "@/lib/data/brand-finance";
import {attendanceModules,type AttendanceSnapshot} from "@/lib/erp/attendance";
export function attendanceError(error:{code?:string;message?:string}|null){if(!error)return;if(error.code==="40001")throw new Error("تغير السجل أعد تحميل الصفحة");if(error.code==="23505")throw new Error("السجل أو الفترة أو التوقيع موجود بالفعل");if(error.code==="23503")throw new Error("السجل مرتبط بموظف أو حركة أو مرفق ولا يمكن حذفه");if(error.message&&/[\u0600-\u06ff]/u.test(error.message)&&error.message.length<300)throw new Error(error.message);throw new Error("تعذر تأكيد بيانات الحضور");}
export const attendanceQuerySchema=z.object({id:z.uuid().optional(),employeeId:z.uuid().optional(),from:z.iso.date().optional(),to:z.iso.date().optional(),page:z.number().int().min(1).max(100000).default(1),q:z.string().max(150).default(""),status:z.string().max(30).default("")});
export type AttendanceQuery=z.input<typeof attendanceQuerySchema>;
export async function readAttendance(module:string,query:AttendanceQuery={},slug?:string):Promise<AttendanceSnapshot>{const kind=z.enum(attendanceModules).parse(module),filter=attendanceQuerySchema.parse(query);const{client,cafe}=await getBrandFinanceContext(slug);const{data,error}=await client.rpc("erp_attendance_read",{p_cafe:cafe.id,p_module:kind,p_query:filter});attendanceError(error);if(!data?.records)throw new Error("تعذر تحميل الحضور");return{...data,module:kind,slug:cafe.slug,cafeName:cafe.name} as AttendanceSnapshot;}
