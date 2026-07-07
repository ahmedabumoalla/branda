import { createClient } from "@/lib/supabase/server";
import { hasBrandFeature } from "@/lib/data/feature-entitlements";
import { requireOwnerCafeContext } from "@/lib/data/cafes";

export type GrowthPeriod = "7" | "30" | "90";

export type GrowthMetricKey =
  | "totalOrders"
  | "acceptedOrders"
  | "rejectedOrders"
  | "reservations"
  | "loyaltyOperations"
  | "rewardRedemptions"
  | "visits"
  | "cashierActivity";

export type GrowthMetric = {
  key: GrowthMetricKey;
  label: string;
  value: number;
  hint: string;
};

export type GrowthComparison = {
  key: "orders" | "reservations" | "visits";
  label: string;
  current: number;
  previous: number;
  message: string;
};

export type GrowthRecommendation = {
  title: string;
  body: string;
  tone: "gold" | "green" | "blue" | "muted";
};

export type GrowthRecentItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  createdAt: string;
};

export type GrowthDashboardData =
  | {
      enabled: false;
      cafeName: string;
    }
  | {
      enabled: true;
      cafeName: string;
      period: GrowthPeriod;
      periodDays: number;
      window: {
        currentStart: string;
        currentEnd: string;
        previousStart: string;
        previousEnd: string;
      };
      metrics: GrowthMetric[];
      comparisons: GrowthComparison[];
      recommendations: GrowthRecommendation[];
      recent: {
        orders: GrowthRecentItem[];
        reservations: GrowthRecentItem[];
        loyalty: GrowthRecentItem[];
        rewards: GrowthRecentItem[];
      };
      missingSources: string[];
    };

type SafeResponse = {
  data?: unknown;
  error?: { message?: string } | null;
  count?: number | null;
};

type SourceResult<T> = {
  rows: T[];
  missing: boolean;
};

type GrowthQueryClient = {
  // Keep Supabase's deeply generic query builder out of this aggregate loader.
  from(table: string): any;
};

function growthDb(client: Awaited<ReturnType<typeof createClient>>) {
  return client as unknown as GrowthQueryClient;
}

const periodDaysByKey: Record<GrowthPeriod, number> = {
  "7": 7,
  "30": 30,
  "90": 90,
};

export function normalizeGrowthPeriod(value: unknown): GrowthPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "7" || raw === "30" || raw === "90" ? raw : "30";
}

