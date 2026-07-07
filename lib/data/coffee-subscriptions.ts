import { hasBrandFeature } from "@/lib/data/feature-entitlements";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";

export type CoffeeSubscriptionMetricKey =
  | "repeatCustomers"
  | "multiOrderCustomers"
  | "subscriptionProducts"
  | "loyaltyCustomers"
  | "ordersLast30"
  | "averageOrdersPerCustomer";

export type CoffeeSubscriptionMetric = {
  key: CoffeeSubscriptionMetricKey;
  label: string;
  value: string | null;
  hint: string;
};

export type CoffeeSubscriptionReadinessLevel =
  | "جاهزية عالية"
  | "جاهزية متوسطة"
  | "تحتاج بيانات أكثر";

export type CoffeeSubscriptionReadiness = {
  level: CoffeeSubscriptionReadinessLevel;
  score: number;
  reasons: string[];
};

export type CoffeeSubscriptionProductCandidate = {
  id: string;
  name: string;
  quantitySold: number;
  orderCount: number;
  averageUnitPriceValue: number | null;
  averageUnitPrice: string | null;
  signal: string;
};

export type CoffeeSubscriptionSuggestionKey =
  | "tenCups"
  | "dailyCup"
  | "employees"
  | "family"
  | "morning";

export type CoffeeSubscriptionSuggestion = {
  key: CoffeeSubscriptionSuggestionKey;
  title: string;
  description: string;
  audience: string;
  dataReason: string;
  suggestedPrice: string;
};

