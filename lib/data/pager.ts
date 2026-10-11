import "server-only";
import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseServiceRoleKey } from "@/lib/barndaksa/env";
import { requireOwnerCafeContext, requirePlatformAdmin } from "@/lib/data/cafes";
import { requireCashierPermission } from "@/lib/data/cashier";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import type { PagerContext, PagerFeedback, PagerFilter, PagerMessageJob, PagerMode, PagerOrder, PagerPage } from "@/lib/pager/types";

const idSchema = z.string().uuid();
const filterSchema = z.object({ page: z.number().int().min(0).max(100000).default(0),
  status: z.enum(["all", "active", "waiting", "ready", "received", "cancelled"]).default("active"),
  query: z.string().max(120).default("") });
const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
type ActorContext = PagerContext & { actorId: string | null };
function tokenForOrder(id: string) {
  return createHmac("sha256", getSupabaseServiceRoleKey()).update(`branda:pager:feedback:v1:${id}`).digest("hex");
}
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function mapOrder(row: Record<string, unknown>): PagerOrder {
  return { id: String(row.id), cafeId: String(row.cafe_id), invoiceNumber: String(row.invoice_number), phone: String(row.phone),
    status: row.status as PagerOrder["status"], createdAt: String(row.created_at), readyAt: row.ready_at as string | null,
    receivedAt: row.received_at as string | null, createdBy: String(row.created_by), createdStation: String(row.created_station),
    calledBy: row.called_by as string | null, calledStation: row.called_station as string | null,
    rating: row.rating == null ? null : Number(row.rating), notes: String(row.notes ?? ""), ratedAt: row.rated_at as string | null,
    messageStatus: row.message_status as PagerOrder["messageStatus"], lastMessageAt: row.last_message_at as string | null,
    messageCount: Number(row.message_count ?? 0) };
}
async function assertPager(cafeId: string) {
  const [features, live] = await Promise.all([getCafeFeatureCodes(cafeId), createAdminClient().from("cafes").select("status,deleted_at").eq("id",cafeId).maybeSingle()]);
  if (live.error || !live.data || live.data.status !== "active" || live.data.deleted_at || !features.includes("pager")) {
    throw new Error("نظام البيجر غير متاح في الاشتراك الحالي");
  }
}
async function actorContext(mode: PagerMode): Promise<ActorContext> {
  if (mode === "owner") {
    const cafe = await requireOwnerCafeContext();
    if (!["owner", "manager", "platform_admin"].includes(cafe.role)) throw new Error("استخدم حساب الموظف المخول بالاستدعاء");
    await assertPager(cafe.id);
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user) throw new Error("سجل الدخول مجددًا");
    return { cafeId: cafe.id, cafeName: cafe.name, actorName: "إدارة العلامة", station: "الإدارة", kind: "owner", actorId: user.id };
  }
  if (mode !== "staff") throw new Error("طريقة دخول غير صحيحة");
  const session = await requireCashierPermission("pager");
  await assertPager(session.cafeId);
  return { cafeId: session.cafeId, cafeName: session.cafeName, actorName: session.cashierName,
    station: session.pagerStation || "الاستدعاء", kind: "staff", actorId: session.cashierId, canUseLoyalty: session.canUseLoyalty };
}
export async function getOwnerPagerContext(): Promise<PagerContext> {
  const { actorId: _, ...context } = await actorContext("owner"); return context;
}
export async function getStaffPagerContext(): Promise<PagerContext> {
  const { actorId: _, ...context } = await actorContext("staff"); return context;
}
async function pageForCafe(cafeId: string, input: PagerFilter): Promise<PagerPage> {
  const filter = filterSchema.parse(input);
  const db = createAdminClient();
  const { data, error } = await db.rpc("pager_get_page", { p_cafe: cafeId, p_page: filter.page, p_status: filter.status, p_query: filter.query });
  if (error) throw new Error("تعذر تحميل سجل البيجر حاول مجددًا");
  return { ...data, orders: ((data?.orders ?? []) as Record<string, unknown>[]).map(mapOrder) } as PagerPage;
}
export async function getPagerPage(input: PagerFilter = {}, mode: PagerMode = "staff") {
  return pageForCafe((await actorContext(mode)).cafeId, input);
}
export async function getAdminPagerPage(cafeId: string, input: PagerFilter = {}) {
  await requirePlatformAdmin();
  return pageForCafe(idSchema.parse(cafeId), input);
}
export async function createPagerOrder(input: unknown, mode: PagerMode = "staff"): Promise<PagerOrder> {
  const ctx = await actorContext(mode);
  const draft = z.object({ id: idSchema, invoiceNumber: z.string().min(1).max(120).refine(v => v.trim().length > 0), phone: z.string().max(30) }).parse(input);
  const digits = draft.phone.replace(/[٠-٩]/g, c => String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0)-1776));
  const phone = normalizeSaudiPhone(digits);
  if (!phone) throw new Error("أدخل رقم جوال سعودي صحيح");
  const { data, error } = await createAdminClient().rpc("pager_create_order", { p_id: draft.id, p_cafe: ctx.cafeId,
    p_invoice: draft.invoiceNumber, p_phone: phone, p_actor: ctx.actorName, p_station: ctx.station, p_actor_id: ctx.actorId,
    p_feedback_hash: hashToken(tokenForOrder(draft.id)) });
  if (error) {
    if (error.code === "23505") throw new Error("رقم الفاتورة موجود في الطلبات الحالية");
    throw new Error("تعذر حفظ الطلب أعد المحاولة بنفس البيانات");
  }
  return mapOrder(data);
}
export async function transitionPagerOrder(orderId: string, status: "ready" | "received" | "cancelled", mode: PagerMode = "staff") {
  const ctx = await actorContext(mode);
  const { data, error } = await createAdminClient().rpc("pager_transition_order", { p_cafe: ctx.cafeId,
    p_order: idSchema.parse(orderId), p_status: z.enum(["ready","received","cancelled"]).parse(status),
    p_actor: ctx.actorName, p_station: ctx.station, p_actor_id: ctx.actorId });
  if (error) throw new Error("تعذر تغيير الحالة حدّث الطلبات ثم حاول مجددًا");
  return mapOrder(data);
}
export async function getPagerFeedback(token: string): Promise<PagerFeedback | null> {
  if (!tokenSchema.safeParse(token).success) return null;
  const db = createAdminClient();
  const { data, error } = await db.from("pager_orders").select("cafe_id,invoice_number,rating,notes")
    .eq("feedback_hash", hashToken(token)).eq("status","received").maybeSingle();
  if (error) throw new Error("تعذر تحميل التقييم حاول مجددًا");
  if (!data) return null;
  const { data: cafe } = await db.from("cafes").select("name").eq("id",data.cafe_id).maybeSingle();
  return { brandName: String(cafe?.name ?? "برندة"), invoiceNumber: data.invoice_number,
    rating: data.rating, notes: data.notes, submitted: data.rating != null };
}
export async function submitPagerFeedback(token: string, rating: number, notes: string) {
  tokenSchema.parse(token); z.number().int().min(1).max(5).parse(rating); z.string().max(1000).parse(notes);
  const { data, error } = await createAdminClient().rpc("pager_submit_feedback", { p_hash: hashToken(token), p_rating: rating, p_notes: notes });
  if (error || data !== true) throw new Error("تعذر تسجيل التقييم أو سبق إرساله");
  return { ok: true as const };
}
export async function claimPagerMessages(limit = 20): Promise<PagerMessageJob[]> {
  const { data, error } = await createAdminClient().rpc("pager_claim_messages", { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({ id: String(r.id), orderId: String(r.order_id), cafeId: String(r.cafe_id),
    phone: String(r.phone), brandName: String(r.brand_name), invoiceNumber: String(r.invoice_number), kind: r.kind as "ready" | "rating",
    leaseToken: String(r.lease_token), ...(r.kind === "rating" ? { feedbackToken: tokenForOrder(String(r.order_id)) } : {}) }));
}
export async function authorizePagerDispatch(jobId: string, leaseToken: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("pager_authorize_dispatch", { p_job: jobId, p_lease: leaseToken });
  if (error) throw error; return data === true;
}
export async function finishPagerMessage(jobId: string, leaseToken: string, result: { providerId?: string; error?: string }) {
  const { data, error } = await createAdminClient().rpc("pager_finish_message", { p_job: jobId, p_lease: leaseToken,
    p_provider_id: result.providerId ?? null, p_error: result.error ?? null });
  if (error) throw error; return data === true;
}
