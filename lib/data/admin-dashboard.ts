import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/data/cafes";

export type AdminMonthlyRevenuePoint = {
  monthKey: string;
  monthLabel: string;
  revenue: number;
  subscriptionsCount: number;
  growthPercent: number | null;
};

export type AdminAuditItem = {
  id: string;
  title: string;
  entityLabel: string;
  actorName: string;
  actorEmail: string;
  cafeName: string;
  dateLabel: string;
  timeLabel: string;
};

export type AdminDashboardOverview = {
  totalCafes: number;
  activeCafes: number;
  totalProducts: number;
  totalCustomers: number;
  activeSubscriptions: number;
  totalExperienceSubmissions: number;
  currentMonthRevenue: number;
  totalRevenueLast12Months: number;
  currentMonthGrowthPercent: number | null;
  monthlyRevenue: AdminMonthlyRevenuePoint[];
  auditItems: AdminAuditItem[];
};

export function createEmptyAdminDashboardOverview(): AdminDashboardOverview {
  return {
    totalCafes: 0,
    activeCafes: 0,
    totalProducts: 0,
    totalCustomers: 0,
    activeSubscriptions: 0,
    totalExperienceSubmissions: 0,
    currentMonthRevenue: 0,
    totalRevenueLast12Months: 0,
    currentMonthGrowthPercent: null,
    monthlyRevenue: createLastTwelveMonths(),
    auditItems: [],
  };
}

function createLastTwelveMonths(): AdminMonthlyRevenuePoint[] {
  const now = new Date();

  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - index), 1)
    );

    return {
      monthKey: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      monthLabel: new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
        month: "short",
      }).format(date),
      revenue: 0,
      subscriptionsCount: 0,
      growthPercent: null,
    };
  });
}

function buildMonthlyRevenue(
  subscriptions: Array<{
    amount_sar: number | string | null;
    started_at: string;
  }>
): AdminMonthlyRevenuePoint[] {
  const months = createLastTwelveMonths();
  const monthMap = new Map(months.map((month) => [month.monthKey, month]));

  subscriptions.forEach((subscription) => {
    const startedAt = new Date(subscription.started_at);
    const monthKey = `${startedAt.getUTCFullYear()}-${String(
      startedAt.getUTCMonth() + 1
    ).padStart(2, "0")}`;

    const month = monthMap.get(monthKey);
    if (!month) return;

    month.revenue += Number(subscription.amount_sar ?? 0);
    month.subscriptionsCount += 1;
  });

  return months.map((month, index) => {
    if (index === 0) return month;

    const previousRevenue = months[index - 1].revenue;

    if (previousRevenue === 0 && month.revenue === 0) {
      return {
        ...month,
        growthPercent: 0,
      };
    }

    if (previousRevenue === 0 && month.revenue > 0) {
      return {
        ...month,
        growthPercent: 100,
      };
    }

    return {
      ...month,
      growthPercent: Number(
        (((month.revenue - previousRevenue) / previousRevenue) * 100).toFixed(1)
      ),
    };
  });
}

function getAuditActionLabel(action: string) {
  const actions: Record<string, string> = {
    admin_insert_cafes: "إضافة علامة جديدة",
    admin_update_cafes: "تعديل بيانات علامة",
    admin_delete_cafes: "حذف علامة",
    admin_insert_platform_plans: "إضافة باقة جديدة",
    admin_update_platform_plans: "تعديل باقة",
    admin_delete_platform_plans: "حذف باقة",
    admin_insert_platform_settings: "إضافة إعدادات المنصة",
    admin_update_platform_settings: "تعديل إعدادات المنصة",
    admin_delete_platform_settings: "حذف إعدادات المنصة",
    admin_insert_subscriptions: "تفعيل اشتراك جديد",
    admin_update_subscriptions: "تعديل اشتراك",
    admin_delete_subscriptions: "إلغاء اشتراك",
    admin_insert_offers: "إضافة عرض أو خصم",
    admin_update_offers: "تعديل عرض أو خصم",
    admin_delete_offers: "حذف عرض أو خصم",
    admin_insert_menu_products: "إضافة منتج",
    admin_update_menu_products: "تعديل منتج",
    admin_delete_menu_products: "حذف منتج",
    admin_insert_domain_orders: "إضافة طلب نطاق",
    admin_update_domain_orders: "تعديل طلب نطاق",
    admin_delete_domain_orders: "حذف طلب نطاق",
    respond_to_pickup_order: "تحديث حالة طلب",
    respond_to_reservation: "تحديث حالة حجز",
    create_domain_order: "إنشاء طلب نطاق",
    cancel_domain_order: "إلغاء طلب نطاق",
    approve_experience_submission: "اعتماد مشاركة تجربة",
    adjust_loyalty_points: "تعديل نقاط ولاء",
  };

  return actions[action] ?? action.replaceAll("_", " ");
}

