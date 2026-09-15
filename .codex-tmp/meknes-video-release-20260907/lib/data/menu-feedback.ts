import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { isGreenApiConfigured, sendGreenApiMenuFeedback } from "@/lib/whatsapp/green-api";
import { STANDALONE_MENU_FEATURE } from "@/lib/menu/standalone-menu";

export const feedbackSchema = z.object({
  requestId: z.uuid(), rating: z.number().int().min(1).max(5),
  notes: z.string().trim().max(1500), website: z.literal(""),
}).strict();

type Feedback = z.infer<typeof feedbackSchema>;
export class FeedbackError extends Error {
  constructor(public status: number, public publicMessage: string) { super(publicMessage); }
}

/** Deterministic UUIDs make DB primary-key constraints distributed atomic locks */
function eventId(value: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("FEEDBACK_STORAGE_NOT_CONFIGURED");
  const hex = createHmac("sha256", secret).update(`menu-feedback:${value}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function submitMenuFeedback(slug: string, input: Feedback, clientAddress: string) {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
    throw new FeedbackError(400, "راجع بيانات التقييم وحاول مرة أخرى");
  }
  const admin = createAdminClient();
  const { data: cafe, error } = await admin.from("cafes").select("id,name").eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (!cafe) throw new FeedbackError(404, "المنيو غير متاح");
  const publication = await admin.from("brand_feature_overrides").select("enabled").eq("cafe_id", cafe.id).eq("feature_id", STANDALONE_MENU_FEATURE).maybeSingle();
  if (publication.error) throw publication.error;
  if (publication.data?.enabled !== true) throw new FeedbackError(404, "المنيو غير متاح");
  const settings = await admin.from("cafe_settings").select("whatsapp").eq("cafe_id", cafe.id).maybeSingle();
  if (settings.error) throw settings.error;
  const recipient = normalizeSaudiPhone(settings.data?.whatsapp ?? "");
  if (!recipient || !isGreenApiConfigured()) throw new FeedbackError(503, "استقبال التقييمات غير متاح مؤقتًا");

  const id = eventId(`${cafe.id}:request:${input.requestId}`);
  const existing = await admin.from("cafe_operation_events").select("metadata").eq("id", id).eq("cafe_id", cafe.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.metadata?.rating !== parsed.data.rating || existing.data.metadata?.notes !== parsed.data.notes) {
      throw new FeedbackError(409, "سبق استخدام معرف التقييم لبيانات مختلفة");
    }
    if (existing.data.metadata?.status === "queued") return { status: "queued" as const };
    throw new FeedbackError(409, "سبق استلام هذا التقييم ولا يمكن تأكيد حالة الإرسال الآن");
  }
  const now = Date.now();
  // Address-based throttle is supplemental; the brand-wide lock cannot be bypassed by spoofed headers
  // Brand lock comes first so rotating spoofed addresses cannot create unbounded guard rows
  for (const key of [`brand:${Math.floor(now / 15_000)}`, `visitor:${clientAddress.slice(0, 256)}:${Math.floor(now / 300_000)}`]) {
    const lock = await admin.from("cafe_operation_events").insert({
      id: eventId(`${cafe.id}:${key}`), cafe_id: cafe.id,
      event_type: "menu_feedback_rate_limit", actor_type: "anonymous", metadata: {},
    });
    if (lock.error?.code === "23505") throw new FeedbackError(429, "انتظر قليلًا قبل إرسال تقييم آخر");
    if (lock.error) throw lock.error;
  }
  const metadata = { rating: parsed.data.rating, notes: parsed.data.notes, status: "sending" };
  const saved = await admin.from("cafe_operation_events").insert({ id, cafe_id: cafe.id, event_type: "menu_feedback", actor_type: "anonymous", metadata });
  if (saved.error?.code === "23505") throw new FeedbackError(409, "تقييمك قيد المعالجة");
  if (saved.error) throw saved.error; // Never send unless the idempotency record is persisted
  try {
    const result = await sendGreenApiMenuFeedback({ recipient, brandName: cafe.name, rating: parsed.data.rating, notes: parsed.data.notes });
    const updated = await admin.from("cafe_operation_events").update({ metadata: { ...metadata, status: "queued", providerMessageId: result.providerMessageId } }).eq("id", id).eq("cafe_id", cafe.id);
    if (updated.error) throw updated.error;
    return { status: "queued" as const };
  } catch {
    // A timeout may happen after provider acceptance; never automatically resend
    await admin.from("cafe_operation_events").update({ metadata: { ...metadata, status: "uncertain" } }).eq("id", id).eq("cafe_id", cafe.id);
    throw new FeedbackError(502, "حفظنا تقييمك لكن تعذر تأكيد إرساله للواتساب الآن");
  }
}
