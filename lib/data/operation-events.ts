import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const operationEventTypes = {
  appInstallClicked: "app_install_clicked",
  brandLogin: "brand_login",
  cashierLogin: "cashier_login",
  loyaltyScan: "loyalty_scan",
  rewardRedeemed: "reward_redeemed",
  orderAccepted: "order_accepted",
  orderRejected: "order_rejected",
  orderCompleted: "order_completed",
  orderNotCompleted: "order_not_completed",
  reservationAccepted: "reservation_accepted",
  reservationRejected: "reservation_rejected",
  reservationModificationRequested: "reservation_modification_requested",
} as const;

export type OperationEventType = (typeof operationEventTypes)[keyof typeof operationEventTypes];

type OperationEventInput = {
  cafeId: string;
  eventType: OperationEventType;
  actorType: "customer" | "cashier" | "brand_user" | "platform_admin" | "system";
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

type PublicCafeVisitInput = {
  slug: string;
  sessionId: string;
  path: string;
  referrer?: string | null;
  durationSeconds?: number | null;
};

function uuidOrNull(value?: string | null) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function recordOperationEvent(input: OperationEventInput) {
  if (!input.cafeId) return;

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("cafe_operation_events").insert({
      cafe_id: input.cafeId,
      event_type: input.eventType,
      actor_type: input.actorType,
      actor_id: uuidOrNull(input.actorId),
      actor_name: input.actorName?.trim() || null,
      actor_email: input.actorEmail?.trim() || null,
      entity_type: input.entityType?.trim() || null,
      entity_id: uuidOrNull(input.entityId),
      metadata: input.metadata ?? {},
    });

    if (error) {
      console.warn("[recordOperationEvent]", error.message);
    }
  } catch (error) {
    console.warn("[recordOperationEvent]", error);
  }
}

export async function recordPublicCafeVisit(input: PublicCafeVisitInput) {
  const slug = input.slug.trim().toLowerCase();
  const sessionId = input.sessionId.trim();
  if (!slug || !sessionId) return;

  try {
    const admin = createAdminClient();
    const { data: cafe, error: cafeError } = await admin
      .from("cafes")
      .select("id")
      .eq("slug", slug)
      .is("deleted_at", null)
      .maybeSingle();

    if (cafeError || !cafe?.id) return;

    const cafeId = String(cafe.id);
    const path = input.path?.trim() || `/c/${slug}`;
    const referrer = input.referrer?.trim() || null;
    const durationSeconds =
      typeof input.durationSeconds === "number" && Number.isFinite(input.durationSeconds)
        ? Math.max(0, Math.round(input.durationSeconds))
        : null;

    const { count } = await admin
      .from("cafe_visit_events")
      .select("id", { count: "exact", head: true })
      .eq("cafe_id", cafeId)
      .eq("session_id", sessionId);

    const modernInsert = {
      cafe_id: cafeId,
      customer_profile_id: null,
      session_id: sessionId,
      path,
      referrer,
      duration_seconds: durationSeconds,
      repeated_visit: Number(count ?? 0) > 0,
    };

    const legacyInsert = {
      cafe_id: cafeId,
      customer_profile_id: null,
      visitor_token: sessionId,
      event_type: "page_view",
      session_id: sessionId,
      duration_seconds: durationSeconds,
      path,
      referrer,
      metadata: {
        source: "public_cafe_visit",
      },
    };

    const first = await admin.from("cafe_visit_events").insert(modernInsert);
    if (!first.error) return;

    const second = await admin.from("cafe_visit_events").insert(legacyInsert);
    if (second.error) {
      console.warn("[recordPublicCafeVisit]", second.error.message);
    }
  } catch (error) {
    console.warn("[recordPublicCafeVisit]", error);
  }
}

export async function recordPublicAppInstallClick(input: {
  cafeSlug: string;
  path?: string;
  userAgent?: string;
  hasPrompt?: boolean;
}) {
  const slug = input.cafeSlug.trim();
  if (!slug) return;

  try {
    const admin = createAdminClient();
    const { data: cafe, error } = await admin
      .from("cafes")
      .select("id")
      .eq("slug", slug)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !cafe?.id) return;

    await recordOperationEvent({
      cafeId: String(cafe.id),
      eventType: operationEventTypes.appInstallClicked,
      actorType: "customer",
      entityType: "pwa",
      entityId: null,
      metadata: {
        path: input.path ?? `/c/${slug}`,
        userAgent: input.userAgent ?? "",
        hasPrompt: Boolean(input.hasPrompt),
      },
    });
  } catch (error) {
    console.warn("[recordPublicAppInstallClick]", error);
  }
}

export async function recordCurrentBrandDashboardEntry(path = "/dashboard") {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (
      !profile ||
      profile.status === "suspended" ||
      !["cafe_owner", "cafe_manager", "cafe_staff"].includes(String(profile.role))
    ) {
      return;
    }

    const { data: membership } = await supabase
      .from("cafe_members")
      .select("cafe_id,cafes(id,name,slug,business_category)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const cafeRaw = Array.isArray(membership?.cafes) ? membership?.cafes[0] : membership?.cafes;
    const cafeId = String(cafeRaw?.id ?? membership?.cafe_id ?? "");
    if (!cafeId) return;

    const admin = createAdminClient();
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from("cafe_operation_events")
      .select("id", { count: "exact", head: true })
      .eq("cafe_id", cafeId)
      .eq("event_type", operationEventTypes.brandLogin)
      .eq("actor_id", user.id)
      .gte("created_at", windowStart);

    if (Number(count ?? 0) > 0) return;

    await recordOperationEvent({
      cafeId,
      eventType: operationEventTypes.brandLogin,
      actorType: "brand_user",
      actorId: user.id,
      actorName: profile.full_name ?? user.user_metadata?.full_name ?? "",
      actorEmail: profile.email ?? user.email ?? "",
      entityType: "dashboard",
      metadata: {
        role: profile.role ?? "",
        cafeName: cafeRaw?.name ?? "",
        cafeSlug: cafeRaw?.slug ?? "",
        path,
        source: "dashboard_entry",
      },
    });
  } catch (error) {
    console.warn("[recordCurrentBrandDashboardEntry]", error);
  }
}
