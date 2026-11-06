import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { readMaintenanceSessionCookie } from "@/lib/platform/maintenance";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { marketingConfigured } from "@/lib/marketing/crypto";
import { MarketingError as BrandWhatsAppError, readMarketingConnection, marketingConnectionCredentials, refreshMarketingConnection, runMarketingConnectionAction } from "@/lib/data/marketing";
import { LOCO_CAFE_ID, type BrandWhatsAppDashboard, type BrandWhatsAppResult } from "@/lib/whatsapp/brand-connection-types";
import type { GreenApiMarketingCredentials } from "@/lib/whatsapp/green-api-marketing";

export { BrandWhatsAppError };

const phone = z.string().max(30)
  .transform(value => value.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 0x06f0 : 0x0660))))
  .refine(value => /^[+\d\s()-]+$/.test(value))
  .transform(value => normalizeSaudiPhone(value)).refine((value): value is string => Boolean(value));
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), phone }).strict(),
  z.object({ action: z.enum(["refresh", "qr", "disconnect"]) }).strict(),
]);

/** Active owner only; no subscription entitlement can grant access to another brand. */
async function requireBrandWhatsAppContext() {
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) throw new BrandWhatsAppError("سجل دخولك لربط رقم العلامة التجارية", 401);
  const { data: profile, error: profileError } = await session.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (profileError || profile?.status !== "active") throw new BrandWhatsAppError("هذا الحساب غير مخول لربط رقم العلامة", 403);
  let cafeId: string;
  if (profile.role === "platform_admin") {
    const maintenance = await readMaintenanceSessionCookie();
    if (!maintenance || maintenance.adminUserId !== user.id || maintenance.expiresAt <= Date.now()) throw new BrandWhatsAppError("افتح حساب العلامة المطلوب من إدارة العلامات", 403);
    cafeId = maintenance.cafeId;
  } else {
    try { cafeId = (await requireOwnerCafeContext()).id; }
    catch { throw new BrandWhatsAppError("هذا الحساب غير مخول لربط رقم العلامة", 403); }
  }
  if (cafeId !== LOCO_CAFE_ID) throw new BrandWhatsAppError("ربط رقم العلامة غير متاح لهذا الحساب", 403);
  const db = createAdminClient();
  const { data: cafe, error: cafeError } = await db.from("cafes").select("id,name,owner_user_id,status").eq("id", LOCO_CAFE_ID).is("deleted_at", null).maybeSingle();
  if (cafeError || !cafe || !["active", "published"].includes(cafe.status)) throw new BrandWhatsAppError("العلامة غير متاحة", 403);
  if (profile.role !== "platform_admin" && cafe.owner_user_id !== user.id) {
    const { data: member, error } = await db.from("cafe_members").select("role").eq("cafe_id", LOCO_CAFE_ID).eq("user_id", user.id).maybeSingle();
    if (error || member?.role !== "owner") throw new BrandWhatsAppError("ربط الرقم متاح لمالك العلامة فقط", 403);
  }
  return { db, cafeId: LOCO_CAFE_ID, userId: user.id, brandName: String(cafe.name) };
}

type Context = Awaited<ReturnType<typeof requireBrandWhatsAppContext>>;
async function dashboard(context: Context): Promise<BrandWhatsAppDashboard> {
  const row = await readMarketingConnection(context);
  return {
    brandName: context.brandName,
    configured: marketingConfigured(),
    transactionalEnabled: Boolean(row?.transactional_requested_at) && !["disconnected", "disconnecting"].includes(row!.status),
    connection: row ? {
      status: row.status, phone: row.requested_phone, verifiedPhone: row.verified_phone,
      lastError: row.status === "mismatch" ? "الرقم المربوط مختلف عن الرقم المطلوب افصل الاتصال وأعد المحاولة"
        : row.status === "uncertain" ? "نتحقق من حالة الاتصال قبل السماح بالمحاولة التالية"
          : row.last_error ? "تعذر إكمال الاتصال أعد التحقق من حالته" : null,
    } : null,
  };
}

export async function getBrandWhatsAppDashboard() { return dashboard(await requireBrandWhatsAppContext()); }

export async function runBrandWhatsAppAction(raw: unknown): Promise<BrandWhatsAppResult> {
  const input = actionSchema.safeParse(raw);
  if (!input.success) throw new BrandWhatsAppError("راجع الطلب وأدخل رقم جوال سعودي صحيح");
  const context = await requireBrandWhatsAppContext();
  if (!marketingConfigured()) throw new BrandWhatsAppError("خدمة الربط غير متاحة حاليًا حاول لاحقًا", 503);
  if (input.data.action === "connect") {
    const row = await readMarketingConnection(context);
    if (row?.status === "connected") {
      if (row.requested_phone !== input.data.phone) throw new BrandWhatsAppError("افصل الرقم الحالي قبل ربط رقم آخر", 409);
      const state = await refreshMarketingConnection(context, row);
      if (state !== "authorized") throw new BrandWhatsAppError("تحقق من اتصال الرقم ثم أعد التفعيل", 409);
      const { data, error } = await context.db.rpc("loco_activate_whatsapp_connection", {
        p_cafe: context.cafeId, p_actor: context.userId, p_generation: row.generation, p_phone: input.data.phone, p_instance: row.instance_id,
      });
      if (error || data !== true) throw new BrandWhatsAppError("تعذر تفعيل الرقم تحقق من حالة الاتصال وأعد المحاولة", 409);
      return { dashboard: await dashboard(context) };
    }
  }
  const result = await runMarketingConnectionAction(context, input.data, "loco_claim_whatsapp_connection");
  return { dashboard: await dashboard(context), ...result };
}

/** Internal routing only: the caller supplies a cafe ID derived from a persisted customer operation. */
export async function getLocoCustomerWhatsAppCredentials(cafeId: string | null | undefined): Promise<(GreenApiMarketingCredentials & { expectedPhone: string; generation: string }) | null> {
  if (cafeId !== LOCO_CAFE_ID) return null;
  try {
    const db = createAdminClient();
    const { data: cafe, error } = await db.from("cafes").select("id,status").eq("id", LOCO_CAFE_ID).is("deleted_at", null).maybeSingle();
    if (error || !cafe || !["active", "published"].includes(cafe.status)) return null;
    const row = await readMarketingConnection({ db, cafeId: LOCO_CAFE_ID });
    if (!row?.transactional_requested_at || row.status !== "connected" || !/^9665\d{8}$/.test(row.requested_phone)
      || row.requested_phone !== row.verified_phone || !row.instance_id || !row.encrypted_credentials) return null;
    return { ...marketingConnectionCredentials(row), expectedPhone: row.requested_phone, generation: row.generation };
  } catch { return null; }
}
