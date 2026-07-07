import { createClient } from "@/lib/supabase/server";
import { hasBrandFeature } from "@/lib/data/feature-entitlements";
import { requireOwnerCafeContext } from "@/lib/data/cafes";

export type CustomerSegmentsPeriod = "30" | "60" | "90";

export type CustomerSegmentKey =
  | "new"
  | "active"
  | "atRisk"
  | "loyalty"
  | "rewards"
  | "highEngagement";

export type CustomerSegmentCard = {
  key: CustomerSegmentKey;
  title: string;
  count: number | null;
  description: string;
  importance: string;
  suggestedAction: string;
};

export type CustomerSegmentsRecentItem = {
  id: string;
  customerName: string;
  phone: string | null;
  lastActivity: string;
  lastActivityType: "طلب" | "حجز" | "ولاء" | "مكافأة";
  activityCount: number | null;
  nearestSegment: string;
};

export type CustomerSegmentsDashboardData =
  | {
      enabled: false;
      cafeName: string;
    }
  | {
      enabled: true;
      cafeName: string;
      period: CustomerSegmentsPeriod;
      periodDays: number;
      segments: CustomerSegmentCard[];
      recent: CustomerSegmentsRecentItem[];
      totalCustomers: number;
      missingSources: string[];
    };

type SafeResponse = {
  data?: unknown;
  error?: { message?: string } | null;
};

type SourceResult<T> = {
  rows: T[];
  missing: boolean;
  sourceName: string;
};

type CustomerSegmentsQueryClient = {
  from(table: string): any;
};

type CustomerProfileSource = {
  id: string;
  name: string;
  phone: string | null;
  createdAt: string;
};

type ActivitySource = {
  id: string;
  customerId: string | null;
  customerName: string;
  phone: string | null;
  createdAt: string;
  type: CustomerSegmentsRecentItem["lastActivityType"];
};

const periodDaysByKey: Record<CustomerSegmentsPeriod, number> = {
  "30": 30,
  "60": 60,
  "90": 90,
};

export function normalizeCustomerSegmentsPeriod(value: unknown): CustomerSegmentsPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "30" || raw === "60" || raw === "90" ? raw : "30";
}

function customerSegmentsDb(client: Awaited<ReturnType<typeof createClient>>) {
  return client as unknown as CustomerSegmentsQueryClient;
}

function text(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const next = String(value).trim();
  return next || fallback;
}

function nullableText(value: unknown) {
  const next = text(value);
  return next || null;
}

function nestedRecord(value: unknown) {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return undefined;
}

