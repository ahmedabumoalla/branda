import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { requireCustomerProfileForSession } from "@/lib/data/customers";
import type { AppNotification, NotificationAudience } from "@/lib/mock/notifications";

function mapDbNotification(slug: string, row: Record<string, unknown>): AppNotification {
  return {
    id: row.id as string,
    cafeSlug: slug,
    audience: row.audience as NotificationAudience,
    customerId: (row.customer_id as string) ?? undefined,
    title: row.title as string,
    body: row.body as string,
    type: row.type as AppNotification["type"],
    read: row.read as boolean,
    createdAt: row.created_at as string,
    meta: (row.meta as Record<string, string>) ?? undefined,
  };
}

export async function createNotification(input: {
  cafeSlug: string;
  audience: NotificationAudience;
  customerId?: string;
  title: string;
  body: string;
  type: AppNotification["type"];
  meta?: Record<string, string>;
}) {
  const cafe = await getCafeBySlug(input.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();

  if (input.audience === "customer") {
    if (!input.customerId) throw new Error("customerId required");
    const { data: id, error } = await supabase.rpc("create_customer_notification", {
      p_cafe_id: cafe.id,
      p_customer_id: input.customerId,
      p_title: input.title,
      p_body: input.body,
      p_type: input.type,
      p_meta: input.meta ?? {},
    });
    if (error) throw error;
    return {
      id: id as string,
      cafeSlug: input.cafeSlug,
      audience: input.audience,
      customerId: input.customerId,
      title: input.title,
      body: input.body,
      type: input.type,
      read: false,
      createdAt: new Date().toISOString(),
      meta: input.meta,
    } satisfies AppNotification;
  }

  const { data: id, error } = await supabase.rpc("create_cafe_notification", {
    p_cafe_id: cafe.id,
    p_title: input.title,
    p_body: input.body,
    p_type: input.type,
    p_meta: input.meta ?? {},
  });
  if (error) throw error;

  return {
    id: id as string,
    cafeSlug: input.cafeSlug,
    audience: input.audience,
    title: input.title,
    body: input.body,
    type: input.type,
    read: false,
    createdAt: new Date().toISOString(),
    meta: input.meta,
  } satisfies AppNotification;
}

export async function getNotificationsForAudience(
  audience: NotificationAudience,
  cafeSlug: string,
  customerId?: string
): Promise<AppNotification[]> {
  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) return [];

  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("audience", audience)
    .order("created_at", { ascending: false });

  if (audience === "customer" && customerId) {
    query = query.eq("customer_id", customerId);
  }

  const { data } = await query;
  return (data ?? []).map((row) => mapDbNotification(cafeSlug, row));
}

export async function getOwnerCafeNotifications(): Promise<AppNotification[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("audience", "cafe")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []).map((row) => mapDbNotification(cafe.slug, row));
}

export async function markNotificationRead(notificationId: string) {
  await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_cafe_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}

export async function markCustomerNotificationRead(cafeSlug: string, notificationId: string) {
  await requireCustomerProfileForSession(cafeSlug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_customer_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}