export type CoffeeSubscriptionsDashboardData =
  | {
      enabled: false;
      cafeName: string;
    }
  | {
      enabled: true;
      cafeName: string;
      metrics: CoffeeSubscriptionMetric[];
      readiness: CoffeeSubscriptionReadiness;
      suggestions: CoffeeSubscriptionSuggestion[];
      productCandidates: CoffeeSubscriptionProductCandidate[];
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

type CoffeeSubscriptionsQueryClient = {
  from(table: string): any;
};

type OrderItemSource = {
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
};

type OrderSource = {
  id: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  total: number;
  createdAt: string;
  items: OrderItemSource[];
};

type CustomerSource = {
  id: string;
  createdAt: string;
};

type LoyaltyCardSource = {
  id: string;
  customerId: string | null;
  totalPurchases: number;
};

type LoyaltyEventSource = {
  id: string;
  customerId: string | null;
  createdAt: string;
};

type MenuProductSource = {
  id: string;
  name: string;
  price: number;
  available: boolean;
  availableForPickup: boolean;
};

function coffeeSubscriptionsDb(client: Awaited<ReturnType<typeof createClient>>) {
  return client as unknown as CoffeeSubscriptionsQueryClient;
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

function isoDaysAgo(base: Date, days: number) {
  const date = new Date(base);
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function formatSar(value: number) {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("ar-SA", {
    maximumFractionDigits: 1,
  }).format(value);
}

function nestedRecord(value: unknown) {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return undefined;
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

function ordersByCustomer(orders: OrderSource[]) {
  const map = new Map<string, OrderSource[]>();

  for (const order of orders) {
    const key = customerKey(order);
    if (!key) continue;
    const current = map.get(key) ?? [];
    current.push(order);
    map.set(key, current);
  }

  return map;
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

function buildProductCandidates(input: {
  orders: OrderSource[];
  menuProducts: MenuProductSource[];
}): CoffeeSubscriptionProductCandidate[] {
  const availableProducts = new Map(
    input.menuProducts
      .filter((product) => product.available && product.availableForPickup)
      .map((product) => [product.id, product]),
  );
  const products = new Map<
    string,
    {
      name: string;
      quantitySold: number;
      orderIds: Set<string>;
      revenue: number;
    }
  >();

  for (const order of input.orders) {
    for (const item of order.items) {
      const key = item.productId ?? `name:${item.name}`;
      if (!key) continue;
      if (item.productId && availableProducts.size && !availableProducts.has(item.productId)) continue;
      const current = products.get(key) ?? {
        name: item.productId ? availableProducts.get(item.productId)?.name ?? item.name : item.name,
        quantitySold: 0,
        orderIds: new Set<string>(),
        revenue: 0,
      };
      current.quantitySold += item.quantity;
      current.orderIds.add(order.id);
      current.revenue += item.unitPrice * item.quantity;
      products.set(key, current);
    }
  }

  return [...products.entries()]
    .filter(([, product]) => product.quantitySold > 0)
    .sort((a, b) => b[1].quantitySold - a[1].quantitySold)
    .slice(0, 10)
    .map(([id, product]): CoffeeSubscriptionProductCandidate => {
      const averageUnit = product.quantitySold > 0 ? product.revenue / product.quantitySold : 0;
      return {
        id,
        name: product.name,
        quantitySold: product.quantitySold,
        orderCount: product.orderIds.size,
        averageUnitPriceValue: averageUnit > 0 ? averageUnit : null,
        averageUnitPrice: averageUnit > 0 ? formatSar(averageUnit) : null,
        signal: "منتج متكرر في الطلبات ويمكن اختباره كجزء من باقة اشتراك.",
      };
    });
}

function countMorningOrders(orders: OrderSource[]) {
  return orders.filter((order) => {
    const date = new Date(order.createdAt);
    if (Number.isNaN(date.getTime())) return false;
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: "Asia/Riyadh",
      }).format(date),
    );
    return hour >= 5 && hour < 12;
  }).length;
}

function suggestedTenCupPrice(products: CoffeeSubscriptionProductCandidate[]) {
  const candidate = products.find((product) => product.averageUnitPriceValue);
  if (!candidate?.averageUnitPriceValue) return "يحدد لاحقًا";
  return candidate.averageUnitPriceValue > 0
    ? `تقديري غير ملزم: ${formatSar(candidate.averageUnitPriceValue * 10)}`
    : "يحدد لاحقًا";
}

function buildReadiness(input: {
  hasOrders: boolean;
  hasRepeatCustomers: boolean;
  hasLoyalty: boolean;
  hasProducts: boolean;
}): CoffeeSubscriptionReadiness {
  const reasons: string[] = [];
  let score = 0;

  if (input.hasOrders) {
    score += 1;
    reasons.push("توجد طلبات فعلية يمكن تحليلها.");
  } else {
    reasons.push("تحتاج العلامة إلى طلبات أكثر قبل قياس الاشتراكات بدقة.");
  }

  if (input.hasRepeatCustomers) {
    score += 1;
    reasons.push("يوجد عملاء متكررون يمكن اختبار باقات شهرية معهم.");
  } else {
    reasons.push("لا يظهر تكرار كاف للعملاء حتى الآن.");
  }

  if (input.hasLoyalty) {
    score += 1;
    reasons.push("وجود الولاء يساعد على متابعة الاستخدام والتكرار.");
  } else {
    reasons.push("تفعيل الولاء أو زيادة استخدامه سيحسن دقة الاشتراكات.");
  }

  if (input.hasProducts) {
    score += 1;
    reasons.push("توجد منتجات متكررة مناسبة للتجربة كباقات.");
  } else {
    reasons.push("تحتاج الصفحة إلى بيانات منتجات مباعة أكثر لاختيار باقات مناسبة.");
  }

  return {
    level: score >= 3 ? "جاهزية عالية" : score >= 2 ? "جاهزية متوسطة" : "تحتاج بيانات أكثر",
    score,
    reasons,
  };
}

function buildSuggestions(input: {
  products: CoffeeSubscriptionProductCandidate[];
  repeatCustomers: number;
  multiOrderCustomers: number;
  loyaltyCustomers: number;
  ordersLast30: number;
  morningOrders: number;
}): CoffeeSubscriptionSuggestion[] {
  const topProduct = input.products[0];
  const hasProductData = Boolean(topProduct);

  return [
    {
      key: "tenCups",
      title: "اشتراك 10 أكواب شهريًا",
      description: "باقة شهرية مرنة لعملاء القهوة المتكررين.",
      audience: "العملاء الذين يطلبون أكثر من مرة خلال الشهر.",
      dataReason: hasProductData
        ? `أقوى منتج مرشح حاليًا هو ${topProduct.name} بعدد ${topProduct.quantitySold} وحدة مباعة.`
        : "لا توجد بيانات كافية",
      suggestedPrice: suggestedTenCupPrice(input.products),
    },
    {
      key: "dailyCup",
      title: "اشتراك كوب يومي",
      description: "تصور مبدئي لباقة يومية للعميل المنتظم.",
      audience: "العملاء أصحاب الروتين اليومي أو شبه اليومي.",
      dataReason: input.ordersLast30 > 0
        ? `يوجد ${input.ordersLast30} طلب خلال آخر 30 يومًا يمكن مراقبتها قبل التسعير.`
        : "لا توجد بيانات كافية",
      suggestedPrice: "يحدد لاحقًا",
    },
    {
      key: "employees",
      title: "اشتراك موظفين",
      description: "باقة يمكن استخدامها لاحقًا للفرق الصغيرة أو مكاتب الشركات.",
      audience: "الشركات والفرق التي تشتري بشكل متكرر.",
      dataReason: input.multiOrderCustomers > 0
        ? `يوجد ${input.multiOrderCustomers} عميل لديه أكثر من طلب.`
        : "لا توجد بيانات كافية",
      suggestedPrice: "يحدد لاحقًا",
    },
    {
      key: "family",
      title: "اشتراك عائلي",
      description: "باقة مشاركة يمكن التفكير بها للطلبات المتكررة والمتعددة.",
      audience: "العائلات أو المجموعات الصغيرة.",
      dataReason: input.repeatCustomers > 0
        ? `يوجد ${input.repeatCustomers} عميل متكرر عبر الطلبات أو الولاء.`
        : input.loyaltyCustomers > 0
          ? `يوجد ${input.loyaltyCustomers} عميل ولاء يمكن مراقبة تكراره قبل إطلاق الباقة.`
        : "لا توجد بيانات كافية",
      suggestedPrice: "يحدد لاحقًا",
    },
    {
      key: "morning",
      title: "باقة صباحية",
      description: "باقة مخصصة لفترة بداية اليوم إذا أظهرت الطلبات نشاطًا صباحيًا.",
      audience: "عملاء القهوة الصباحية.",
      dataReason: input.morningOrders > 0
        ? `يوجد ${input.morningOrders} طلب صباحي في البيانات المتاحة.`
        : "لا توجد بيانات كافية",
      suggestedPrice: "يحدد لاحقًا",
    },
  ];
}

export async function getOwnerCoffeeSubscriptionsDashboard(): Promise<CoffeeSubscriptionsDashboardData> {
  const cafe = await requireOwnerCafeContext();
  const enabled = await hasBrandFeature(cafe.id, "coffee_subscriptions");

  if (!enabled) {
    return {
      enabled: false,
      cafeName: cafe.name,
    };
  }

  const supabase = coffeeSubscriptionsDb(await createClient());
  const now = new Date();
  const thirtyDaysAgo = isoDaysAgo(now, 30);

  const [orders, customers, loyaltyCards, loyaltyEvents, menuProducts] = await Promise.all([
    safePagedRows(
      "orders",
      (from, to) =>
        supabase
          .from("orders")
          .select("id,customer_id,customer_name,customer_phone,total,created_at,order_items(product_id,name,quantity,unit_price)")
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
          customerPhone: nullableText(row.customer_phone),
          total: numberValue(row.total),
          createdAt: text(row.created_at),
          items: rawItems.map((item) => {
            const record = item as Record<string, unknown>;
            return {
              productId: nullableText(record.product_id),
              name: text(record.name, "منتج بدون اسم"),
              quantity: intValue(record.quantity),
              unitPrice: numberValue(record.unit_price),
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
      "menu_products",
      (from, to) =>
        supabase
          .from("menu_products")
          .select("id,name,price,available,available_for_pickup")
          .eq("cafe_id", cafe.id)
          .is("deleted_at", null)
          .order("sort_order", { ascending: true })
          .range(from, to),
      (row): MenuProductSource => ({
        id: text(row.id),
        name: text(row.name, "منتج بدون اسم"),
        price: numberValue(row.price),
        available: Boolean(row.available),
        availableForPickup: Boolean(row.available_for_pickup),
      }),
    ),
  ]);

  const missingSources = Array.from(
    new Set(
      [orders, customers, loyaltyCards, loyaltyEvents, menuProducts]
        .filter((source) => source.missing)
        .map((source) => source.sourceName),
    ),
  );
  const groupedOrders = ordersByCustomer(orders.rows);
  const knownCustomerCount = groupedOrders.size;
  const multiOrderCustomers = [...groupedOrders.values()].filter((customerOrders) => customerOrders.length > 1).length;
  const repeatCustomers = countRepeatCustomers(orders.rows, loyaltyEvents.rows);
  const ordersLast30 = orders.rows.filter((order) => order.createdAt >= thirtyDaysAgo).length;
  const averageOrdersPerCustomer = knownCustomerCount > 0 ? orders.rows.length / knownCustomerCount : null;
  const productCandidates = buildProductCandidates({
    orders: orders.rows,
    menuProducts: menuProducts.rows,
  });
  const loyaltyCustomers = loyaltyCards.rows.length;
  const morningOrders = countMorningOrders(orders.rows);
  const readiness = buildReadiness({
    hasOrders: !orders.missing && orders.rows.length > 0,
    hasRepeatCustomers: repeatCustomers > 0,
    hasLoyalty: !loyaltyCards.missing && loyaltyCustomers > 0,
    hasProducts: productCandidates.length > 0,
  });

  return {
    enabled: true,
    cafeName: cafe.name,
    metrics: [
      {
        key: "repeatCustomers",
        label: "العملاء المتكررون",
        value: orders.missing && loyaltyEvents.missing ? null : String(repeatCustomers),
        hint: "حسب تكرار الطلبات أو نشاط الولاء",
      },
      {
        key: "multiOrderCustomers",
        label: "عملاء لديهم أكثر من طلب",
        value: orders.missing ? null : String(multiOrderCustomers),
        hint: "من الطلبات المرتبطة بعميل أو رقم جوال",
      },
      {
        key: "subscriptionProducts",
        label: "منتجات مناسبة للاشتراك",
        value: orders.missing || menuProducts.missing ? null : String(productCandidates.length),
        hint: "من المنتجات المتكررة داخل الطلبات",
      },
      {
        key: "loyaltyCustomers",
        label: "عملاء الولاء",
        value: loyaltyCards.missing ? null : String(loyaltyCustomers),
        hint: "من بطاقات الولاء المرتبطة بالعلامة",
      },
      {
        key: "ordersLast30",
        label: "طلبات آخر 30 يومًا",
        value: orders.missing ? null : String(ordersLast30),
        hint: "مؤشر على نشاط الفترة الحالية",
      },
      {
        key: "averageOrdersPerCustomer",
        label: "متوسط الطلبات لكل عميل",
        value: averageOrdersPerCustomer === null || orders.missing ? null : formatDecimal(averageOrdersPerCustomer),
        hint: customers.missing ? "حسب العملاء المعروفين من الطلبات" : "يدعم تقدير ملاءمة الاشتراكات",
      },
    ],
    readiness,
    suggestions: buildSuggestions({
      products: productCandidates,
      repeatCustomers,
      multiOrderCustomers,
      loyaltyCustomers,
      ordersLast30,
      morningOrders,
    }),
    productCandidates,
    missingSources,
  };
}
