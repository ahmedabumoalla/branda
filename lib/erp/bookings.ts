import { z } from "zod";

export const bookingStatuses = { scheduled: "مجدول", confirmed: "مؤكد", arrived: "حضر العميل", in_progress: "قيد التنفيذ", completed: "مكتمل", cancelled: "ملغى", no_show: "لم يحضر" } as const;
export type BookingStatus = keyof typeof bookingStatuses;
export const bookingTransitions: Record<BookingStatus, BookingStatus[]> = { scheduled: ["confirmed", "arrived", "cancelled", "no_show"], confirmed: ["arrived", "cancelled", "no_show"], arrived: ["in_progress", "cancelled"], in_progress: ["completed"], completed: [], cancelled: [], no_show: [] };
const id = z.uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const revision = z.number().int().nonnegative();
const edit = { id: id.optional(), revision: revision.optional() };
export const bookingSettingsSchema = z.object({ revision, assignment_mode: z.enum(["booking", "service", "none"]), service_mode: z.enum(["multiple", "single", "default"]), allow_unassigned: z.boolean(), allow_unscheduled: z.boolean(), default_service_id: id.nullable(), timezone: z.string().max(100), slot_minutes: z.union([z.literal(5),z.literal(10),z.literal(15),z.literal(20),z.literal(30),z.literal(60)]) });
export type BookingSettings = z.infer<typeof bookingSettingsSchema>;
export const bookingServiceSchema = z.object({ ...edit, name: z.string().trim().min(1).max(150), category: z.string().trim().max(100), duration: z.number().int().min(5).max(1440), price: z.number().finite().min(0).max(1000000000), tax_rate: z.number().finite().min(0).max(100), staff_ids: z.array(id).max(1000), active: z.boolean(), image_path:z.string().max(100).nullable().optional() });
export const bookingPackageSchema = z.object({ ...edit, name: z.string().trim().min(1).max(150), service_ids: z.array(id).min(1).max(30), active: z.boolean() });
export const bookingAvailabilitySchema = z.object({ ...edit, staff_id: id, branch_id: id.nullable(), weekday: z.number().int().min(0).max(6).nullable(), on_date: date.nullable(), starts: time, ends: time, closed: z.boolean() }).refine(x => (x.weekday === null) !== (x.on_date === null), "اختر يوم الأسبوع أو تاريخ الاستثناء");
export const bookingInputSchema = z.object({ ...edit, customer_id: id, branch_id: id.nullable(), note: z.string().max(2000), repeat_count: z.number().int().min(1).max(52), repeat_days: z.number().int().min(1).max(365), skip_dates: z.array(date).max(52), lines: z.array(z.object({ service_id: id, staff_id: id.nullable(), starts_at: z.iso.datetime({ offset: true }).nullable() })).min(1).max(30) });
export const bookingStatusSchema = z.object({ id, revision, status: z.enum(["scheduled","confirmed","arrived","in_progress","completed","cancelled","no_show"]), reason: z.string().max(1000).optional() });
export const bookingCommandSchema = z.discriminatedUnion("action", [
 z.object({ action: z.literal("save"), payload: bookingInputSchema }), z.object({ action: z.literal("status"), payload: bookingStatusSchema }), z.object({ action: z.literal("invoice"), payload: z.object({id,revision}) }),
 z.object({ action: z.literal("settings"), payload: bookingSettingsSchema }), z.object({ action: z.literal("service"), payload: bookingServiceSchema }),
 z.object({ action: z.literal("package"), payload: bookingPackageSchema }), z.object({ action: z.literal("availability"), payload: bookingAvailabilitySchema }),
 z.object({ action: z.literal("availability_delete"), payload: bookingAvailabilitySchema }),
]);
export type BookingCommand = z.infer<typeof bookingCommandSchema>;
export type BookingInput = z.infer<typeof bookingInputSchema>;
export type BookingService = z.infer<typeof bookingServiceSchema> & { id: string; revision: number; image_url?:string };
export type BookingPackage = z.infer<typeof bookingPackageSchema> & { id: string; revision: number };
export type BookingAvailability = z.infer<typeof bookingAvailabilitySchema> & { id: string; revision: number };
export type BookingLine = { service_name:string; id: string; service_id: string; staff_id: string | null; starts_at: string | null; ends_at: string | null; position: number; duration: number; price: number; tax_rate: number };
export type BookingRecord = { invoice_draft_id:string|null; invoice_document_id:string|null; id: string; number: number; customer_id: string; customer_name: string; branch_id: string | null; series_id: string; status: BookingStatus; note: string; revision: number; created_at: string; lines: BookingLine[]; events: { id: string; actor: string; action: string; created_at: string; details: Record<string, unknown> }[] };
export type BookingSnapshot = { canWrite: boolean; settings: BookingSettings; services: BookingService[]; packages: BookingPackage[]; availability: BookingAvailability[]; staff: { id: string; name: string }[]; branches: { id: string; name: string }[]; bookings: BookingRecord[] };
export type BookingCustomer = { id: string; name: string; phone: string };

