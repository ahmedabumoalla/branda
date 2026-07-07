import { hasBrandFeature } from "@/lib/data/feature-entitlements";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";

export type AdvancedCouponMetricKey =
  | "activeOffers"
  | "expiredOffers"
  | "upcomingOffers"
  | "discountOrders";

export type AdvancedCouponMetric = {
  key: AdvancedCouponMetricKey;
  label: string;
  value: number | null;
  hint: string;
};

export type AdvancedCouponOfferStatus = "نشط" | "منتهي" | "قادم" | "متوقف" | "مسودة";

export type AdvancedCouponOfferRow = {
  id: string;
  title: string;
  status: AdvancedCouponOfferStatus;
  rawStatus: string;
  startDate: string | null;
  endDate: string | null;
  discountType: string;
  usageCount: number | null;
};

export type AdvancedCouponSuggestionKey =
  | "winback"
  | "newCustomers"
  | "loyalty"
  | "quietPeriod"
  | "weakProduct";

export type AdvancedCouponSuggestion = {
  key: AdvancedCouponSuggestionKey;
  title: string;
  segment: string;
  reason: string;
  suggestedAction: string;
  hasEnoughData: boolean;
};

export type AdvancedCouponsDashboardData =
  | {
      enabled: false;
      cafeName: string;
    }
  | {
      enabled: true;
      cafeName: string;
      metrics: AdvancedCouponMetric[];
      latestOffers: AdvancedCouponOfferRow[];
      suggestions: AdvancedCouponSuggestion[];
      totalOffers: number | null;
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

type AdvancedCouponsQueryClient = {
  from(table: string): any;
};

type OfferSource = {
  id: string;
  title: string;
  status: string;
  offerType: string;
  discountPercent: number | null;
  code: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string | null;
};

type OrderSource = {
  id: string;
  customerId: string | null;
  customerName: string;
  discountAmount: number;
  total: number;
  createdAt: string;
  items: OrderItemSource[];
};

type OrderItemSource = {
  productId: string | null;
  name: string;
  quantity: number;
};

type CustomerSource = {
  id: string;
  createdAt: string;
};

type LoyaltyCardSource = {
  id: string;
  customerId: string | null;
};

type RewardRedemptionSource = {
  id: string;
  customerId: string | null;
};

function advancedCouponsDb(client: Awaited<ReturnType<typeof createClient>>) {
  return client as unknown as AdvancedCouponsQueryClient;
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

function numberValue(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function isValidDate(value: string | null | undefined) {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function daysAgo(base: Date, days: number) {
  const date = new Date(base);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    dateStyle: "medium",
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

function normalizeOfferStatus(offer: OfferSource, now: Date): AdvancedCouponOfferStatus {
  const raw = offer.status.toLowerCase();
  const start = isValidDate(offer.startDate) ? new Date(`${offer.startDate}T00:00:00`) : null;
  const end = isValidDate(offer.endDate) ? new Date(`${offer.endDate}T23:59:59`) : null;

  if (raw === "draft" || offer.status === "مسودة") return "مسودة";
  if (raw === "inactive" || offer.status === "متوقف" || offer.status === "غير نشط") return "متوقف";
  if (raw === "expired" || offer.status === "منتهي" || (end && end < now)) return "منتهي";
  if (start && start > now) return "قادم";
  return "نشط";
}

function discountTypeForOffer(offer: OfferSource) {
  if (offer.discountPercent && offer.discountPercent > 0) {
    return `خصم ${offer.discountPercent}%`;
  }
  if (offer.code) return "كود عرض";
  return offer.offerType || "عرض";
}

function buildOfferRows(offers: OfferSource[], now: Date) {
  return offers.map((offer): AdvancedCouponOfferRow => ({
    id: offer.id,
    title: offer.title,
    status: normalizeOfferStatus(offer, now),
    rawStatus: offer.status,
    startDate: formatDate(offer.startDate),
    endDate: formatDate(offer.endDate),
    discountType: discountTypeForOffer(offer),
    usageCount: null,
  }));
}

function countActiveCustomers(orders: OrderSource[], cutoff: string) {
  return new Set(
    orders
      .filter((order) => order.customerId && order.createdAt >= cutoff)
      .map((order) => order.customerId as string),
  ).size;
}

function countAtRiskCustomers(orders: OrderSource[], cutoff: string) {
  const active = new Set<string>();
  const historical = new Set<string>();

  for (const order of orders) {
    if (!order.customerId) continue;
    if (order.createdAt >= cutoff) active.add(order.customerId);
    else historical.add(order.customerId);
  }

  return [...historical].filter((customerId) => !active.has(customerId)).length;
}

function weakestOrderedProduct(orders: OrderSource[]) {
  const products = new Map<string, { name: string; quantity: number }>();

  for (const order of orders) {
    for (const item of order.items) {
      const key = item.productId ?? item.name;
      if (!key) continue;
      const current = products.get(key) ?? { name: item.name || "منتج بدون اسم", quantity: 0 };
      current.quantity += item.quantity;
      products.set(key, current);
    }
  }

  const ordered = [...products.values()].filter((product) => product.quantity > 0);
  if (ordered.length < 2) return null;
  return ordered.sort((a, b) => a.quantity - b.quantity)[0];
}

function buildSuggestions(input: {
  customers: SourceResult<CustomerSource>;
  orders: SourceResult<OrderSource>;
  loyaltyCards: SourceResult<LoyaltyCardSource>;
  rewardRedemptions: SourceResult<RewardRedemptionSource>;
  now: Date;
}): AdvancedCouponSuggestion[] {
  const thirtyDaysAgo = daysAgo(input.now, 30);
  const sevenDaysAgo = daysAgo(input.now, 7);
  const fourteenDaysAgo = daysAgo(input.now, 14);
  const newCustomers = input.customers.rows.filter((customer) => customer.createdAt >= thirtyDaysAgo).length;
  const activeCustomers = countActiveCustomers(input.orders.rows, thirtyDaysAgo);
  const atRiskCustomers = countAtRiskCustomers(input.orders.rows, thirtyDaysAgo);
  const currentWeekOrders = input.orders.rows.filter((order) => order.createdAt >= sevenDaysAgo).length;
  const previousWeekOrders = input.orders.rows.filter(
    (order) => order.createdAt >= fourteenDaysAgo && order.createdAt < sevenDaysAgo,
  ).length;
  const weakProduct = weakestOrderedProduct(input.orders.rows);

  return [
    {
      key: "winback",
      title: "كوبون استرجاع العملاء",
      segment: "عملاء معرضون للفقد",
      reason: input.orders.missing
        ? "لا توجد بيانات كافية"
        : atRiskCustomers > 0
          ? `يوجد ${atRiskCustomers} عميل لديهم نشاط سابق بدون طلب حديث.`
          : "لا توجد شريحة فقد واضحة في الفترة الحالية.",
      suggestedAction: "يمكن لاحقًا إنشاء عرض استرجاع مخصص لهذه الشريحة من نظام العروض.",
      hasEnoughData: !input.orders.missing && atRiskCustomers > 0,
    },
    {
      key: "newCustomers",
      title: "كوبون العملاء الجدد",
      segment: "عملاء جدد",
      reason: input.customers.missing
        ? "لا توجد بيانات كافية"
        : newCustomers > 0
          ? `ظهر ${newCustomers} عميل جديد خلال آخر 30 يومًا.`
          : "لا يوجد عملاء جدد واضحون خلال آخر 30 يومًا.",
      suggestedAction: "يمكن لاحقًا تجهيز عرض ترحيبي لأول طلب أو أول زيارة.",
      hasEnoughData: !input.customers.missing && newCustomers > 0,
    },
    {
      key: "loyalty",
      title: "كوبون عملاء الولاء",
      segment: "عملاء الولاء",
      reason: input.loyaltyCards.missing
        ? "لا توجد بيانات كافية"
        : input.loyaltyCards.rows.length > 0
          ? `يوجد ${input.loyaltyCards.rows.length} بطاقة ولاء مرتبطة بالعلامة.`
          : "لا توجد بطاقات ولاء مسجلة حتى الآن.",
      suggestedAction: "يمكن لاحقًا مكافأة الزيارات المتكررة بعرض ولاء خاص.",
      hasEnoughData: !input.loyaltyCards.missing && input.loyaltyCards.rows.length > 0,
    },
    {
      key: "quietPeriod",
      title: "كوبون فترة هادئة",
      segment: "عملاء نشطون",
      reason: input.orders.missing
        ? "لا توجد بيانات كافية"
        : currentWeekOrders < previousWeekOrders
          ? `طلبات آخر 7 أيام أقل من الأيام السبعة السابقة: ${currentWeekOrders} مقابل ${previousWeekOrders}.`
          : "لا تظهر فترة هادئة واضحة من بيانات الطلبات الحالية.",
      suggestedAction: "يمكن لاحقًا تجربة عرض محدود المدة عند انخفاض الطلبات.",
      hasEnoughData: !input.orders.missing && previousWeekOrders > 0 && currentWeekOrders < previousWeekOrders,
    },
    {
      key: "weakProduct",
      title: "كوبون منتج ضعيف",
      segment: "عملاء عالي التفاعل",
      reason: weakProduct
        ? `أقل منتج ظهورًا في الطلبات المتاحة هو ${weakProduct.name} بعدد ${weakProduct.quantity}.`
        : "لا توجد بيانات كافية",
      suggestedAction: "يمكن لاحقًا ربط عرض منتج محدد إذا كانت بيانات الطلبات والمنتجات كافية.",
      hasEnoughData: Boolean(weakProduct),
    },
  ];
}

export async function getOwnerAdvancedCouponsDashboard(): Promise<AdvancedCouponsDashboardData> {
  const cafe = await requireOwnerCafeContext();
  const enabled = await hasBrandFeature(cafe.id, "advanced_coupons");

  if (!enabled) {
    return {
      enabled: false,
      cafeName: cafe.name,
    };
  }

  const supabase = advancedCouponsDb(await createClient());
  const now = new Date();

  const [offers, orders, customers, loyaltyCards, rewardRedemptions] = await Promise.all([
    safePagedRows(
      "offers",
      (from, to) =>
        supabase
          .from("offers")
          .select("id,title,status,offer_type,discount_percent,code,start_date,end_date,created_at")
          .eq("cafe_id", cafe.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(from, to),
      (row): OfferSource => ({
        id: text(row.id),
        title: text(row.title, "عرض بدون اسم"),
        status: text(row.status, "active"),
        offerType: text(row.offer_type, "عرض"),
        discountPercent: row.discount_percent === null || row.discount_percent === undefined ? null : numberValue(row.discount_percent),
        code: nullableText(row.code),
        startDate: nullableText(row.start_date),
        endDate: nullableText(row.end_date),
        createdAt: nullableText(row.created_at),
      }),
    ),
    safePagedRows(
      "orders",
      (from, to) =>
        supabase
          .from("orders")
          .select("id,customer_id,customer_name,discount_amount,total,created_at,order_items(product_id,name,quantity)")
          .eq("cafe_id", cafe.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(from, to),
      (row): OrderSource => {
        const rawItems = Array.isArray(row.order_items) ? row.order_items : [];
        return {
          id: text(row.id),
          customerId: nullableText(row.customer_id),
          customerName: text(row.customer_name, "عميل بدون اسم"),
          discountAmount: numberValue(row.discount_amount),
          total: numberValue(row.total),
          createdAt: text(row.created_at),
          items: rawItems.map((item) => {
            const record = item as Record<string, unknown>;
            return {
              productId: nullableText(record.product_id),
              name: text(record.name, "منتج بدون اسم"),
              quantity: Math.max(0, Number.parseInt(text(record.quantity, "0"), 10) || 0),
            };
          }),
        };
      },
    ),
    safePagedRows(
      "customer_profiles",
      (from, to) =>
        supabase
          .from("customer_profiles")
          .select("id,created_at")
          .eq("cafe_id", cafe.id)
          .order("created_at", { ascending: false })
          .range(from, to),
      (row): CustomerSource => ({
        id: text(row.id),
        createdAt: text(row.created_at),
      }),
    ),
    safePagedRows(
      "loyalty_cards",
      (from, to) =>
        supabase
          .from("loyalty_cards")
          .select("id,customer_profile_id")
          .eq("cafe_id", cafe.id)
          .order("updated_at", { ascending: false })
          .range(from, to),
      (row): LoyaltyCardSource => ({
        id: text(row.id),
        customerId: nullableText(row.customer_profile_id),
      }),
    ),
    safePagedRows(
      "customer_reward_redemptions",
      (from, to) =>
        supabase
          .from("customer_reward_redemptions")
          .select("id,customer_id")
          .eq("cafe_id", cafe.id)
          .order("created_at", { ascending: false })
          .range(from, to),
      (row): RewardRedemptionSource => ({
        id: text(row.id),
        customerId: nullableText(row.customer_id),
      }),
    ),
  ]);

  const missingSources = Array.from(
    new Set(
      [offers, orders, customers, loyaltyCards, rewardRedemptions]
        .filter((source) => source.missing)
        .map((source) => source.sourceName),
    ),
  );

  const discountedOrders = orders.rows.filter((order) => order.discountAmount > 0).length;
  const offerRows = buildOfferRows(offers.rows, now);
  const activeOffers = offerRows.filter((offer) => offer.status === "نشط").length;
  const expiredOffers = offerRows.filter((offer) => offer.status === "منتهي").length;
  const upcomingOffers = offerRows.filter((offer) => offer.status === "قادم").length;
  const activeCustomers = countActiveCustomers(orders.rows, daysAgo(now, 30));

  return {
    enabled: true,
    cafeName: cafe.name,
    totalOffers: offers.missing ? null : offers.rows.length,
    metrics: [
      {
        key: "activeOffers",
        label: "العروض والكوبونات النشطة",
        value: offers.missing ? null : activeOffers,
        hint: "من جدول العروض الحالي لهذه العلامة",
      },
      {
        key: "expiredOffers",
        label: "العروض المنتهية",
        value: offers.missing ? null : expiredOffers,
        hint: "حسب تاريخ النهاية أو حالة العرض",
      },
      {
        key: "upcomingOffers",
        label: "العروض القادمة",
        value: offers.missing ? null : upcomingOffers,
        hint: "العروض التي يبدأ تاريخها لاحقًا",
      },
      {
        key: "discountOrders",
        label: "طلبات بها خصم",
        value: orders.missing ? null : discountedOrders,
        hint: activeCustomers > 0 ? `مرتبطة بنشاط ${activeCustomers} عميل خلال آخر 30 يومًا` : "حسب قيمة الخصم في الطلبات",
      },
    ],
    latestOffers: offerRows.slice(0, 20),
    suggestions: buildSuggestions({
      customers,
      orders,
      loyaltyCards,
      rewardRedemptions,
      now,
    }),
    missingSources,
  };
}
