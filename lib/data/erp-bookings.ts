import "server-only";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookingDateAdd, bookingLocalDate, type BookingCustomer, type BookingSnapshot } from "@/lib/erp/bookings";

export async function erpBookingContext(slug?: string, write = false) {
 const context = await getBrandFinanceContext(slug);
 if (!(write ? ["owner","manager"] : ["owner","manager","accountant","auditor"]).includes(context.cafe.role)) throw new Error("لا تملك صلاحية إدارة الحجوزات");
 return context;
}
export function erpBookingError(error: { code?: string; message?: string } | null) {
 if (!error) return;
 if (error.code === "40001") throw new Error("تغيرت البيانات في جلسة أخرى أعد تحميلها قبل الحفظ");
 if (error.code === "23P01") throw new Error("يتداخل الموعد مع حجز آخر للموظف اختر موعدًا متاحًا");
 if (error.code === "42501") throw new Error("لا تملك صلاحية تنفيذ هذه العملية");
 if (error.code === "PGRST202" || error.code === "42883") throw new Error("خدمة الحجوزات لم تُفعّل في قاعدة البيانات بعد");
 if (error.code === "22023" && error.message && /[\u0600-\u06ff]/u.test(error.message)) throw new Error(error.message);
 throw new Error("تعذر تأكيد بيانات الحجز راجع الحقول ثم أعد المحاولة");
}
export async function getErpBookings(slug?: string, from?: string, to?: string) {
 const {client,cafe} = await erpBookingContext(slug);
 const today = bookingLocalDate(new Date(),"Asia/Riyadh").slice(0,10);
 const start = z.iso.date().parse(from ?? bookingDateAdd(today,-7));
 const end = z.iso.date().parse(to ?? bookingDateAdd(today,35));
 const {data,error} = await client.rpc("erp_bookings_read", {p_cafe_id:cafe.id,p_from:start,p_to:end});
 erpBookingError(error);
 const snapshot=data as BookingSnapshot;
 const images=snapshot.services.filter(service=>service.image_path?.startsWith(cafe.id+"/"));
 if(images.length){const storage=createAdminClient().storage.from("erp-booking-images");await Promise.all(images.map(async service=>{const {data:signed}=await storage.createSignedUrl(service.image_path!,3600);if(signed)service.image_url=signed.signedUrl}));}
 return {snapshot,slug:cafe.slug,from:start,to:end};
}
export async function findErpBookingCustomers(slug: string, query: string, offset: number) {
 const input = z.object({query:z.string().max(100),offset:z.number().int().nonnegative()}).parse({query,offset});
 const {client,cafe}=await erpBookingContext(slug);
 const {data,error}=await client.rpc("erp_booking_customers",{p_cafe_id:cafe.id,p_query:input.query,p_offset:input.offset});
 erpBookingError(error);return data as BookingCustomer[];
}
