import "server-only";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";
import { adminSubscriptionSummary } from "@/lib/platform/admin-subscription-status";

const brandId = z.string().uuid();
export const subscriptionRevisionSchema = z.string().regex(/^[a-f0-9]{32}$/);
const addPlansSchema = z.object({
  cafeId: brandId,
  planIds: z.array(z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/)).min(1).max(50),
  expectedRevision: subscriptionRevisionSchema,
}).strict();

const nullableDate = z.string().refine(value => Number.isFinite(Date.parse(value))).nullable();
const subscriptionStateSchema = z.object({
  revision: subscriptionRevisionSchema,
  currentPlanIds: z.array(z.string()),
  sharedExpiresAt: nullableDate,
  trialAwaitingDelivery: z.boolean(),
  subscriptions: z.array(z.object({
    id: z.string().uuid(), plan_id: z.string().min(1), status: z.string().min(1),
    activation_source: z.string().nullable(),
    started_at: nullableDate, expires_at: nullableDate,
    created_at: z.string().refine(value => Number.isFinite(Date.parse(value))),
    updated_at: z.string().refine(value => Number.isFinite(Date.parse(value))),
    platform_plans: z.object({ active: z.boolean(), name: z.string().nullable().optional() }).nullable(),
  }).passthrough()),
});

export function subscriptionMutationError(code: string): never {
  const messages: Record<string, string> = {
    brand_subscription_forbidden: "إدارة الباقات متاحة لمدير المنصة فقط",
    brand_subscription_unavailable: "تعذر العثور على اشتراكات العلامة حدّث بياناتها",
    brand_subscription_conflict: "تغيّرت الباقات أو مواعيدها حدّث بيانات الاشتراك ثم حاول مجددًا",
    brand_subscription_invalid_plan: "اختر باقات فعّالة ومتاحة للتفعيل",
    brand_subscription_invalid_deadline: "يجب أن يكون موعد الانتهاء بعد بداية جميع الباقات المرتبطة",
    brand_subscription_prepared_trial: "يبدأ موعد جميع الباقات بعد إرسال تفاصيل الدخول",
  };
  throw new Error(messages[code] ?? "تعذر حفظ الباقات حدّث بيانات الاشتراك للتحقق ثم حاول مجددًا");
}

export function summaryFromSubscriptionState(value: unknown) {
  const result = subscriptionStateSchema.safeParse(value);
  if (!result.success) {
    throw new Error("تعذر قراءة بيانات الاشتراك حدّث الصفحة وحاول مجددًا");
  }
  const state = result.data;
  return {
    ...adminSubscriptionSummary(state.subscriptions),
    subscriptionRevision: state.revision,
    subscriptionsCount: state.subscriptions.length,
    renewalsCount: state.subscriptions.filter(row => String(row.activation_source ?? "").includes("renew")).length,
  };
}

export async function getAdminBrandSubscriptionStates(cafeIds: string[]) {
  await requirePlatformAdmin();
  const ids = [...new Set(z.array(brandId).parse(cafeIds))];
  const client = await createClient();
  const states = new Map<string, ReturnType<typeof summaryFromSubscriptionState>>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const { data, error } = await client.rpc("admin_brand_subscription_states", { p_cafe_ids: batch });
    if (error) subscriptionMutationError(error.message);
    for (const id of batch) states.set(id, summaryFromSubscriptionState(data?.[id]));
  }
  return states;
}

export async function getAdminBrandSubscriptionSummary(cafeId: string) {
  await requirePlatformAdmin();
  const client = await createClient();
  const { data, error } = await client.rpc("admin_brand_subscription_state", { p_cafe_id: brandId.parse(cafeId) });
  if (error) subscriptionMutationError(error.message);
  return summaryFromSubscriptionState(data);
}

export async function addAdminBrandPlans(input: unknown) {
  await requirePlatformAdmin();
  const parsed = addPlansSchema.safeParse(input);
  if (!parsed.success) throw new Error("اختر الباقات وحدّث بيانات الاشتراك ثم حاول مجددًا");
  const client = await createClient();
  const { data, error } = await client.rpc("admin_add_brand_plans", {
    p_cafe_id: parsed.data.cafeId,
    p_plan_ids: [...new Set(parsed.data.planIds)],
    p_expected_revision: parsed.data.expectedRevision,
  });
  if (error) subscriptionMutationError(error.message);
  return summaryFromSubscriptionState(data);
}
