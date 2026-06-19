import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { makeMaintenanceAccountNumber } from "@/lib/platform/maintenance";
import type {
  PlatformCafe,
  PlatformCustomer,
  PlatformOperation,
  PlatformPlan,
  PlanDurationUnit,
} from "@/lib/platform/admin-data";
import type { SubscriptionPaymentRequest } from "@/lib/platform/subscription";
import { BUSINESS_CATEGORIES } from "@/lib/platform/business-categories";


function normalizeCafeStatus(status: unknown): PlatformCafe["status"] {
  return String(status) === "active" ? "نشط" : "موقوف";
}

function daysUntil(value: unknown): number | null {
  if (!value) return null;
  const target = new Date(String(value)).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.max(0, Math.ceil((target - Date.now()) / 86400000));
}

function categoryLabel(category: unknown) {
  const id = String(category ?? "cafes_coffee");
  return BUSINESS_CATEGORIES.find((item) => item.id === id)?.label ?? id;
}

async function safeCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  cafeId: string,
  extra?: (query: any) => any
) {
  try {
    let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("cafe_id", cafeId);
    if (extra) query = extra(query);
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function safeSumOrders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cafeId: string
) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("total,total_amount,final_price")
      .eq("cafe_id", cafeId);
    if (error) return 0;
    return (data ?? []).reduce((sum, row: Record<string, unknown>) => {
      return sum + Number(row.total ?? row.total_amount ?? row.final_price ?? 0);
    }, 0);
  } catch {
    return 0;
  }
}


const planSchema = z.object({
  id: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(80),
  priceMonthly: z.number().nonnegative().max(1000000),
  offerEnabled: z.boolean(),
  offerPrice: z.number().nonnegative().max(1000000).optional(),
  durationUnit: z.enum(["day", "month", "year"]),
  durationCount: z.number().int().positive().max(120),
  description: z.string().trim().max(500),
  active: z.boolean(),
  isDefault: z.boolean(),
  features: z.array(z.string()).max(40),
  categoryId: z.string().trim().max(80).optional(),
  maxOrdersMonthly: z.number().int().nonnegative().nullable().optional(),
  maxProductsMonthly: z.number().int().nonnegative().nullable().optional(),
  maxReservationsMonthly: z.number().int().nonnegative().nullable().optional(),
  maxBranches: z.number().int().nonnegative().nullable().optional(),
  trialDays: z.number().int().nonnegative().max(365).nullable().optional(),
  freeAfterTrial: z.boolean().optional(),
  offerLabel: z.string().trim().max(80).nullable().optional(),
  offerEndsAt: z.string().trim().max(40).nullable().optional(),
  durationOptions: z.array(z.number().int()).max(4).optional(),
});

function mapDbPlan(row: Record<string, unknown>, defaultPlanId?: string): PlatformPlan {
  return {
    id: String(row.id),
    name: String(row.name),
    priceMonthly: Number(row.price_sar ?? 0),
    offerEnabled: Boolean(row.offer_enabled),
    offerPrice: row.offer_price_sar == null ? undefined : Number(row.offer_price_sar),
    offerLabel: row.offer_label ? String(row.offer_label) : null,
    offerEndsAt: row.offer_ends_at ? String(row.offer_ends_at).slice(0, 10) : null,
    durationOptions: Array.isArray(row.duration_options) ? (row.duration_options as number[]).map(Number).filter((item) => [1, 2, 12, 24].includes(item)) : [1, 2, 12, 24],
    durationUnit: String(row.duration_unit ?? "month") as PlanDurationUnit,
    durationCount: Number(row.duration_count ?? 1),
    description: String(row.description ?? ""),
    active: Boolean(row.active),
    isDefault: String(row.id) === defaultPlanId,
    features: Array.isArray(row.features) ? (row.features as PlatformPlan["features"]) : [],
    categoryId: row.category_id ? String(row.category_id) : undefined,
    maxOrdersMonthly: row.max_orders_monthly == null ? null : Number(row.max_orders_monthly),
    maxProductsMonthly: row.max_products_monthly == null ? null : Number(row.max_products_monthly),
    maxReservationsMonthly: row.max_reservations_monthly == null ? null : Number(row.max_reservations_monthly),
    maxBranches: row.max_branches == null ? null : Number(row.max_branches),
    trialDays: row.trial_days == null ? null : Number(row.trial_days),
    freeAfterTrial: Boolean(row.free_after_trial),
  };
}

export async function getPlatformPlans(): Promise<PlatformPlan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_plans")
    .select("*")
    .eq("active", true)
    .order("sort_order");

  if (error) throw error;
  return (data ?? []).map((row) => mapDbPlan(row));
}

