import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { readMaintenanceSessionCookie } from "@/lib/platform/maintenance";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { encryptMarketingSecret, decryptMarketingSecret, hashMarketingToken, marketingConfigured, marketingPublicOrigin } from "@/lib/marketing/crypto";
import { provisionGreenApiMarketingInstance, configureGreenApiMarketingWebhook, getGreenApiMarketingState, getGreenApiMarketingAccount, getGreenApiMarketingQr, deleteGreenApiMarketingInstance, GreenApiProviderError, type GreenApiMarketingCredentials } from "@/lib/whatsapp/green-api-marketing";
import type { MarketingDashboard, MarketingResult, MarketingConnectionStatus, MarketingCampaignSummary } from "@/lib/marketing/types";

export class MarketingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const phone = z.string().max(30).transform(value => value.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 0x06f0 : 0x0660))))
  .refine(value => /^[+\d\s()-]+$/.test(value), "أدخل رقم جوال سعودي صحيح")
  .transform(value => normalizeSaudiPhone(value)).refine((value): value is string => Boolean(value), "أدخل رقم جوال سعودي صحيح");
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), phone }),
  z.object({ action: z.enum(["refresh", "qr", "disconnect"]) }),
  z.object({ action: z.literal("optOut"), phone }),
  z.object({ action: z.literal("cancelCampaign"), campaignId: z.uuid() }),
  z.object({ action: z.literal("createCampaign"), idempotencyKey: z.uuid(), title: z.string().trim().min(1).max(100), body: z.string().trim().min(1).max(3000), recipients: z.array(phone).min(1).max(1000), consent: z.literal(true), scheduledAt: z.iso.datetime({ offset: true }).optional() }),
]);

export async function requireMarketingContext() {
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) throw new MarketingError("سجل دخولك للوصول إلى الحملات", 401);
  const { data: profile, error: profileError } = await session.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (profileError || profile?.status !== "active") throw new MarketingError("هذا الحساب غير مخول لإدارة الحملات", 403);
  let cafeId: string;
  if (profile.role === "platform_admin") {
    const maintenance = await readMaintenanceSessionCookie();
    if (!maintenance || maintenance.adminUserId !== user.id || maintenance.expiresAt <= Date.now()) throw new MarketingError("افتح حساب العلامة المطلوب من إدارة العلامات", 403);
    cafeId = maintenance.cafeId;
  } else cafeId = (await requireOwnerCafeContext()).id;
  const db = createAdminClient();
  const { data: cafe, error: cafeError } = await db.from("cafes").select("id,name,owner_user_id,status").eq("id", cafeId).is("deleted_at", null).maybeSingle();
  if (cafeError || !cafe) throw new MarketingError("العلامة غير متاحة", 403);
  if (profile.role !== "platform_admin" && cafe.owner_user_id !== user.id) {
    const { data: member, error } = await db.from("cafe_members").select("role").eq("cafe_id", cafeId).eq("user_id", user.id).maybeSingle();
    if (error || !member || !["owner", "manager"].includes(member.role)) throw new MarketingError("إدارة الحملات متاحة لمالك العلامة ومديرها", 403);
  }
  const { data: eligible, error } = await db.rpc("marketing_actor_allowed", { p_cafe: cafeId, p_actor: user.id });
  if (error) throw new MarketingError("خدمة الحملات غير متاحة حاليًا حاول لاحقًا", 503);
  return { db, cafeId, userId: user.id, brandName: String(cafe.name), eligible: eligible === true };
}
type Context = Awaited<ReturnType<typeof requireMarketingContext>>;
type Connection = { cafe_id: string; requested_phone: string; verified_phone: string | null; status: MarketingConnectionStatus; instance_id: string | null; encrypted_credentials: string | null; generation: string; lease_token: string | null; lease_until: string | null; allow_create?: boolean; last_error: string | null };
async function connection(context: Context) {
  const { data, error } = await context.db.from("brand_marketing_connections").select("*").eq("cafe_id", context.cafeId).maybeSingle();
  if (error) throw new MarketingError("تعذر تحميل اتصال واتساب", 503);
  return data as Connection | null;
}
function credentials(row: Connection) {
  if (!row.encrypted_credentials || !row.instance_id) throw new MarketingError("أكمل ربط رقم واتساب أولًا", 409);
  return decryptMarketingSecret<GreenApiMarketingCredentials>(row.encrypted_credentials, `${row.cafe_id}:${row.instance_id}`);
}
async function dashboard(context: Context): Promise<MarketingDashboard> {
  const [row, history, suppressions] = await Promise.all([
    connection(context), context.db.rpc("marketing_campaign_history", { p_cafe: context.cafeId }),
    context.db.from("brand_marketing_suppressions").select("phone", { count: "exact", head: true }).eq("cafe_id", context.cafeId),
  ]);
  if (history.error || suppressions.error) throw new MarketingError("تعذر تحميل سجل الحملات", 503);
  return {
    brandName: context.brandName, eligible: context.eligible, configured: marketingConfigured(), optOutCount: suppressions.count ?? 0,
    connection: row ? { status: row.status, phone: row.requested_phone, verifiedPhone: row.verified_phone,
      lastError: row.status === "mismatch" ? "الرقم المربوط مختلف عن الرقم المطلوب افصل الاتصال وأعد المحاولة" : row.status === "uncertain" ? "نتحقق من حالة الاتصال قبل السماح بالمحاولة التالية" : row.last_error ? "تعذر إكمال الاتصال أعد التحقق من حالته" : null } : null,
    campaigns: (history.data ?? []) as MarketingCampaignSummary[],
  };
}
export async function getMarketingDashboard() { return dashboard(await requireMarketingContext()); }