/** Date input values follow the configured business zone, never the browser's zone. */
export function bookingLocalDate(instant: string | Date, zone: string) {
 const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
 const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? "";
 return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}
/** Resolve wall time and reject nonexistent DST instants rather than silently moving them. */
export function bookingInstant(local: string, zone: string) {
 const target = Date.parse(`${local}:00Z`);
 if (!Number.isFinite(target)) throw new Error("راجع تاريخ الحجز ووقته");
 let candidate = target;
 for (let i=0;i<4;i++) { const displayed = bookingLocalDate(new Date(candidate),zone); const difference = target-Date.parse(`${displayed}:00Z`); if (!difference) return new Date(candidate).toISOString(); candidate += difference; }
 throw new Error("هذا الوقت غير متاح في المنطقة الزمنية المختارة");
}
export function bookingDateAdd(day: string, amount: number) { const value = new Date(`${day}T12:00:00Z`); value.setUTCDate(value.getUTCDate()+amount); return value.toISOString().slice(0,10); }
export function bookingMonthAdd(day:string,amount:number) { const value=new Date(`${day.slice(0,8)}01T12:00:00Z`); value.setUTCMonth(value.getUTCMonth()+amount); return value.toISOString().slice(0,10); }

export function bookingSlotAvailable(availability:BookingAvailability[],staffId:string,date:string,minute:number,duration:number,branchId?:string){
 const branches=branchId===undefined?[...new Set(availability.filter(row=>row.staff_id===staffId).map(row=>row.branch_id??""))]:[branchId];
 return branches.some(branch=>{
 const matching=availability.filter(row=>row.staff_id===staffId&&(!row.branch_id||row.branch_id===branch));
 const exceptions=matching.filter(row=>row.on_date===date);
 const hours=exceptions.length?exceptions:matching.filter(row=>row.weekday===new Date(`${date}T12:00Z`).getUTCDay());
 if(exceptions.some(row=>row.closed))return false;
 const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3,5));
 return hours.some(row=>!row.closed&&minutes(row.starts)<=minute&&minutes(row.ends)>=minute+duration);
 });
}

export function bookingEventLanes<T extends {starts_at:string|null;ends_at:string|null}>(items:T[]){
 const result:{item:T;lane:number;lanes:number}[]=[],group:typeof result=[],ends:number[]=[];
 const flush=()=>{for(const row of group){row.lanes=ends.length;result.push(row)}group.length=0;ends.length=0};
 for(const item of items.filter(row=>row.starts_at&&row.ends_at).sort((a,b)=>Date.parse(a.starts_at!)-Date.parse(b.starts_at!))){
  const start=Date.parse(item.starts_at!),end=Date.parse(item.ends_at!);
  if(ends.length&&ends.every(value=>value<=start))flush();
  let lane=ends.findIndex(value=>value<=start);if(lane<0)lane=ends.length;ends[lane]=end;
  group.push({item,lane,lanes:1});
 }
 flush();return result;
}