export async function getAdminPlatformPlans(): Promise<PlatformPlan[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [{ data: plans, error }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("platform_plans").select("*").order("sort_order"),
    supabase.from("platform_settings").select("default_plan_id").eq("id", "default").single(),
  ]);

  if (error) throw error;
  if (settingsError) throw settingsError;

  return (plans ?? []).map((row) => mapDbPlan(row, String(settings.default_plan_id)));
}

export async function getOwnerActivePlanId(): Promise<string> {
  const { requireOwnerCafeContext } = await import("@/lib/data/cafes");
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan_id")
    .eq("cafe_id", cafe.id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return String(data?.plan_id ?? "");
}

export async function savePlatformPlans(plans: PlatformPlan[]) {
  await requirePlatformAdmin();

  const parsed = z.array(planSchema).min(1).max(30).parse(plans);
  const defaults = parsed.filter((plan) => plan.isDefault && plan.active);
  if (defaults.length !== 1) {
    throw new Error("حدد باقة أساسية مفعلة واحدة فقط");
  }

  const supabase = await createClient();

  for (const plan of parsed) {
    const { error } = await supabase.rpc("admin_save_platform_plan", {
      p_id: plan.id,
      p_name: plan.name,
      p_price_sar: plan.priceMonthly,
      p_offer_enabled: plan.offerEnabled,
      p_offer_price_sar: plan.offerEnabled ? (plan.offerPrice ?? null) : null,
      p_duration_unit: plan.durationUnit,
      p_duration_count: plan.durationCount,
      p_description: plan.description,
      p_features: plan.features,
      p_active: plan.active,
      p_is_default: plan.isDefault,
      p_category_id: plan.categoryId ?? null,
      p_max_orders_monthly: plan.maxOrdersMonthly ?? null,
      p_max_products_monthly: plan.maxProductsMonthly ?? null,
      p_max_reservations_monthly: plan.maxReservationsMonthly ?? null,
      p_max_branches: plan.maxBranches ?? null,
      p_trial_days: plan.trialDays ?? null,
      p_free_after_trial: plan.freeAfterTrial ?? false,
    });

    const admin = createAdminClient();
    const normalizedDurationOptions = Array.from(new Set((plan.durationOptions?.length ? plan.durationOptions : [1, 2, 12, 24]).map(Number))).filter((item) => [1, 2, 12, 24].includes(item));
    const extraPayload = {
      offer_label: plan.offerLabel || null,
      offer_ends_at: plan.offerEndsAt || null,
      duration_options: normalizedDurationOptions.length ? normalizedDurationOptions : [1, 2, 12, 24],
    };

    if (error) {
      const { error: directError } = await admin
        .from("platform_plans")
        .upsert({
          id: plan.id,
          name: plan.name,
          price_sar: plan.priceMonthly,
          offer_enabled: plan.offerEnabled,
          offer_price_sar: plan.offerEnabled ? (plan.offerPrice ?? null) : null,
          duration_unit: plan.durationUnit,
          duration_count: plan.durationCount,
          description: plan.description,
          features: plan.features,
          active: plan.active,
          category_id: plan.categoryId ?? null,
          max_orders_monthly: plan.maxOrdersMonthly ?? null,
          max_products_monthly: plan.maxProductsMonthly ?? null,
          max_reservations_monthly: plan.maxReservationsMonthly ?? null,
          max_branches: plan.maxBranches ?? null,
          trial_days: plan.trialDays ?? null,
          free_after_trial: plan.freeAfterTrial ?? false,
          ...extraPayload,
        }, { onConflict: "id" });
      if (directError) throw directError;
    } else {
      const { error: extraError } = await admin.from("platform_plans").update(extraPayload).eq("id", plan.id);
      if (extraError) throw extraError;
    }
  }
}

function mapRequest(row: Record<string, unknown>): SubscriptionPaymentRequest {
  const cafe = row.cafes as { name?: string } | null;
  const branch = row.branches as { name?: string } | null;
  return {
    id: String(row.id),
    cafeId: String(row.cafe_id),
    cafeName: cafe?.name ?? "",
    planId: String(row.plan_id),
    planName: String(row.plan_name),
    baseAmount: Number(row.base_amount_sar),
    amount: Number(row.amount_sar),
    durationUnit: String(row.duration_unit) as PlanDurationUnit,
    durationCount: Number(row.duration_count),
    paymentMethod: row.payment_method as SubscriptionPaymentRequest["paymentMethod"],
    branchId: row.branch_id ? String(row.branch_id) : undefined,
    branchName: branch?.name,
    receiptStoragePath: row.receipt_storage_path ? String(row.receipt_storage_path) : undefined,
    status: row.status as SubscriptionPaymentRequest["status"],
    createdAt: String(row.created_at),
    adminResponse: row.admin_response ? String(row.admin_response) : undefined,
  };
}

export async function getAdminSubscriptionRequests(): Promise<SubscriptionPaymentRequest[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_payment_requests")
    .select("*, cafes(name), branches(name)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []).map(mapRequest);
}

export async function approveSubscriptionRequest(requestId: string) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_approve_subscription_request", {
    p_request_id: requestId,
  });
  if (error) throw error;
}