function isoDaysAgo(base: Date, days: number) {
  const date = new Date(base);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function text(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const next = String(value).trim();
  return next || fallback;
}

function numberValue(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function nestedRecord(value: unknown) {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return undefined;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(date);
}

async function safeCount(sourceName: string, promise: PromiseLike<SafeResponse>) {
  try {
    const result = await promise;
    if (result.error) return { value: 0, missing: true, sourceName };
    return { value: Number(result.count ?? 0), missing: false, sourceName };
  } catch {
    return { value: 0, missing: true, sourceName };
  }
}

async function safeRows<T>(
  sourceName: string,
  promise: PromiseLike<SafeResponse>,
  mapper: (row: Record<string, unknown>) => T,
): Promise<SourceResult<T> & { sourceName: string }> {
  try {
    const result = await promise;
    if (result.error) return { rows: [], missing: true, sourceName };
    const rows = Array.isArray(result.data) ? result.data : [];
    return {
      rows: rows.map((row) => mapper(row as Record<string, unknown>)),
      missing: false,
      sourceName,
    };
  } catch {
    return { rows: [], missing: true, sourceName };
  }
}

function comparisonMessage(current: number, previous: number) {
  if (current === 0 && previous === 0) return "لا توجد بيانات كافية للمقارنة";
  if (previous === 0) return "لا توجد بيانات كافية للمقارنة";
  const diff = current - previous;
  if (diff > 0) return `أعلى من الفترة السابقة بـ ${diff}`;
  if (diff < 0) return `أقل من الفترة السابقة بـ ${Math.abs(diff)}`;
  return "مستقر مقارنة بالفترة السابقة";
}

function buildRecommendations(input: {
  orders: number;
  previousOrders: number;
  visits: number;
  loyaltyOperations: number;
  rewardRedemptions: number;
}) {
  const recommendations: GrowthRecommendation[] = [];
  const hasAnyData =
    input.orders +
      input.previousOrders +
      input.visits +
      input.loyaltyOperations +
      input.rewardRedemptions >
    0;

  if (!hasAnyData) {
    return [
      {
        title: "ابدأ من الأساسيات",
        body: "ابدأ بتفعيل المنيو والطلبات والولاء حتى تظهر توصيات أدق.",
        tone: "muted" as const,
      },
    ];
  }

  if (input.visits >= 20 && input.orders * 10 < input.visits) {
    recommendations.push({
      title: "حسّن تحويل الزيارات",
      body: "لديك زيارات جيدة لكن التحويل إلى طلبات منخفض، جرّب عرضًا واضحًا في الصفحة الرئيسية.",
      tone: "gold",
    });
  }

  if (input.previousOrders > 0 && input.orders < input.previousOrders) {
    recommendations.push({
      title: "استعد زخم الطلبات",
      body: "الطلبات أقل من الفترة السابقة، جرّب تفعيل عرض محدود.",
      tone: "blue",
    });
  }

  if (input.loyaltyOperations > 0 || input.rewardRedemptions > 0) {
    recommendations.push({
      title: "وسّع نشاط الولاء",
      body: "عملاء الولاء يتفاعلون بشكل جيد، جرّب مكافأة زيارة متكررة.",
      tone: "green",
    });
  }

  return recommendations.length
    ? recommendations
    : [
        {
          title: "راقب الاتجاه القادم",
          body: "البيانات الحالية مستقرة. تابع الطلبات والزيارات خلال الفترة القادمة لاختيار خطوة نمو مناسبة.",
          tone: "muted" as const,
        },
      ];
}

export async function getOwnerGrowthDashboard(period: GrowthPeriod): Promise<GrowthDashboardData> {
  const cafe = await requireOwnerCafeContext();
  const enabled = await hasBrandFeature(cafe.id, "growth_os");

  if (!enabled) {
    return {
      enabled: false,
      cafeName: cafe.name,
    };
  }

  const supabase = growthDb(await createClient());
  const periodDays = periodDaysByKey[period];
  const now = new Date();
  const currentEnd = now.toISOString();
  const currentStart = isoDaysAgo(now, periodDays);
  const previousEnd = currentStart;
  const previousStart = isoDaysAgo(new Date(currentStart), periodDays);

  const [
    totalOrders,
    acceptedOrders,
    rejectedOrders,
    previousOrders,
    reservations,
    previousReservations,
    loyaltyOperations,
    rewardRedemptions,
    visits,
    previousVisits,
    cashierActivity,
    recentOrders,
    recentReservations,
    recentLoyalty,
    recentRewards,
  ] = await Promise.all([
    safeCount(
      "orders",
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .is("deleted_at", null)
        .gte("created_at", currentStart)
        .lt("created_at", currentEnd),
    ),
    safeCount(
      "orders",
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .eq("status", "accepted")
        .is("deleted_at", null)
        .gte("created_at", currentStart)
        .lt("created_at", currentEnd),
    ),
    safeCount(
      "orders",
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .eq("status", "rejected")
        .is("deleted_at", null)
        .gte("created_at", currentStart)
        .lt("created_at", currentEnd),
    ),
    safeCount(
      "orders",
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .is("deleted_at", null)
        .gte("created_at", previousStart)
        .lt("created_at", previousEnd),
    ),
    safeCount(
      "reservations",
      supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .is("deleted_at", null)
        .gte("created_at", currentStart)
        .lt("created_at", currentEnd),
    ),
    safeCount(
      "reservations",
      supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .is("deleted_at", null)
        .gte("created_at", previousStart)
        .lt("created_at", previousEnd),
    ),
    safeCount(
      "loyalty_card_events",
      supabase
        .from("loyalty_card_events")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .gte("created_at", currentStart)
        .lt("created_at", currentEnd),
    ),
    safeCount(
      "customer_reward_redemptions",
      supabase
        .from("customer_reward_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .gte("created_at", currentStart)
        .lt("created_at", currentEnd),
    ),
    safeCount(
      "cafe_visit_events",
      supabase
        .from("cafe_visit_events")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .gte("created_at", currentStart)
        .lt("created_at", currentEnd),
    ),
    safeCount(
      "cafe_visit_events",
      supabase
        .from("cafe_visit_events")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .gte("created_at", previousStart)
        .lt("created_at", previousEnd),
    ),
    safeCount(
      "cafe_cashier_activity_logs",
      supabase
        .from("cafe_cashier_activity_logs")
        .select("id", { count: "exact", head: true })
        .eq("cafe_id", cafe.id)
        .gte("created_at", currentStart)
        .lt("created_at", currentEnd),
    ),
    safeRows(
      "orders",
      supabase
        .from("orders")
        .select("id,status,total,customer_name,created_at")
        .eq("cafe_id", cafe.id)
        .is("deleted_at", null)
        .gte("created_at", currentStart)
        .lt("created_at", currentEnd)
        .order("created_at", { ascending: false })
        .limit(5),
      (row): GrowthRecentItem => ({
        id: text(row.id),
        title: text(row.customer_name, "طلب بدون اسم"),
        subtitle: `الحالة: ${text(row.status, "-")}`,
        meta: `${numberValue(row.total).toFixed(2)} ريال`,
        createdAt: formatDate(text(row.created_at)),
      }),
    ),
    safeRows(
      "reservations",
      supabase
        .from("reservations")
        .select("id,status,event_type,customer_name,reservation_date,reservation_time,created_at")
        .eq("cafe_id", cafe.id)
        .is("deleted_at", null)
        .gte("created_at", currentStart)
        .lt("created_at", currentEnd)
        .order("created_at", { ascending: false })
        .limit(5),
      (row): GrowthRecentItem => ({
        id: text(row.id),
        title: text(row.customer_name, "حجز بدون اسم"),
        subtitle: text(row.event_type, "حجز"),
        meta: [text(row.reservation_date), text(row.reservation_time)].filter(Boolean).join(" ") || text(row.status, "-"),
        createdAt: formatDate(text(row.created_at)),
      }),
    ),
    safeRows(
      "loyalty_card_events",
      supabase
        .from("loyalty_card_events")
        .select("id,event_type,invoice_barcode,invoice_amount,created_at,loyalty_cards!loyalty_card_events_card_same_cafe(customer_name,card_code),cafe_cashiers(full_name)")
        .eq("cafe_id", cafe.id)
        .gte("created_at", currentStart)
        .lt("created_at", currentEnd)
        .order("created_at", { ascending: false })
        .limit(5),
      (row): GrowthRecentItem => {
        const card = nestedRecord(row.loyalty_cards);
        const cashier = nestedRecord(row.cafe_cashiers);
        return {
          id: text(row.id),
          title: text(card?.customer_name, "عميل ولاء"),
          subtitle: `عملية ${text(row.event_type, "-")}`,
          meta: text(cashier?.full_name, text(row.invoice_barcode, "-")),
          createdAt: formatDate(text(row.created_at)),
        };
      },
    ),
    safeRows(
      "customer_reward_redemptions",
      supabase
        .from("customer_reward_redemptions")
        .select("id,scanned_code,created_at,customer_reward_instances(reward_title,source_type),customer_profiles(full_name),cafe_cashiers(full_name)")
        .eq("cafe_id", cafe.id)
        .gte("created_at", currentStart)
        .lt("created_at", currentEnd)
        .order("created_at", { ascending: false })
        .limit(5),
      (row): GrowthRecentItem => {
        const reward = nestedRecord(row.customer_reward_instances);
        const customer = nestedRecord(row.customer_profiles);
        const cashier = nestedRecord(row.cafe_cashiers);
        return {
          id: text(row.id),
          title: text(reward?.reward_title, "مكافأة"),
          subtitle: text(customer?.full_name, "عميل"),
          meta: text(cashier?.full_name, text(row.scanned_code, "-")),
          createdAt: formatDate(text(row.created_at)),
        };
      },
    ),
  ]);

  const missingSources = Array.from(
    new Set(
      [
        totalOrders,
        acceptedOrders,
        rejectedOrders,
        previousOrders,
        reservations,
        previousReservations,
        loyaltyOperations,
        rewardRedemptions,
        visits,
        previousVisits,
        cashierActivity,
        recentOrders,
        recentReservations,
        recentLoyalty,
        recentRewards,
      ]
        .filter((source) => source.missing)
        .map((source) => source.sourceName),
    ),
  );

  return {
    enabled: true,
    cafeName: cafe.name,
    period,
    periodDays,
    window: {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
    },
    metrics: [
      {
        key: "totalOrders",
        label: "إجمالي الطلبات",
        value: totalOrders.value,
        hint: "ضمن الفترة المحددة",
      },
      {
        key: "acceptedOrders",
        label: "الطلبات المقبولة",
        value: acceptedOrders.value,
        hint: "طلبات تم قبولها",
      },
      {
        key: "rejectedOrders",
        label: "الطلبات المرفوضة",
        value: rejectedOrders.value,
        hint: "طلبات تم رفضها",
      },
      {
        key: "reservations",
        label: "الحجوزات",
        value: reservations.value,
        hint: "ضمن الفترة المحددة",
      },
      {
        key: "loyaltyOperations",
        label: "عمليات الولاء",
        value: loyaltyOperations.value,
        hint: "مسح أو استخدام بطاقة ولاء",
      },
      {
        key: "rewardRedemptions",
        label: "المكافآت المصروفة",
        value: rewardRedemptions.value,
        hint: "صرف مكافآت العملاء",
      },
      {
        key: "visits",
        label: "زيارات الفرع الإلكتروني",
        value: visits.value,
        hint: "زيارات مسجلة للصفحات العامة",
      },
      {
        key: "cashierActivity",
        label: "نشاط الكاشير",
        value: cashierActivity.value,
        hint: "سجلات نشاط الكاشير المتاحة",
      },
    ],
    comparisons: [
      {
        key: "orders",
        label: "الطلبات مقارنة بالفترة السابقة",
        current: totalOrders.value,
        previous: previousOrders.value,
        message: comparisonMessage(totalOrders.value, previousOrders.value),
      },
      {
        key: "reservations",
        label: "الحجوزات مقارنة بالفترة السابقة",
        current: reservations.value,
        previous: previousReservations.value,
        message: comparisonMessage(reservations.value, previousReservations.value),
      },
      {
        key: "visits",
        label: "الزيارات مقارنة بالفترة السابقة",
        current: visits.value,
        previous: previousVisits.value,
        message: comparisonMessage(visits.value, previousVisits.value),
      },
    ],
    recommendations: buildRecommendations({
      orders: totalOrders.value,
      previousOrders: previousOrders.value,
      visits: visits.value,
      loyaltyOperations: loyaltyOperations.value,
      rewardRedemptions: rewardRedemptions.value,
    }),
    recent: {
      orders: recentOrders.rows,
      reservations: recentReservations.rows,
      loyalty: recentLoyalty.rows,
      rewards: recentRewards.rows,
    },
    missingSources,
  };
}
