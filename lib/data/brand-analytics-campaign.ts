import "server-only";
import { PlatformMarketingError, requirePlatformMarketingContext } from "@/lib/data/platform-marketing";
import { getBrandaCampaignSender } from "@/lib/whatsapp/green-api-platform-campaigns";
import {
  brandAnalyticsCampaignAudienceInputSchema, brandAnalyticsCampaignAudienceSchema,
  brandAnalyticsCampaignInputSchema, brandAnalyticsCampaignCreatedSchema,
  type BrandAnalyticsCampaignAudience, type BrandAnalyticsCampaignErrorCode,
} from "@/lib/analytics/brand-analytics-campaign";

export class BrandAnalyticsCampaignError extends Error {
  constructor(message: string, public code: BrandAnalyticsCampaignErrorCode) { super(message); }
}

async function context() {
  try { return await requirePlatformMarketingContext(); }
  catch (error) {
    if (error instanceof PlatformMarketingError && [401, 403].includes(error.status)) {
      throw new BrandAnalyticsCampaignError("سجل دخولك بحساب مدير المنصة لإدارة هذه الحملات", "unauthorized");
    }
    throw new BrandAnalyticsCampaignError("تعذر التحقق من صلاحية الدخول أعد المحاولة", "unavailable");
  }
}

export async function getBrandAnalyticsCampaignAudience(raw: unknown): Promise<BrandAnalyticsCampaignAudience> {
  const { db, userId } = await context();
  const parsed = brandAnalyticsCampaignAudienceInputSchema.safeParse(raw);
  if (!parsed.success) throw new BrandAnalyticsCampaignError("راجع العلامة وشريحة العملاء ومدة الغياب", "invalid");
  const input = parsed.data;
  const [result, sender] = await Promise.all([
    db.rpc("platform_marketing_analytics_audience", {
      p_actor: userId, p_cafe: input.brandId, p_segment: input.segment, p_inactive_days: input.inactiveDays, p_page: input.page,
    }), getBrandaCampaignSender(),
  ]);
  if (result.error) throw new BrandAnalyticsCampaignError("تعذر تحميل جمهور الحملة تحقق من أن العلامة نشطة ثم أعد المحاولة", "unavailable");
  const data = brandAnalyticsCampaignAudienceSchema.parse(result.data);
  if (data.brandId !== input.brandId || data.segment !== input.segment || data.inactiveDays !== input.inactiveDays || data.page !== input.page) {
    throw new BrandAnalyticsCampaignError("تغيرت بيانات الجمهور أعد تحميل المعاينة", "unavailable");
  }
  return { ...data, sender };
}

export async function createBrandAnalyticsCampaign(raw: unknown) {
  const { db, userId } = await context();
  const parsed = brandAnalyticsCampaignInputSchema.safeParse(raw);
  if (!parsed.success) throw new BrandAnalyticsCampaignError("راجع الرسالة والعنوان وشريحة العملاء وموعد الإرسال", "invalid");
  const input = parsed.data;
  // A previous successful creation must reconcile even after the sender disconnects or the audience changes.
  const existing = await db.from("platform_marketing_campaigns").select("id").eq("created_by", userId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (existing.error) throw new BrandAnalyticsCampaignError("تعذر التحقق من الطلب أعد المحاولة بنفس الرسالة", "uncertain");
  if (!existing.data && !(await getBrandaCampaignSender()).ready) {
    throw new BrandAnalyticsCampaignError("واتساب برندة غير متصل أعد ربط الرقم قبل إطلاق الحملة", "sender_unavailable");
  }
  const result = await db.rpc("platform_marketing_create_analytics_campaign", {
    p_actor: userId, p_key: input.idempotencyKey, p_title: input.title, p_body: input.body,
    p_cafe: input.brandId, p_segment: input.segment, p_inactive_days: input.inactiveDays,
    p_audience_digest: input.audienceDigest, p_scheduled_at: input.scheduledAt ?? null, p_content_kind: input.contentKind,
  });
  if (result.error) {
    const message = String(result.error.message ?? "").toUpperCase();
    if (result.error.code === "42501") throw new BrandAnalyticsCampaignError("لم تعد لديك صلاحية إطلاق الحملة", "unauthorized");
    if (/AUDIENCE|RECIPIENT|EMPTY|DIGEST/.test(message)) {
      throw new BrandAnalyticsCampaignError("تغيرت شريحة العملاء حدّث المعاينة وراجع العدد قبل الإرسال", "audience_changed");
    }
    if (/IDEMPOTENCY|REQUEST_MISMATCH/.test(message)) {
      throw new BrandAnalyticsCampaignError("تغيرت بيانات الطلب السابق راجع سجل الحملات قبل إنشاء طلب آخر", "uncertain");
    }
    if (result.error.code === "22023") throw new BrandAnalyticsCampaignError("راجع بيانات العرض وموعد الإرسال وتأكد من أن العلامة نشطة", "invalid");
    throw new BrandAnalyticsCampaignError("لم نتأكد من إنشاء الحملة أعد المحاولة بنفس الطلب لتجنب التكرار", "uncertain");
  }
  return brandAnalyticsCampaignCreatedSchema.parse(result.data);
}