export async function rejectSubscriptionRequest(requestId: string, response: string) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reject_subscription_request", {
    p_request_id: requestId,
    p_response: response.trim() || "تم رفض طلب الاشتراك",
  });
  if (error) throw error;
}

export async function getAdminCafes(): Promise<PlatformCafe[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const { data: cafes, error } = await supabase
    .from("cafes")
    .select(`
      *,
      cafe_settings(*),
      subscriptions(*),
      cafe_members(user_id, role, profiles(email, full_name))
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (cafes ?? []) as Record<string, unknown>[];

  return Promise.all(
    rows.map(async (row) => {
      const cafeId = String(row.id);
      const slug = String(row.slug);
      const settings = row.cafe_settings as Record<string, unknown> | null;
      const subscriptions = Array.isArray(row.subscriptions)
        ? (row.subscriptions as Record<string, unknown>[])
        : [];

      const activeSub =
        subscriptions.find((item) => ["active", "trialing"].includes(String(item.status))) ??
        subscriptions[0];

      const ownerMember = Array.isArray(row.cafe_members)
        ? (row.cafe_members as Record<string, unknown>[]).find(
            (item) => String(item.role) === "owner"
          )
        : null;
      const ownerProfile = ownerMember?.profiles as Record<string, unknown> | null | undefined;

      const [
        productsCount,
        offersCount,
        branchesCount,
        customersCount,
        ordersCount,
        reservationsCount,
        reviewsCount,
        experienceSubmissionsCount,
        experienceRewardsCount,
        loyaltyCardsCount,
        supportTicketsCount,
        totalRevenue,
      ] = await Promise.all([
        safeCount(supabase, "menu_products", cafeId, (q) => q.is("deleted_at", null)),
        safeCount(supabase, "offers", cafeId, (q) => q.is("deleted_at", null)),
        safeCount(supabase, "branches", cafeId, (q) => q.is("deleted_at", null)),
        safeCount(supabase, "customer_profiles", cafeId),
        safeCount(supabase, "orders", cafeId),
        safeCount(supabase, "reservations", cafeId),
        safeCount(supabase, "reviews", cafeId),
        safeCount(supabase, "experience_reward_submissions", cafeId),
        safeCount(supabase, "experience_reward_submissions", cafeId, (q) =>
          q.in("status", ["approved", "redeemed"])
        ),
        safeCount(supabase, "loyalty_cards", cafeId),
        safeCount(supabase, "brand_support_tickets", cafeId),
        safeSumOrders(supabase, cafeId),
      ]);

      return {
        id: cafeId,
        slug,
        name: String(row.name ?? ""),
        businessCategory: String(row.business_category ?? "cafes_coffee"),
        businessCategoryLabel: categoryLabel(row.business_category),
        ownerName: String(settings?.owner_name ?? ownerProfile?.full_name ?? ""),
        ownerEmail: String(settings?.owner_email ?? ownerProfile?.email ?? ""),
        ownerPhone: String(settings?.owner_phone ?? ""),
        ownerLoginEmail: String(ownerProfile?.email ?? settings?.owner_email ?? ""),
        passwordAccessNote: "لا يمكن عرض كلمة المرور الأصلية؛ استخدم رابط إعادة التعيين أو تحديثها من لوحة الصيانة الآمنة.",
        maintenanceAccountNumber: makeMaintenanceAccountNumber(cafeId, slug),
        logoUrl: String(settings?.logo_url ?? ""),
        logoAssetId: settings?.logo_storage_path ? String(settings.logo_storage_path) : undefined,
        description: settings?.description ? String(settings.description) : undefined,
        instagram: settings?.instagram ? String(settings.instagram) : undefined,
        whatsapp: settings?.whatsapp ? String(settings.whatsapp) : undefined,
        taxNumber: settings?.tax_number ? String(settings.tax_number) : undefined,
        commercialRegister: settings?.commercial_register ? String(settings.commercial_register) : undefined,
        maroofCertificate: settings?.maroof_certificate ? String(settings.maroof_certificate) : undefined,
        planId: activeSub ? String(activeSub.plan_id ?? "") : "",
        planName: activeSub ? String(activeSub.plan_name_snapshot ?? activeSub.plan_id ?? "") : "",
        planStartedAt: activeSub?.started_at ? String(activeSub.started_at).slice(0, 10) : undefined,
        planExpiresAt: activeSub?.expires_at ? String(activeSub.expires_at).slice(0, 10) : undefined,
        planRemainingDays: daysUntil(activeSub?.expires_at),
        hasActivePlan: Boolean(activeSub && ["active", "trialing"].includes(String(activeSub.status))),
        status: normalizeCafeStatus(row.status),
        totalRevenue,
        totalOrders: ordersCount,
        customersCount,
        productsCount,
        offersCount,
        branchesCount,
        reservationsCount,
        reviewsCount,
        experienceSubmissionsCount,
        experienceRewardsCount,
        loyaltyCardsCount,
        supportTicketsCount,
        subscriptionsCount: subscriptions.length,
        renewalsCount: subscriptions.filter((item) => String(item.activation_source ?? "").includes("renew")).length,
        createdAt: String(row.created_at).slice(0, 10),
        publicUrl: `/c/${slug}`,
        customDomain: settings?.custom_domain as string | undefined,
        customDomainStatus: settings?.domain_status as PlatformCafe["customDomainStatus"],
        purchasedDomain: settings?.purchased_domain as string | undefined,
        purchasedDomainStatus: settings?.purchased_domain_status as PlatformCafe["purchasedDomainStatus"],
        purchasedDomainCreatedAt: settings?.purchased_domain_created_at
          ? String(settings.purchased_domain_created_at).slice(0, 10)
          : undefined,
        purchasedDomainConnectedAt: settings?.purchased_domain_connected_at
          ? String(settings.purchased_domain_connected_at).slice(0, 10)
          : undefined,
      };
    })
  );
}

export async function getAdminCustomers(): Promise<PlatformCustomer[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_profiles")
    .select("*, cafes(name, id)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const cafe = row.cafes as unknown as { name: string; id: string } | null;
    return {
      id: String(row.id),
      fullName: String(row.full_name),
      phone: String(row.phone),
      email: row.email ? String(row.email) : undefined,
      cafeId: cafe?.id ?? "",
      cafeName: cafe?.name ?? "",
      status: "نشط",
      totalSpent: 0,
      loyaltyPoints: 0,
      createdAt: String(row.created_at).slice(0, 10),
    };
  });
}

export async function getAdminOperations(): Promise<PlatformOperation[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const [{ data: orders }, { data: reservations }] = await Promise.all([
    supabase.from("orders").select("id, total, status, customer_name, created_at, cafes(name, id)").order("created_at", { ascending: false }).limit(50),
    supabase.from("reservations").select("id, event_type, status, customer_name, created_at, cafes(name, id)").order("created_at", { ascending: false }).limit(50),
  ]);
  const operations: PlatformOperation[] = [];
  for (const row of orders ?? []) {
    const cafe = row.cafes as unknown as { name: string; id: string };
    operations.push({ id: String(row.id), cafeId: cafe.id, cafeName: cafe.name, customerName: String(row.customer_name), type: "طلب", title: `طلب ${row.id}`, amount: Number(row.total), status: String(row.status), createdAt: String(row.created_at).slice(0, 10) });
  }
  for (const row of reservations ?? []) {
    const cafe = row.cafes as unknown as { name: string; id: string };
    operations.push({ id: String(row.id), cafeId: cafe.id, cafeName: cafe.name, customerName: String(row.customer_name), type: "حجز", title: `حجز ${row.event_type}`, status: String(row.status), createdAt: String(row.created_at).slice(0, 10) });
  }
  return operations.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateCafePlan(cafeId: string, planId: string) {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data: plan, error: planError } = await admin
    .from("platform_plans")
    .select("id, name, price_sar, duration_unit, duration_count")
    .eq("id", planId)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan) throw new Error("الباقة غير موجودة");

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_assign_plan_without_payment", {
    p_cafe_id: cafeId,
    p_plan_id: planId,
  });

  if (error) {
    await admin
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("cafe_id", cafeId)
      .in("status", ["active", "trialing", "past_due"]);

    const { error: insertError } = await admin.from("subscriptions").insert({
      cafe_id: cafeId,
      plan_id: planId,
      status: "active",
      amount_sar: Number(plan.price_sar ?? 0),
      base_amount_sar: Number(plan.price_sar ?? 0),
      discount_amount_sar: 0,
      plan_name_snapshot: String(plan.name ?? planId),
      duration_unit: String(plan.duration_unit ?? "month"),
      duration_count: Number(plan.duration_count ?? 1),
      activation_source: "admin_manual_change",
      payment_provider: "admin",
      payment_method_label: "تغيير يدوي من الأدمن",
      started_at: new Date().toISOString(),
      expires_at: null,
    });
    if (insertError) throw insertError;
  }
}

export async function updateCafeStatus(cafeId: string, active: boolean) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("cafes").update({ status: active ? "active" : "suspended" }).eq("id", cafeId);
  if (error) throw error;
}
