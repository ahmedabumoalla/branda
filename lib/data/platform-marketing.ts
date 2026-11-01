import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandaCampaignSender } from "@/lib/whatsapp/green-api-platform-campaigns";

export class PlatformMarketingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function requirePlatformMarketingContext() {
  const session = await createClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) throw new PlatformMarketingError("سجل دخولك لإدارة الحملات", 401);
  const profile = await session.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (profile.error || profile.data?.role !== "platform_admin" || profile.data.status !== "active") throw new PlatformMarketingError("إدارة هذه الحملات متاحة لمدير المنصة فقط", 403);
  return { userId: user.id, db: createAdminClient() };
}

const filters = { brandId: z.uuid().optional(), search: z.string().trim().max(100).default("") };
const audienceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("filtered"), ...filters }).strict(),
  z.object({ mode: z.literal("selected"), phones: z.array(z.string().regex(/^9665\d{8}$/)).min(1).max(10_000), ...filters }).strict(),
]);
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createCampaign"), idempotencyKey: z.uuid(), title: z.string().trim().min(1).max(100), body: z.string().trim().min(1).max(3000), mediaId: z.uuid().optional(), scheduledAt: z.iso.datetime({ offset: true }).optional(), audience: audienceSchema }).strict(),
  z.object({ action: z.literal("cancelCampaign"), campaignId: z.uuid() }).strict(),
]);
const audienceQuery = z.object({ ...filters, page: z.coerce.number().int().min(1).max(100_000).default(1) }).strict();

export async function getPlatformCampaignDashboard() {
  const { db, userId } = await requirePlatformMarketingContext();
  const brands: { id: string; name: string }[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await db.from("cafes").select("id,name").is("deleted_at", null).in("status", ["active", "published"]).order("id").range(offset, offset + 499);
    if (result.error) throw new PlatformMarketingError("تعذر تحميل العلامات التجارية", 503);
    brands.push(...result.data);
    if (result.data.length < 500) break;
  }
  const [sender, history] = await Promise.all([getBrandaCampaignSender(), db.rpc("platform_marketing_history", { p_actor: userId })]);
  if (history.error) throw new PlatformMarketingError("تعذر تحميل سجل الحملات", 503);
  return { sender, brands: brands.sort((a, b) => a.name.localeCompare(b.name, "ar")), campaigns: history.data ?? [] };
}

export async function getPlatformCampaignAudience(raw: unknown) {
  const context = await requirePlatformMarketingContext();
  const parsed = audienceQuery.safeParse(raw);
  if (!parsed.success) throw new PlatformMarketingError("راجع العلامة والبحث ورقم الصفحة");
  const { brandId, search, page } = parsed.data;
  const result = await context.db.rpc("platform_marketing_audience", { p_actor: context.userId, p_cafe: brandId ?? null, p_search: search, p_page: page });
  if (result.error) throw new PlatformMarketingError("تعذر تحميل العملاء حاول مجددًا", 503);
  return result.data;
}

export async function runPlatformCampaignAction(raw: unknown) {
  const context = await requirePlatformMarketingContext();
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) throw new PlatformMarketingError("راجع عنوان الحملة والنص والعملاء المختارين");
  const input = parsed.data;
  if (input.action === "cancelCampaign") {
    const result = await context.db.rpc("platform_marketing_cancel", { p_actor: context.userId, p_campaign: input.campaignId });
    if (result.error) throw new PlatformMarketingError("تعذر إيقاف الحملة حاول مجددًا", 409);
    return { cancelled: true };
  }
  if (input.mediaId && input.body.length > 1024) throw new PlatformMarketingError("نص الرسالة مع الصورة أو الفيديو يجب ألا يتجاوز ١٠٢٤ حرفًا");
  // Reconcile a lost response even if the sender disconnected after creation.
  const existing = await context.db.from("platform_marketing_campaigns").select("id").eq("created_by", context.userId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (existing.error) throw new PlatformMarketingError("تعذر التحقق من حالة الطلب أعد المحاولة", 503);
  if (!existing.data && !(await getBrandaCampaignSender()).ready) throw new PlatformMarketingError("رقم واتساب برندة غير متصل أعد ربطه قبل إطلاق الحملة", 409);
  const result = await context.db.rpc("platform_marketing_create_campaign", {
    p_actor: context.userId, p_key: input.idempotencyKey, p_title: input.title, p_body: input.body, p_media: input.mediaId ?? null,
    p_cafe: input.audience.brandId ?? null, p_search: input.audience.search, p_phones: input.audience.mode === "selected" ? [...new Set(input.audience.phones)].sort() : null, p_scheduled_at: input.scheduledAt ?? null,
  });
  if (result.error) {
    const code = String(result.error.message ?? "").toUpperCase();
    const message = /IDEMPOTENCY|REQUEST_MISMATCH/.test(code) ? "تغيرت بيانات الطلب السابق حدّث الصفحة قبل إنشاء حملة جديدة" : /MEDIA/.test(code) ? "المرفق غير جاهز أعد رفعه قبل إطلاق الحملة" : /SCHEDULE|DATE/.test(code) ? "حدد موعدًا لاحقًا خلال السنة القادمة" : /AUDIENCE|RECIPIENT|PHONE|EMPTY/.test(code) ? "تغيرت قائمة العملاء أو لا يوجد عملاء متاحون حدّث الاختيار" : "تعذر تأكيد إنشاء الحملة أعد المحاولة بنفس الطلب";
    throw new PlatformMarketingError(message, /IDEMPOTENCY|REQUEST_MISMATCH|MEDIA|SCHEDULE|DATE|AUDIENCE|RECIPIENT|PHONE|EMPTY/.test(code) ? 409 : 503);
  }
  return result.data as { campaignId: string; total: number };
}