async function refreshConnection(context: Context, row: Connection) {
  if (["disconnected", "disconnecting", "provisioning"].includes(row.status) || !row.encrypted_credentials) return;
  const auth = credentials(row);
  const state = await getGreenApiMarketingState(auth);
  let status: MarketingConnectionStatus = "pairing", verified: string | null = null;
  if (state === "authorized") {
    const account = await getGreenApiMarketingAccount(auth);
    verified = normalizeSaudiPhone(account.phone);
    status = verified === row.requested_phone ? "connected" : "mismatch";
  }
  const { error } = await context.db.from("brand_marketing_connections").update({ status, verified_phone: verified, last_error: null, updated_at: new Date().toISOString() })
    .eq("cafe_id", context.cafeId).eq("generation", row.generation).not("status", "in", "(disconnecting,disconnected,provisioning)");
  if (error) throw new MarketingError("تعذر حفظ حالة الاتصال", 503);
}

export async function runMarketingAction(raw: unknown): Promise<MarketingResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) throw new MarketingError("راجع بيانات الحملة والأرقام وتأكيد موافقة المستلمين");
  const input = parsed.data, context = await requireMarketingContext();
  if (["connect", "createCampaign", "qr"].includes(input.action) && !context.eligible) throw new MarketingError("الحملات غير مشمولة في اشتراك علامتك الحالي", 403);
  if (!["cancelCampaign", "optOut"].includes(input.action) && !marketingConfigured()) throw new MarketingError("خدمة الربط غير متاحة حاليًا حاول لاحقًا", 503);
  let qr: string | undefined, qrStatus: string | undefined;
  if (input.action === "connect") {
    const claim = await context.db.rpc("marketing_claim_connection", { p_cafe: context.cafeId, p_actor: context.userId, p_phone: input.phone });
    if (claim.error || !claim.data) throw new MarketingError("يوجد اتصال أو طلب ربط قيد المعالجة تحقق من حالته أولًا", 409);
    const claimed = claim.data as Connection;
    const webhookToken = randomBytes(32).toString("base64url");
    let provisioned = false;
    try {
      const result = await provisionGreenApiMarketingInstance({ brandId: context.cafeId, webhookUrl: `${marketingPublicOrigin()}/api/marketing/webhook/${context.cafeId}`, webhookToken, allowCreate: claimed.allow_create === true });
      provisioned = true;
      const auth = result.credentials;
      const saved = await context.db.from("brand_marketing_connections").update({ instance_id: auth.idInstance, encrypted_credentials: encryptMarketingSecret(auth, `${context.cafeId}:${auth.idInstance}`), webhook_token_hash: hashMarketingToken(webhookToken), updated_at: new Date().toISOString() })
        .eq("cafe_id", context.cafeId).eq("lease_token", claimed.lease_token).select("cafe_id").maybeSingle();
      if (saved.error || !saved.data) throw new Error("MARKETING_CONNECTION_SAVE_FAILED");
      // Reconciliation also reconfigures the newly rotated token; never do this on ordinary polling.
      if (result.reused) await configureGreenApiMarketingWebhook(auth, { webhookUrl: `${marketingPublicOrigin()}/api/marketing/webhook/${context.cafeId}`, webhookToken });
      const finished = await context.db.from("brand_marketing_connections").update({ status: "pairing", lease_token: null, lease_until: null, last_error: null, updated_at: new Date().toISOString() }).eq("cafe_id", context.cafeId).eq("lease_token", claimed.lease_token);
      if (finished.error) throw new Error("MARKETING_CONNECTION_SAVE_FAILED");
    } catch (error) {
      const rejectedBeforeCreation = !provisioned && claimed.allow_create === true && error instanceof GreenApiProviderError && !error.uncertain;
      await context.db.from("brand_marketing_connections").update({ status: rejectedBeforeCreation ? "error" : "uncertain", ...(rejectedBeforeCreation ? { provision_attempted_at: null } : {}), lease_token: null, lease_until: null, last_error: error instanceof GreenApiProviderError ? error.code : "CONNECTION_UNCERTAIN", updated_at: new Date().toISOString() }).eq("cafe_id", context.cafeId).eq("lease_token", claimed.lease_token);
      throw new MarketingError("تعذر تأكيد الربط الآن أعد التحقق وسنستعيد الاتصال الموجود دون إنشاء اتصال مكرر", 503);
    }
  } else if (input.action === "refresh" || input.action === "qr") {
    const row = await connection(context);
    if (row) {
      await refreshConnection(context, row);
      if (input.action === "qr") {
        const fresh = await connection(context);
        if (!fresh || !["pairing", "error"].includes(fresh.status)) throw new MarketingError("تحقق من حالة الاتصال قبل طلب رمز الربط", 409);
        const result = await getGreenApiMarketingQr(credentials(fresh));
        qrStatus = result.type;
        if (result.type === "qrCode" && /^[A-Za-z0-9+/=\r\n]+$/.test(result.message) && result.message.length < 300_000) qr = result.message;
      }
    }
  } else if (input.action === "disconnect") {
    const row = await connection(context);
    if (row && row.status !== "disconnected") {
      if (row.lease_until && Date.parse(row.lease_until) > Date.now()) throw new MarketingError("انتظر اكتمال طلب الاتصال الحالي", 409);
      if (!row.encrypted_credentials) throw new MarketingError("أعد محاولة الربط لاستعادة الاتصال قبل فصله", 409);
      const locked = await context.db.rpc("marketing_disconnect_connection", { p_cafe: context.cafeId, p_generation: row.generation });
      if (locked.error || !locked.data) throw new MarketingError("يوجد طلب آخر قيد المعالجة", 409);
      const generation = String(locked.data);
      try {
        await deleteGreenApiMarketingInstance(credentials(row));
        const { error } = await context.db.from("brand_marketing_connections").update({ status: "disconnected", encrypted_credentials: null, instance_id: null, verified_phone: null, webhook_token_hash: null, provision_attempted_at: null, lease_token: null, lease_until: null, last_error: null, updated_at: new Date().toISOString() }).eq("cafe_id", context.cafeId).eq("generation", generation);
        if (error) throw new Error("DISCONNECT_SAVE_FAILED");
      } catch {
        await context.db.from("brand_marketing_connections").update({ status: "disconnecting", lease_until: null, last_error: "DISCONNECT_UNCERTAIN" }).eq("cafe_id", context.cafeId).eq("generation", generation);
        throw new MarketingError("تعذر تأكيد الفصل أعد المحاولة لاستكمال إيقاف الاتصال", 503);
      }
    }
  } else if (input.action === "optOut") {
    const { error } = await context.db.rpc("marketing_suppress", { p_cafe: context.cafeId, p_phone: input.phone, p_reason: "manual" });
    if (error) throw new MarketingError("تعذر تسجيل إيقاف الرسائل", 503);
  } else if (input.action === "cancelCampaign") {
    const { error } = await context.db.rpc("marketing_cancel_campaign", { p_cafe: context.cafeId, p_id: input.campaignId });
    if (error) throw new MarketingError("تعذر إلغاء الحملة", 503);
  } else if (input.action === "createCampaign") {
    const scheduled = input.scheduledAt ? Date.parse(input.scheduledAt) : Date.now();
    if (scheduled < Date.now() - 60_000 || scheduled > Date.now() + 90 * 86400_000) throw new MarketingError("اختر موعدًا قادمًا خلال تسعين يومًا");
    const recipients = [...new Set(input.recipients)].sort();
    const hash = createHash("sha256").update(JSON.stringify({ title: input.title, body: input.body, recipients, scheduledAt: input.scheduledAt ?? null })).digest("hex");
    const { error } = await context.db.rpc("marketing_create_campaign", { p_cafe: context.cafeId, p_actor: context.userId, p_key: input.idempotencyKey, p_hash: hash, p_title: input.title, p_body: input.body, p_phones: recipients, p_scheduled: new Date(scheduled).toISOString() });
    if (error) throw new MarketingError("تعذر تجهيز الحملة تحقق من اتصال الرقم وبيانات الطلب", 409);
  }
  return { dashboard: await dashboard(context), ...(qr ? { qr } : {}), ...(qrStatus ? { qrStatus } : {}) };
}
