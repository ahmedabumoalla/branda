import "server-only";
import { createHash, createHmac } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/supabase/server";
import { getSupabaseServiceRoleKey } from "@/lib/barndaksa/env";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { requireCashierPermission } from "@/lib/data/cashier";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { getLoyaltyBrandAppearance } from "@/lib/data/loyalty-identity";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { bookingStatuses, type SalonBooking, type SalonCommand, type SalonFilter, type SalonMode, type SalonPage, type SalonAnnouncement } from "@/lib/salon/types";

const uuid = z.string().uuid();
const columns = "id,customer_name,phone,status,version,requested_start,scheduled_start,proposed_start,service_snapshot,created_at,called_at,completed_at,rating,review";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function salonPortalToken(id: string) { return createHmac("sha256", getSupabaseServiceRoleKey()).update(`branda:salon:portal:v1:${id}`).digest("hex"); }
function parseToken(token: string) { return z.string().regex(/^[0-9a-f]{64}$/).parse(token); }
function mapBooking(r: Record<string, unknown>): SalonBooking {
  return { id: String(r.id), customerName: String(r.customer_name), phone: String(r.phone), status: r.status as SalonBooking["status"], version: Number(r.version),
    requestedStart: String(r.requested_start), scheduledStart: r.scheduled_start as string | null, proposedStart: r.proposed_start as string | null,
    service: (r.service_snapshot ?? {}) as SalonBooking["service"], createdAt: String(r.created_at), calledAt: r.called_at as string | null, completedAt: r.completed_at as string | null,
    rating: r.rating == null ? null : Number(r.rating), review: String(r.review ?? "") };
}
function rpcError(error: { message: string } | null) {
  if (!error) return;
  if (error.message.includes("RATE_LIMIT")) throw new Error("وصلت للحد المسموح من طلبات الحجز حاول لاحقًا");
  if (error.message.includes("INVALID_TIME")) throw new Error("اختر موعدًا قادمًا خلال الأشهر الستة المقبلة");
  if (error.message.includes("BOOKING_CHANGED")) throw new Error("تغيرت حالة الحجز حدّث الصفحة قبل المحاولة");
  throw new Error("تعذر تنفيذ الطلب تحقق من البيانات وصلاحية الدخول ثم حاول مجددًا");
}
export async function isSalonCafe(cafeId: string) {
  const { data, error } = await createAdminClient().from("cafes").select("business_category").eq("id", cafeId).eq("status", "active").is("deleted_at", null).maybeSingle();
  if (error) throw error;
  return data?.business_category === "hair_salons";
}
/** Public brand presentation; callers establish their owner/staff context before selecting the brand. */
export async function getSalonDisplayIdentity(cafeId: string) {
  const { data, error } = await createAdminClient().from("cafes").select("name,slug").eq("id", cafeId).single();
  if (error || !data) throw new Error("تعذر تحميل هوية الصالون");
  const { colors } = await getLoyaltyBrandAppearance(cafeId, data.slug);
  return { name: String(data.name), slug: String(data.slug), logoUrl: null, cardBackground: colors.background, cardForeground: colors.foreground, cardAccent: colors.accent };
}
async function salonBrand(slug: string) {
  z.string().regex(/^[a-z0-9-]{1,100}$/).parse(slug);
  const { data, error } = await createAdminClient().from("cafes").select("id,name,slug").eq("slug", slug).eq("business_category", "hair_salons").eq("status", "active").is("deleted_at", null).maybeSingle();
  if (error || !data || !(await getCafeFeatureCodes(data.id)).includes("menu")) throw new Error("الحجز غير متاح لهذا الصالون حاليًا");
  return data;
}
async function actor(mode: SalonMode, pager = false) {
  if (mode === "staff") {
    if (!pager) throw new Error("هذه العملية مخصصة لمالك الصالون");
    const staff = await requireCashierPermission("pager");
    if (!await isSalonCafe(staff.cafeId) || !(await getCafeFeatureCodes(staff.cafeId)).includes("pager")) throw new Error("الخدمة غير متاحة");
    return { cafeId: staff.cafeId, actorId: staff.cashierId, kind: "staff" };
  }
  z.literal("owner").parse(mode);
  const cafe = await requireOwnerCafeContext();
  const user = await getSessionUser();
  if (!user || cafe.businessCategory !== "hair_salons" || !await isSalonCafe(cafe.id) || !["owner", "manager", "platform_admin"].includes(cafe.role)
    || !(await getCafeFeatureCodes(cafe.id)).includes(pager ? "pager" : "menu")) throw new Error("الخدمة غير متاحة لهذا الحساب");
  return { cafeId: cafe.id, actorId: user.id, kind: "owner" };
}
export async function createSalonBooking(input: unknown) {
  const draft = z.object({ id: uuid, slug: z.string(), name: z.string().trim().min(2).max(120), phone: z.string().max(30), serviceId: uuid.nullable(), start: z.string().datetime() }).parse(input);
  const brand = await salonBrand(draft.slug);
  const phone = normalizeSaudiPhone(draft.phone.replace(/[٠-٩۰-۹]/g, d => String(d.charCodeAt(0) - (d >= "۰" ? 1776 : 1632))));
  if (!phone) throw new Error("أدخل رقم جوال سعودي صحيح يبدأ بـ 05");
  const h = await headers();
  const address = (h.get("x-vercel-forwarded-for") ?? h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const token = salonPortalToken(draft.id);
  const { error } = await createAdminClient().rpc("salon_create_booking", { p_id: draft.id, p_cafe: brand.id, p_name: draft.name, p_phone: phone, p_service: draft.serviceId, p_start: draft.start,
    p_portal_hash: hash(token), p_client_key: createHmac("sha256", getSupabaseServiceRoleKey()).update(`salon-client:${address}`).digest("hex") });
  rpcError(error);
  return { url: `/salon/booking/${token}` };
}
export async function getSalonPortal(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data, error } = await createAdminClient().from("salon_bookings").select(`${columns},cafe_id`).eq("portal_hash", hash(token)).gte("created_at", new Date(Date.now() - 270 * 86400000).toISOString()).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: brand } = await createAdminClient().from("cafes").select("name,slug,business_category").eq("id", data.cafe_id).is("deleted_at", null).maybeSingle();
  if (!brand || brand.business_category !== "hair_salons") return null;
  const features = await getCafeFeatureCodes(data.cafe_id);
  const { colors } = await getLoyaltyBrandAppearance(data.cafe_id, brand.slug);
  return { booking: mapBooking({ ...data, phone: "" }), brandName: String(brand.name), slug: String(brand.slug), loyaltyEnabled: features.includes("loyalty"), colors };
}
export async function respondSalonBooking(token: string, version: number, accept: boolean) {
  parseToken(token); z.number().int().min(0).parse(version); z.boolean().parse(accept);
  const portal = await getSalonPortal(token);
  if (!portal) throw new Error("رابط الحجز غير متاح");
  const { error } = await createAdminClient().rpc("salon_customer_booking_response", { p_id: portal.booking.id, p_hash: hash(token), p_version: version, p_accept: accept });
  rpcError(error);
}
export async function reviewSalonBooking(token: string, rating: number, review: string) {
  parseToken(token); z.number().int().min(1).max(5).parse(rating); z.string().max(1000).parse(review);
  const portal = await getSalonPortal(token);
  if (!portal) throw new Error("رابط التقييم غير متاح");
  const { data, error } = await createAdminClient().rpc("salon_submit_review", { p_id: portal.booking.id, p_hash: hash(token), p_rating: rating, p_review: review });
  rpcError(error);
  if (!data) throw new Error("تم تسجيل تقييمك مسبقًا");
}
export async function getSalonBookings(input: SalonFilter = {}, mode: SalonMode = "owner", pager = false): Promise<SalonPage> {
  const ctx = await actor(mode, pager);
  const filter = z.object({ status: z.enum(["all", "active", "reviews", ...bookingStatuses]).default("all"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), page: z.number().int().min(0).max(100000).default(0), booking: uuid.optional() }).parse(input);
  if (mode === "staff" && (filter.status !== "active" || filter.booking)) throw new Error("الكاشير يعرض المواعيد المؤكدة والاستدعاء فقط");
  let query = createAdminClient().from("salon_bookings").select(columns, { count: "exact" }).eq("cafe_id", ctx.cafeId);
  if (filter.status === "active") query = query.in("status", ["confirmed", "in_service"]);
  else if (filter.status === "reviews") query = query.not("rating", "is", null);
  else if (filter.status !== "all") query = query.eq("status", filter.status);
  if (filter.booking) query = query.eq("id", filter.booking);
  if (filter.date) {
    const start = new Date(`${filter.date}T00:00:00+03:00`);
    if (!Number.isFinite(start.getTime())) throw new Error("التاريخ غير صحيح");
    const end = new Date(start.getTime() + 86400000).toISOString();
    query = query.or(`and(scheduled_start.gte.${start.toISOString()},scheduled_start.lt.${end}),and(scheduled_start.is.null,requested_start.gte.${start.toISOString()},requested_start.lt.${end})`);
  }
  query = filter.status === "active" || filter.status === "confirmed" ? query.order("scheduled_start") : query.order("created_at", { ascending: false });
  const { data, error, count } = await query.order("id").range(filter.page * 30, filter.page * 30 + 29);
  if (error) throw new Error("تعذر تحميل الحجوزات حاول مجددًا");
  return { bookings: (data ?? []).map(row => mapBooking(mode === "staff" ? { ...row, phone: "", rating: null, review: "" } : row)), total: count ?? 0, page: filter.page };
}
export async function commandSalonBooking(id: string, version: number, action: SalonCommand, start: string | null, mode: SalonMode) {
  uuid.parse(id); z.number().int().min(0).parse(version); z.enum(["confirm", "reject", "propose", "call", "complete"]).parse(action);
  if (start !== null) z.string().datetime().parse(start);
  const ctx = await actor(mode, action === "call" || action === "complete");
  const { error } = await createAdminClient().rpc("salon_owner_booking_command", { p_cafe: ctx.cafeId, p_id: id, p_actor: ctx.actorId, p_actor_kind: ctx.kind, p_action: action, p_version: version, p_start: start });
  rpcError(error);
}
export async function getSalonAnnouncements(slug?: string): Promise<SalonAnnouncement[]> {
  const cafeId = slug ? (await salonBrand(slug)).id : (await actor("owner")).cafeId;
  if (!(await getCafeFeatureCodes(cafeId)).includes("offers")) return [];
  let query = createAdminClient().from("salon_announcements").select("id,title,description,active,service_id").eq("cafe_id", cafeId).order("created_at", { ascending: false }).limit(100);
  if (slug) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error("تعذر تحميل إعلانات الصالون");
  return data ?? [];
}
export async function saveSalonAnnouncement(input: unknown) {
  const draft = z.object({ id: uuid, title: z.string().trim().min(2).max(120), description: z.string().trim().max(1200), active: z.boolean(), service_id: uuid.nullable() }).parse(input);
  const ctx = await actor("owner");
  const { error } = await createAdminClient().rpc("salon_save_announcement", { p_cafe: ctx.cafeId, p_actor: ctx.actorId, p_id: draft.id, p_title: draft.title, p_description: draft.description, p_service: draft.service_id, p_active: draft.active });
  rpcError(error);
}