function isoDaysAgo(base: Date, days: number) {
  const date = new Date(base);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function isValidDate(value: string | null | undefined) {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
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

async function safePagedRows<T>(
  sourceName: string,
  fetchPage: (from: number, to: number) => PromiseLike<SafeResponse>,
  mapper: (row: Record<string, unknown>) => T,
): Promise<SourceResult<T>> {
  const pageSize = 1000;
  const rows: T[] = [];

  try {
    for (let from = 0; ; from += pageSize) {
      const result = await fetchPage(from, from + pageSize - 1);
      if (result.error) return { rows: [], missing: true, sourceName };
      const pageRows = Array.isArray(result.data) ? result.data : [];
      rows.push(...pageRows.map((row) => mapper(row as Record<string, unknown>)));
      if (pageRows.length < pageSize) break;
    }

    return { rows, missing: false, sourceName };
  } catch {
    return { rows: [], missing: true, sourceName };
  }
}

function addToSet(map: Map<string, Set<string>>, key: string, value: string) {
  const current = map.get(key) ?? new Set<string>();
  current.add(value);
  map.set(key, current);
}

function segmentCount(sourceAvailable: boolean, ids: Set<string>) {
  return sourceAvailable ? ids.size : null;
}

function nearestSegmentForCustomer(input: {
  id: string | null;
  newCustomers: Set<string>;
  activeCustomers: Set<string>;
  atRiskCustomers: Set<string>;
  loyaltyCustomers: Set<string>;
  rewardCustomers: Set<string>;
  highEngagementCustomers: Set<string>;
}) {
  if (!input.id) return "لا توجد بيانات كافية";
  if (input.highEngagementCustomers.has(input.id)) return "عملاء عالي التفاعل";
  if (input.rewardCustomers.has(input.id)) return "عملاء المكافآت";
  if (input.loyaltyCustomers.has(input.id)) return "عملاء الولاء";
  if (input.newCustomers.has(input.id)) return "عملاء جدد";
  if (input.activeCustomers.has(input.id)) return "عملاء نشطون";
  if (input.atRiskCustomers.has(input.id)) return "عملاء معرضون للفقد";
  return "لا توجد بيانات كافية";
}

export async function getOwnerCustomerSegmentsDashboard(
  period: CustomerSegmentsPeriod,
): Promise<CustomerSegmentsDashboardData> {
  const cafe = await requireOwnerCafeContext();
  const enabled = await hasBrandFeature(cafe.id, "customer_segments");

  if (!enabled) {
    return {
      enabled: false,
      cafeName: cafe.name,
    };
  }

  const supabase = customerSegmentsDb(await createClient());
  const now = new Date();
  const periodDays = periodDaysByKey[period];
  const activeWindowStart = isoDaysAgo(now, periodDays);
  const newCustomerStart = isoDaysAgo(now, 30);

  const [
    profiles,
    orders,
    reservations,
    loyaltyCards,
    loyaltyEvents,
    rewardRedemptions,
  ] = await Promise.all([
    safePagedRows(
      "customer_profiles",
      (from, to) =>
        supabase
          .from("customer_profiles")
          .select("id,full_name,phone,created_at")
          .eq("cafe_id", cafe.id)
          .order("created_at", { ascending: false })
          .range(from, to),
      (row): CustomerProfileSource => ({
        id: text(row.id),
        name: text(row.full_name, "عميل بدون اسم"),
        phone: nullableText(row.phone),
        createdAt: text(row.created_at),
      }),
    ),
    safePagedRows(
      "orders",
      (from, to) =>
        supabase
          .from("orders")
          .select("id,customer_id,customer_name,customer_phone,created_at")
          .eq("cafe_id", cafe.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(from, to),
      (row): ActivitySource => ({
        id: `order-${text(row.id)}`,
        customerId: nullableText(row.customer_id),
        customerName: text(row.customer_name, "عميل بدون اسم"),
        phone: nullableText(row.customer_phone),
        createdAt: text(row.created_at),
        type: "طلب",
      }),
    ),
    safePagedRows(
      "reservations",
      (from, to) =>
        supabase
          .from("reservations")
          .select("id,customer_id,customer_name,phone,created_at")
          .eq("cafe_id", cafe.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(from, to),
      (row): ActivitySource => ({
        id: `reservation-${text(row.id)}`,
        customerId: nullableText(row.customer_id),
        customerName: text(row.customer_name, "عميل بدون اسم"),
        phone: nullableText(row.phone),
        createdAt: text(row.created_at),
        type: "حجز",
      }),
    ),
    safePagedRows(
      "loyalty_cards",
      (from, to) =>
        supabase
          .from("loyalty_cards")
          .select("id,customer_profile_id,customer_name,customer_phone,issued_at,updated_at,last_used_at")
          .eq("cafe_id", cafe.id)
          .order("updated_at", { ascending: false })
          .range(from, to),
      (row): ActivitySource => ({
        id: `loyalty-card-${text(row.id)}`,
        customerId: nullableText(row.customer_profile_id),
        customerName: text(row.customer_name, "عميل بدون اسم"),
        phone: nullableText(row.customer_phone),
        createdAt: text(row.last_used_at, text(row.updated_at, text(row.issued_at))),
        type: "ولاء",
      }),
    ),
    safePagedRows(
      "loyalty_card_events",
      (from, to) =>
        supabase
          .from("loyalty_card_events")
          .select("id,created_at,loyalty_cards!loyalty_card_events_card_same_cafe(customer_profile_id,customer_name,customer_phone)")
          .eq("cafe_id", cafe.id)
          .order("created_at", { ascending: false })
          .range(from, to),
      (row): ActivitySource => {
        const card = nestedRecord(row.loyalty_cards);
        return {
          id: `loyalty-event-${text(row.id)}`,
          customerId: nullableText(card?.customer_profile_id),
          customerName: text(card?.customer_name, "عميل بدون اسم"),
          phone: nullableText(card?.customer_phone),
          createdAt: text(row.created_at),
          type: "ولاء",
        };
      },
    ),
    safePagedRows(
      "customer_reward_redemptions",
      (from, to) =>
        supabase
          .from("customer_reward_redemptions")
          .select("id,customer_id,created_at,customer_profiles(full_name,phone)")
          .eq("cafe_id", cafe.id)
          .order("created_at", { ascending: false })
          .range(from, to),
      (row): ActivitySource => {
        const customer = nestedRecord(row.customer_profiles);
        return {
          id: `reward-redemption-${text(row.id)}`,
          customerId: nullableText(row.customer_id),
          customerName: text(customer?.full_name, "عميل بدون اسم"),
          phone: nullableText(customer?.phone),
          createdAt: text(row.created_at),
          type: "مكافأة",
        };
      },
    ),
  ]);

  const missingSources = Array.from(
    new Set(
      [profiles, orders, reservations, loyaltyCards, loyaltyEvents, rewardRedemptions]
        .filter((source) => source.missing)
        .map((source) => source.sourceName),
    ),
  );

  const profileById = new Map(profiles.rows.map((profile) => [profile.id, profile]));
  const allActivities = [
    ...orders.rows,
    ...reservations.rows,
    ...loyaltyCards.rows,
    ...loyaltyEvents.rows,
    ...rewardRedemptions.rows,
  ].filter((activity) => isValidDate(activity.createdAt));

  const activitiesByCustomer = new Map<string, Set<string>>();
  const activeCustomers = new Set<string>();
  const historicalCustomers = new Set<string>();
  const loyaltyCustomers = new Set<string>();
  const rewardCustomers = new Set<string>();
  const newCustomers = new Set(
    profiles.rows
      .filter((profile) => isValidDate(profile.createdAt) && profile.createdAt >= newCustomerStart)
      .map((profile) => profile.id),
  );

  for (const activity of allActivities) {
    if (!activity.customerId) continue;
    addToSet(activitiesByCustomer, activity.customerId, activity.id);
    if (activity.createdAt >= activeWindowStart) activeCustomers.add(activity.customerId);
    if (activity.createdAt < activeWindowStart) historicalCustomers.add(activity.customerId);
    if (activity.type === "ولاء") loyaltyCustomers.add(activity.customerId);
    if (activity.type === "مكافأة") rewardCustomers.add(activity.customerId);
  }

  const atRiskCustomers = new Set(
    [...historicalCustomers].filter((customerId) => !activeCustomers.has(customerId)),
  );
  const highEngagementCustomers = new Set(
    [...activitiesByCustomer.entries()]
      .filter(([, activityIds]) => activityIds.size > 1)
      .map(([customerId]) => customerId),
  );

  const activitySourcesAvailable =
    !orders.missing &&
    !reservations.missing &&
    !loyaltyCards.missing &&
    !loyaltyEvents.missing;
  const loyaltySourcesAvailable = !loyaltyCards.missing || !loyaltyEvents.missing;

  const recent = allActivities
    .filter((activity) => activity.createdAt >= activeWindowStart)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20)
    .map((activity): CustomerSegmentsRecentItem => {
      const profile = activity.customerId ? profileById.get(activity.customerId) : undefined;
      return {
        id: activity.id,
        customerName: profile?.name ?? activity.customerName,
        phone: profile?.phone ?? activity.phone,
        lastActivity: formatDate(activity.createdAt),
        lastActivityType: activity.type,
        activityCount: activity.customerId ? activitiesByCustomer.get(activity.customerId)?.size ?? 0 : null,
        nearestSegment: nearestSegmentForCustomer({
          id: activity.customerId,
          newCustomers,
          activeCustomers,
          atRiskCustomers,
          loyaltyCustomers,
          rewardCustomers,
          highEngagementCustomers,
        }),
      };
    });

  return {
    enabled: true,
    cafeName: cafe.name,
    period,
    periodDays,
    totalCustomers: profiles.missing ? 0 : profiles.rows.length,
    segments: [
      {
        key: "new",
        title: "عملاء جدد",
        count: segmentCount(!profiles.missing, newCustomers),
        description: "العملاء الذين ظهروا أو سجلوا خلال آخر 30 يومًا.",
        importance: "تساعدك هذه الشريحة على قياس قدرة العلامة على جذب جمهور جديد.",
        suggestedAction: "يمكن لاحقًا إرسال ترحيب أو عرض أول زيارة لهذه الشريحة.",
      },
      {
        key: "active",
        title: "عملاء نشطون",
        count: segmentCount(activitySourcesAvailable, activeCustomers),
        description: `العملاء الذين لديهم طلب أو ولاء أو حجز خلال آخر ${periodDays} يومًا.`,
        importance: "هذه الشريحة تعكس العملاء الذين يتفاعلون مع علامتك الآن.",
        suggestedAction: "يمكن لاحقًا تقديم عرض متابعة أو مكافأة بسيطة للحفاظ على النشاط.",
      },
      {
        key: "atRisk",
        title: "عملاء معرضون للفقد",
        count: segmentCount(activitySourcesAvailable, atRiskCustomers),
        description: `العملاء الذين لديهم نشاط سابق لكن لا يوجد نشاط خلال آخر ${periodDays} يومًا.`,
        importance: "تساعدك هذه الشريحة على رؤية العملاء الذين قد يحتاجون تذكيرًا.",
        suggestedAction: "يمكن لاحقًا إرسال عرض استرجاع لهذه الشريحة.",
      },
      {
        key: "loyalty",
        title: "عملاء الولاء",
        count: segmentCount(loyaltySourcesAvailable, loyaltyCustomers),
        description: "العملاء الذين لديهم بطاقة ولاء أو عمليات ولاء.",
        importance: "هذه الشريحة تمثل العملاء الأقرب للتكرار والمكافآت.",
        suggestedAction: "يمكن لاحقًا تجربة مكافأة زيارة متكررة لهذه الشريحة.",
      },
      {
        key: "rewards",
        title: "عملاء المكافآت",
        count: segmentCount(!rewardRedemptions.missing, rewardCustomers),
        description: "العملاء الذين استبدلوا مكافآت أو لديهم عمليات صرف مكافآت.",
        importance: "توضح هذه الشريحة العملاء الذين وصلوا إلى قيمة ملموسة من البرنامج.",
        suggestedAction: "يمكن لاحقًا اقتراح مكافأة متابعة بعد الصرف.",
      },
      {
        key: "highEngagement",
        title: "عملاء عالي التفاعل",
        count: segmentCount(activitySourcesAvailable, highEngagementCustomers),
        description: "العملاء الذين لديهم أكثر من عملية مرتبطة بالطلبات أو الولاء أو الحجوزات.",
        importance: "هذه الشريحة مناسبة لقياس العملاء الأكثر ارتباطًا بالعلامة.",
        suggestedAction: "يمكن لاحقًا بناء عرض خاص أو تجربة VIP لهذه الشريحة.",
      },
    ],
    recent,
    missingSources,
  };
}