function getAuditEntityLabel(entityTable: string | null) {
  const entities: Record<string, string> = {
    cafes: "العلامات",
    platform_plans: "الباقات",
    platform_settings: "إعدادات المنصة",
    subscriptions: "الاشتراكات",
    offers: "العروض",
    menu_products: "المنتجات",
    menu_categories: "التصنيفات",
    domain_orders: "النطاقات",
    reservations: "الحجوزات",
    orders: "الطلبات",
    experience_submissions: "مشاركات التجربة",
    loyalty_accounts: "الولاء",
    marketing_campaigns: "الحملات",
    experience_campaigns: "حملات التجربة",
  };

  return entities[entityTable ?? ""] ?? entityTable ?? "المنصة";
}

export async function getAdminDashboardOverview(): Promise<AdminDashboardOverview> {
  await requirePlatformAdmin();

  const supabase = await createClient();

  const startDate = new Date();
  startDate.setUTCDate(1);
  startDate.setUTCHours(0, 0, 0, 0);
  startDate.setUTCMonth(startDate.getUTCMonth() - 11);

  const [
    totalCafesResult,
    activeCafesResult,
    productsResult,
    customersResult,
    subscriptionsResult,
    experienceSubmissionsResult,
    revenueResult,
    auditResult,
  ] = await Promise.all([
    supabase
      .from("cafes")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),

    supabase
      .from("cafes")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .is("deleted_at", null),

    supabase
      .from("menu_products")
      .select("id", { count: "exact", head: true })
      .eq("available", true)
      .is("deleted_at", null),

    supabase
      .from("customer_profiles")
      .select("id", { count: "exact", head: true }),

    supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "trialing"]),

    supabase
      .from("experience_submissions")
      .select("id", { count: "exact", head: true }),

    supabase
      .from("subscriptions")
      .select("amount_sar, started_at")
      .in("status", ["active", "trialing"])
      .gte("started_at", startDate.toISOString())
      .order("started_at", { ascending: true }),

    supabase
      .from("audit_logs")
      .select("id, actor_id, cafe_id, action, entity_table, created_at")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const errors = [
    totalCafesResult.error,
    activeCafesResult.error,
    productsResult.error,
    customersResult.error,
    subscriptionsResult.error,
    experienceSubmissionsResult.error,
    revenueResult.error,
    auditResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw errors[0];
  }

  const auditRows = auditResult.data ?? [];

  const actorIds = Array.from(
    new Set(
      auditRows
        .map((row) => row.actor_id as string | null)
        .filter((id): id is string => Boolean(id))
    )
  );

  const cafeIds = Array.from(
    new Set(
      auditRows
        .map((row) => row.cafe_id as string | null)
        .filter((id): id is string => Boolean(id))
    )
  );

  const actorsResult =
    actorIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", actorIds)
      : { data: [], error: null };

  const cafesResult =
    cafeIds.length > 0
      ? await supabase.from("cafes").select("id, name").in("id", cafeIds)
      : { data: [], error: null };

  if (actorsResult.error) throw actorsResult.error;
  if (cafesResult.error) throw cafesResult.error;

  const actorMap = new Map(
    (actorsResult.data ?? []).map((actor) => [
      actor.id as string,
      {
        name: String(actor.full_name ?? "مستخدم المنصة"),
        email: String(actor.email ?? ""),
      },
    ])
  );

  const cafeMap = new Map(
    (cafesResult.data ?? []).map((cafe) => [
      cafe.id as string,
      String(cafe.name ?? "المنصة"),
    ])
  );

  const monthlyRevenue = buildMonthlyRevenue(
    (revenueResult.data ?? []).map((row) => ({
      amount_sar: row.amount_sar as number | string | null,
      started_at: String(row.started_at),
    }))
  );

  const currentMonth = monthlyRevenue[monthlyRevenue.length - 1];

  const auditItems: AdminAuditItem[] = auditRows.map((row) => {
    const createdAt = new Date(String(row.created_at));
    const actor = actorMap.get(String(row.actor_id ?? ""));
    const cafeName = cafeMap.get(String(row.cafe_id ?? "")) ?? "المنصة";

    return {
      id: String(row.id),
      title: getAuditActionLabel(String(row.action)),
      entityLabel: getAuditEntityLabel(
        row.entity_table ? String(row.entity_table) : null
      ),
      actorName: actor?.name ?? "النظام",
      actorEmail: actor?.email ?? "",
      cafeName,
      dateLabel: new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(createdAt),
      timeLabel: new Intl.DateTimeFormat("ar-SA", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(createdAt),
    };
  });

  return {
    totalCafes: totalCafesResult.count ?? 0,
    activeCafes: activeCafesResult.count ?? 0,
    totalProducts: productsResult.count ?? 0,
    totalCustomers: customersResult.count ?? 0,
    activeSubscriptions: subscriptionsResult.count ?? 0,
    totalExperienceSubmissions: experienceSubmissionsResult.count ?? 0,
    currentMonthRevenue: currentMonth?.revenue ?? 0,
    totalRevenueLast12Months: monthlyRevenue.reduce(
      (total, month) => total + month.revenue,
      0
    ),
    currentMonthGrowthPercent: currentMonth?.growthPercent ?? null,
    monthlyRevenue,
    auditItems,
  };
}
