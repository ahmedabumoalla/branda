import { hasBrandFeature } from "@/lib/data/feature-entitlements";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";
import type { PlatformFeatureId } from "@/lib/platform/feature-registry";

export type V1Metric = {
  label: string;
  value: string | null;
  hint: string;
};

export type V1Suggestion = {
  title: string;
  description: string;
  reason: string;
  actionLabel: string;
};

export type V1TableColumn = {
  key: "name" | "metric" | "detail";
  label: string;
};

export type V1TableRow = {
  id: string;
  name: string;
  metric: string;
  detail: string;
};

export type V1Readiness = {
  level: "جاهزية عالية" | "جاهزية متوسطة" | "تحتاج بيانات أكثر";
  score: number;
  reasons: string[];
};

export type V1FeatureDashboardData =
  | {
      enabled: false;
      cafeName: string;
    }
  | {
      enabled: true;
      cafeName: string;
      title: string;
      badge: string;
      summary: string;
      disabledActionLabel: string;
      alert?: string;
      metrics: V1Metric[];
      readiness: V1Readiness;
      suggestions: V1Suggestion[];
      tableTitle: string;
      tableColumns: V1TableColumn[];
      tableRows: V1TableRow[];
      missingSources: string[];
      sourceTables: string[];
    };

export type V1FeatureConfig = {
  featureId: PlatformFeatureId;
  title: string;
  badge: string;
  summary: string;
  disabledActionLabel: string;
  alert?: string;
  tableTitle: string;
  sourceTables: string[];
  build: (facts: V1Facts) => {
    metrics: V1Metric[];
    readiness: V1Readiness;
    suggestions: V1Suggestion[];
    tableRows: V1TableRow[];
  };
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

type QueryClient = {
  from(table: string): any;
};

export type OrderSource = {
  id: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  status: string;
  total: number;
  createdAt: string;
  items: OrderItemSource[];
};

export type OrderItemSource = {
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type ProductSource = {
  id: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
  imageUrl: string | null;
};

export type OfferSource = {
  id: string;
  title: string;
  status: string;
  visible: boolean;
  startDate: string | null;
  endDate: string | null;
};

export type LoyaltyCardSource = {
  id: string;
  customerId: string | null;
  totalPurchases: number;
};

export type LoyaltyEventSource = {
  id: string;
  customerId: string | null;
  createdAt: string;
};

export type SimpleSource = {
  id: string;
  createdAt: string | null;
};

export type ProductSignal = {
  id: string;
  name: string;
  quantity: number;
  orderCount: number;
  revenue: number;
  hasImage: boolean;
  hasDescription: boolean;
};

export type V1Facts = {
  cafeName: string;
  missingSources: string[];
  orders: OrderSource[];
  customers: SimpleSource[];
  products: ProductSource[];
  offers: OfferSource[];
  loyaltyCards: LoyaltyCardSource[];
  loyaltyEvents: LoyaltyEventSource[];
  rewardRedemptions: SimpleSource[];
  rewardInstances: SimpleSource[];
  branches: SimpleSource[];
  visits: SimpleSource[];
  now: Date;
  cutoff30: string;
  productSignals: ProductSignal[];
  repeatCustomers: number;
  atRiskCustomers: number;
  loyaltyCustomerCount: number;
  ordersLast30: number;
  acceptedOrders: number;
  rejectedOrders: number;
  activeOffers: number;
};

function db(client: Awaited<ReturnType<typeof createClient>>) {
  return client as unknown as QueryClient;
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

function intValue(value: unknown) {
  return Math.max(0, Math.trunc(numberValue(value)));
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

export function metricValue(value: number | null) {
  return value === null ? null : String(value);
}

export function decimalMetric(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(value);
}

export function sarMetric(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function buildReadiness(checks: Array<{ ok: boolean; yes: string; no: string }>): V1Readiness {
  const score = checks.filter((check) => check.ok).length;
  return {
    level: score >= 3 ? "جاهزية عالية" : score >= 2 ? "جاهزية متوسطة" : "تحتاج بيانات أكثر",
    score,
    reasons: checks.map((check) => (check.ok ? check.yes : check.no)),
  };
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

function customerKey(order: OrderSource) {
  return order.customerId ?? (order.customerPhone ? `phone:${order.customerPhone}` : null);
}

function countRepeatCustomers(orders: OrderSource[], loyaltyEvents: LoyaltyEventSource[]) {
  const activity = new Map<string, number>();

  for (const order of orders) {
    const key = customerKey(order);
    if (!key) continue;
    activity.set(key, (activity.get(key) ?? 0) + 1);
  }

  for (const event of loyaltyEvents) {
    if (!event.customerId) continue;
    activity.set(event.customerId, (activity.get(event.customerId) ?? 0) + 1);
  }

  return [...activity.values()].filter((count) => count > 1).length;
}

function countAtRiskCustomers(orders: OrderSource[], cutoff: string) {
  const active = new Set<string>();
  const historical = new Set<string>();

  for (const order of orders) {
    const key = customerKey(order);
    if (!key) continue;
    if (order.createdAt >= cutoff) active.add(key);
    else historical.add(key);
  }

  return [...historical].filter((key) => !active.has(key)).length;
}

function productSignals(orders: OrderSource[], products: ProductSource[]) {
  const byId = new Map(products.map((product) => [product.id, product]));
  const map = new Map<string, ProductSignal>();

  for (const order of orders) {
    for (const item of order.items) {
      const key = item.productId ?? `name:${item.name}`;
      const product = item.productId ? byId.get(item.productId) : undefined;
      const current = map.get(key) ?? {
        id: key,
        name: product?.name ?? item.name,
        quantity: 0,
        orderCount: 0,
        revenue: 0,
        hasImage: Boolean(product?.imageUrl),
        hasDescription: Boolean(product?.description),
      };
      current.quantity += item.quantity;
      current.orderCount += 1;
      current.revenue += item.quantity * item.unitPrice;
      map.set(key, current);
    }
  }

  return [...map.values()].sort((a, b) => b.quantity - a.quantity);
}

function normalizeOfferActive(offer: OfferSource, now: Date) {
  const raw = offer.status.toLowerCase();
  const end = offer.endDate ? new Date(`${offer.endDate}T23:59:59`) : null;
  if (!offer.visible) return false;
  if (raw === "inactive" || raw === "expired" || raw === "draft") return false;
  if (end && !Number.isNaN(end.getTime()) && end < now) return false;
  return true;
}

function acceptedStatus(status: string) {
  const raw = status.toLowerCase();
  return ["accepted", "completed", "ready", "picked_up", "delivered", "preparing", "paid"].some((item) =>
    raw.includes(item),
  );
}

function rejectedStatus(status: string) {
  const raw = status.toLowerCase();
  return raw.includes("reject") || raw.includes("cancel");
}

async function collectFacts(): Promise<V1Facts> {
  const cafe = await requireOwnerCafeContext();
  const supabase = db(await createClient());
  const now = new Date();
  const cutoff30 = isoDaysAgo(now, 30);

  const [orders, customers, products, offers, loyaltyCards, loyaltyEvents, rewardRedemptions, rewardInstances, branches, visits] =
    await Promise.all([
      safePagedRows(
        "orders",
        (from, to) =>
          supabase
            .from("orders")
            .select("id,customer_id,customer_name,customer_phone,status,total,created_at,order_items(product_id,name,quantity,unit_price)")
            .eq("cafe_id", cafe.id)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .range(from, to),
        (row): OrderSource => ({
          id: text(row.id),
          customerId: nullableText(row.customer_id),
          customerName: text(row.customer_name, "عميل بدون اسم"),
          customerPhone: nullableText(row.customer_phone),
          status: text(row.status),
          total: numberValue(row.total),
          createdAt: text(row.created_at),
          items: (Array.isArray(row.order_items) ? row.order_items : []).map((item) => {
            const record = item as Record<string, unknown>;
            return {
              productId: nullableText(record.product_id),
              name: text(record.name, "منتج بدون اسم"),
              quantity: intValue(record.quantity),
              unitPrice: numberValue(record.unit_price),
            };
          }),
        }),
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
        (row): SimpleSource => ({ id: text(row.id), createdAt: nullableText(row.created_at) }),
      ),
      safePagedRows(
        "menu_products",
        (from, to) =>
          supabase
            .from("menu_products")
            .select("id,name,description,price,available,image_url")
            .eq("cafe_id", cafe.id)
            .is("deleted_at", null)
            .order("sort_order", { ascending: true })
            .range(from, to),
        (row): ProductSource => ({
          id: text(row.id),
          name: text(row.name, "منتج بدون اسم"),
          description: text(row.description),
          price: numberValue(row.price),
          available: Boolean(row.available),
          imageUrl: nullableText(row.image_url),
        }),
      ),
      safePagedRows(
        "offers",
        (from, to) =>
          supabase
            .from("offers")
            .select("id,title,status,visible_in_cafe,start_date,end_date")
            .eq("cafe_id", cafe.id)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .range(from, to),
        (row): OfferSource => ({
          id: text(row.id),
          title: text(row.title, "عرض بدون اسم"),
          status: text(row.status),
          visible: Boolean(row.visible_in_cafe),
          startDate: nullableText(row.start_date),
          endDate: nullableText(row.end_date),
        }),
      ),
      safePagedRows(
        "loyalty_cards",
        (from, to) =>
          supabase
            .from("loyalty_cards")
            .select("id,customer_profile_id,total_purchases")
            .eq("cafe_id", cafe.id)
            .order("updated_at", { ascending: false })
            .range(from, to),
        (row): LoyaltyCardSource => ({
          id: text(row.id),
          customerId: nullableText(row.customer_profile_id),
          totalPurchases: intValue(row.total_purchases),
        }),
      ),
      safePagedRows(
        "loyalty_card_events",
        (from, to) =>
          supabase
            .from("loyalty_card_events")
            .select("id,created_at,loyalty_cards!loyalty_card_events_card_same_cafe(customer_profile_id)")
            .eq("cafe_id", cafe.id)
            .order("created_at", { ascending: false })
            .range(from, to),
        (row): LoyaltyEventSource => {
          const card = nestedRecord(row.loyalty_cards);
          return {
            id: text(row.id),
            customerId: nullableText(card?.customer_profile_id),
            createdAt: text(row.created_at),
          };
        },
      ),
      safePagedRows(
        "customer_reward_redemptions",
        (from, to) =>
          supabase
            .from("customer_reward_redemptions")
            .select("id,created_at")
            .eq("cafe_id", cafe.id)
            .order("created_at", { ascending: false })
            .range(from, to),
        (row): SimpleSource => ({ id: text(row.id), createdAt: nullableText(row.created_at) }),
      ),
      safePagedRows(
        "customer_reward_instances",
        (from, to) =>
          supabase
            .from("customer_reward_instances")
            .select("id,created_at")
            .eq("cafe_id", cafe.id)
            .order("created_at", { ascending: false })
            .range(from, to),
        (row): SimpleSource => ({ id: text(row.id), createdAt: nullableText(row.created_at) }),
      ),
      safePagedRows(
        "branches",
        (from, to) =>
          supabase
            .from("branches")
            .select("id,created_at")
            .eq("cafe_id", cafe.id)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .range(from, to),
        (row): SimpleSource => ({ id: text(row.id), createdAt: nullableText(row.created_at) }),
      ),
      safePagedRows(
        "cafe_visit_events",
        (from, to) =>
          supabase
            .from("cafe_visit_events")
            .select("id,created_at")
            .eq("cafe_id", cafe.id)
            .order("created_at", { ascending: false })
            .range(from, to),
        (row): SimpleSource => ({ id: text(row.id), createdAt: nullableText(row.created_at) }),
      ),
    ]);

  const missingSources = [orders, customers, products, offers, loyaltyCards, loyaltyEvents, rewardRedemptions, rewardInstances, branches, visits]
    .filter((source) => source.missing)
    .map((source) => source.sourceName);
  const orderRows = orders.rows;

  return {
    cafeName: cafe.name,
    missingSources: Array.from(new Set(missingSources)),
    orders: orderRows,
    customers: customers.rows,
    products: products.rows,
    offers: offers.rows,
    loyaltyCards: loyaltyCards.rows,
    loyaltyEvents: loyaltyEvents.rows,
    rewardRedemptions: rewardRedemptions.rows,
    rewardInstances: rewardInstances.rows,
    branches: branches.rows,
    visits: visits.rows,
    now,
    cutoff30,
    productSignals: productSignals(orderRows, products.rows),
    repeatCustomers: countRepeatCustomers(orderRows, loyaltyEvents.rows),
    atRiskCustomers: countAtRiskCustomers(orderRows, cutoff30),
    loyaltyCustomerCount: loyaltyCards.rows.length,
    ordersLast30: orderRows.filter((order) => order.createdAt >= cutoff30).length,
    acceptedOrders: orderRows.filter((order) => acceptedStatus(order.status)).length,
    rejectedOrders: orderRows.filter((order) => rejectedStatus(order.status)).length,
    activeOffers: offers.rows.filter((offer) => normalizeOfferActive(offer, now)).length,
  };
}

export async function getOwnerV1FeatureDashboard(config: V1FeatureConfig): Promise<V1FeatureDashboardData> {
  const cafe = await requireOwnerCafeContext();
  const enabled = await hasBrandFeature(cafe.id, config.featureId);

  if (!enabled) {
    return {
      enabled: false,
      cafeName: cafe.name,
    };
  }

  const facts = await collectFacts();
  const built = config.build(facts);

  return {
    enabled: true,
    cafeName: facts.cafeName,
    title: config.title,
    badge: config.badge,
    summary: config.summary,
    disabledActionLabel: config.disabledActionLabel,
    alert: config.alert,
    metrics: built.metrics,
    readiness: built.readiness,
    suggestions: built.suggestions,
    tableTitle: config.tableTitle,
    tableColumns: [
      { key: "name", label: "العنصر" },
      { key: "metric", label: "المؤشر" },
      { key: "detail", label: "التفصيل" },
    ],
    tableRows: built.tableRows,
    missingSources: facts.missingSources,
    sourceTables: config.sourceTables,
  };
}
