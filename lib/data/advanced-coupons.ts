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

export type BrandCouponDiscountType = "percentage" | "fixed";
export type BrandCouponStatus = "draft" | "active" | "paused" | "expired";
export type BrandCouponTargetSegment =
  | "all"
  | "new_customers"
  | "inactive_customers"
  | "loyalty_customers"
  | "high_value_customers";

export type BrandCouponFormInput = {
  code: unknown;
  title: unknown;
  description?: unknown;
  discountType: unknown;
  discountValue: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  maxRedemptions?: unknown;
  maxRedemptionsPerCustomer?: unknown;
  minimumOrderAmount?: unknown;
  targetSegment: unknown;
  status: unknown;
};

export type BrandCouponPayload = {
  code: string;
  title: string;
  description: string | null;
  discountType: BrandCouponDiscountType;
  discountValue: number;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxRedemptionsPerCustomer: number | null;
  minimumOrderAmount: number;
  targetSegment: BrandCouponTargetSegment;
  status: BrandCouponStatus;
};

export type BrandCouponRow = BrandCouponPayload & {
  id: string;
  createdAt: string | null;
  updatedAt: string | null;
  usageCount: number;
  totalDiscountAmount: number;
};

export type BrandCouponRedemptionRow = {
  id: string;
  couponId: string;
  couponCode: string;
  couponTitle: string;
  customerName: string;
  orderId: string | null;
  discountAmount: number;
  redeemedAt: string;
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
      brandCoupons: BrandCouponRow[];
      latestRedemptions: BrandCouponRedemptionRow[];
      couponUsageTotal: number;
      couponDiscountTotal: number;
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

type BrandCouponSource = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  discountType: BrandCouponDiscountType;
  discountValue: number;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxRedemptionsPerCustomer: number | null;
  minimumOrderAmount: number;
  targetSegment: BrandCouponTargetSegment;
  status: BrandCouponStatus;
  createdAt: string | null;
  updatedAt: string | null;
};

type RedemptionSource = {
  id: string;
  couponId: string;
  customerId: string | null;
  orderId: string | null;
  discountAmount: number;
  redeemedAt: string;
};

const discountTypes = ["percentage", "fixed"] as const;
const couponStatuses = ["draft", "active", "paused", "expired"] as const;
const targetSegments = [
  "all",
  "new_customers",
  "inactive_customers",
  "loyalty_customers",
  "high_value_customers",
] as const;

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

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || text(value) === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
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

function normalizeDateInput(value: unknown, fieldName: string) {
  const raw = nullableText(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} غير صالح.`);
  }
  return date.toISOString();
}

function positiveNumberInput(value: unknown, fieldName: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${fieldName} يجب أن يكون أكبر من صفر.`);
  }
  return amount;
}

function nonNegativeNumberInput(value: unknown, fieldName: string) {
  if (value === null || value === undefined || text(value) === "") return 0;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${fieldName} يجب أن يكون صفرًا أو أكثر.`);
  }
  return amount;
}

function optionalPositiveIntegerInput(value: unknown, fieldName: string) {
  if (value === null || value === undefined || text(value) === "") return null;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${fieldName} يجب أن يكون رقمًا صحيحًا أكبر من صفر.`);
  }
  return amount;
}

function isDiscountType(value: string): value is BrandCouponDiscountType {
  return discountTypes.includes(value as BrandCouponDiscountType);
}

function isCouponStatus(value: string): value is BrandCouponStatus {
  return couponStatuses.includes(value as BrandCouponStatus);
}

function isTargetSegment(value: string): value is BrandCouponTargetSegment {
  return targetSegments.includes(value as BrandCouponTargetSegment);
}

function mapDbError(error: unknown) {
  const record = error as { code?: string; message?: string } | null;
  const message = record?.message ?? "";

  if (record?.code === "23505" || message.includes("idx_brand_coupons_cafe_code_lower")) {
    return new Error("كود الكوبون مستخدم بالفعل لهذه العلامة.");
  }

  if (record?.code === "42501" || message.toLowerCase().includes("permission")) {
    return new Error("لا تملك صلاحية إدارة كوبونات هذه العلامة.");
  }

  return error instanceof Error ? error : new Error("تعذر حفظ الكوبون. حاول مرة أخرى.");
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
      suggestedAction: "يمكن لاحقًا إنشاء عرض استرجاع مخصص لهذه الشريحة من نظام الكوبونات.",
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

function mapBrandCoupon(row: Record<string, unknown>): BrandCouponSource {
  const discountType = text(row.discount_type, "fixed");
  const status = text(row.status, "draft");
  const targetSegment = text(row.target_segment, "all");

  return {
    id: text(row.id),
    code: text(row.code),
    title: text(row.title, "كوبون بدون اسم"),
    description: nullableText(row.description),
    discountType: isDiscountType(discountType) ? discountType : "fixed",
    discountValue: numberValue(row.discount_value),
    startsAt: nullableText(row.starts_at),
    endsAt: nullableText(row.ends_at),
    maxRedemptions: nullableNumber(row.max_redemptions),
    maxRedemptionsPerCustomer: nullableNumber(row.max_redemptions_per_customer),
    minimumOrderAmount: numberValue(row.minimum_order_amount),
    targetSegment: isTargetSegment(targetSegment) ? targetSegment : "all",
    status: isCouponStatus(status) ? status : "draft",
    createdAt: nullableText(row.created_at),
    updatedAt: nullableText(row.updated_at),
  };
}

function mapRedemption(row: Record<string, unknown>): RedemptionSource {
  return {
    id: text(row.id),
    couponId: text(row.coupon_id),
    customerId: nullableText(row.customer_id),
    orderId: nullableText(row.order_id),
    discountAmount: numberValue(row.discount_amount),
    redeemedAt: text(row.redeemed_at, text(row.created_at, new Date().toISOString())),
  };
}

function buildBrandCouponRows(coupons: BrandCouponSource[], redemptions: RedemptionSource[]): BrandCouponRow[] {
  const usage = new Map<string, { count: number; total: number }>();

  for (const redemption of redemptions) {
    const current = usage.get(redemption.couponId) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += redemption.discountAmount;
    usage.set(redemption.couponId, current);
  }

  return coupons.map((coupon) => {
    const current = usage.get(coupon.id) ?? { count: 0, total: 0 };
    return {
      ...coupon,
      usageCount: current.count,
      totalDiscountAmount: current.total,
    };
  });
}

export function validateBrandCouponInput(input: BrandCouponFormInput): BrandCouponPayload {
  const code = text(input.code).toUpperCase();
  const title = text(input.title);
  const discountType = text(input.discountType);
  const status = text(input.status, "draft");
  const targetSegment = text(input.targetSegment, "all");
  const discountValue = positiveNumberInput(input.discountValue, "قيمة الخصم");
  const minimumOrderAmount = nonNegativeNumberInput(input.minimumOrderAmount, "الحد الأدنى للطلب");
  const startsAt = normalizeDateInput(input.startsAt, "تاريخ البداية");
  const endsAt = normalizeDateInput(input.endsAt, "تاريخ النهاية");

  if (!code) throw new Error("كود الكوبون مطلوب.");
  if (!title) throw new Error("عنوان الكوبون مطلوب.");
  if (!isDiscountType(discountType)) throw new Error("نوع الخصم غير صالح.");
  if (!isTargetSegment(targetSegment)) throw new Error("الشريحة المستهدفة غير صالحة.");
  if (!isCouponStatus(status)) throw new Error("حالة الكوبون غير صالحة.");
  if (discountType === "percentage" && discountValue > 100) {
    throw new Error("قيمة الخصم بالنسبة المئوية لا يمكن أن تتجاوز 100.");
  }
  if (startsAt && endsAt && new Date(startsAt).getTime() > new Date(endsAt).getTime()) {
    throw new Error("تاريخ البداية يجب أن يكون قبل تاريخ النهاية.");
  }

  return {
    code,
    title,
    description: nullableText(input.description),
    discountType,
    discountValue,
    startsAt,
    endsAt,
    maxRedemptions: optionalPositiveIntegerInput(input.maxRedemptions, "حد الاستخدام الكلي"),
    maxRedemptionsPerCustomer: optionalPositiveIntegerInput(input.maxRedemptionsPerCustomer, "حد الاستخدام لكل عميل"),
    minimumOrderAmount,
    targetSegment,
    status,
  };
}

async function requireAdvancedCouponsAccess() {
  const cafe = await requireOwnerCafeContext();
  const enabled = await hasBrandFeature(cafe.id, "advanced_coupons");

  if (!enabled) {
    throw new Error("الكوبونات المتقدمة غير مفعلة لهذه العلامة.");
  }

  const supabase = advancedCouponsDb(await createClient());
  const {
    data: { user },
  } = await (supabase as Awaited<ReturnType<typeof createClient>>).auth.getUser();

  if (!user) {
    throw new Error("يجب تسجيل الدخول لإدارة الكوبونات.");
  }

  return { cafe, supabase, userId: user.id };
}

function toDbPayload(payload: BrandCouponPayload, cafeId: string, userId?: string) {
  return {
    cafe_id: cafeId,
    code: payload.code,
    title: payload.title,
    description: payload.description,
    discount_type: payload.discountType,
    discount_value: payload.discountValue,
    starts_at: payload.startsAt,
    ends_at: payload.endsAt,
    max_redemptions: payload.maxRedemptions,
    max_redemptions_per_customer: payload.maxRedemptionsPerCustomer,
    minimum_order_amount: payload.minimumOrderAmount,
    target_segment: payload.targetSegment,
    status: payload.status,
    ...(userId ? { created_by: userId } : {}),
  };
}

export async function createOwnerBrandCoupon(input: BrandCouponFormInput) {
  const payload = validateBrandCouponInput(input);
  const { cafe, supabase, userId } = await requireAdvancedCouponsAccess();

  const { error } = await supabase
    .from("brand_coupons")
    .insert(toDbPayload(payload, cafe.id, userId));

  if (error) throw mapDbError(error);
}

export async function updateOwnerBrandCoupon(couponId: string, input: BrandCouponFormInput) {
  const id = text(couponId);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("معرف الكوبون غير صالح.");

  const payload = validateBrandCouponInput(input);
  const { cafe, supabase } = await requireAdvancedCouponsAccess();

  const { data: existing, error: lookupError } = await supabase
    .from("brand_coupons")
    .select("id")
    .eq("id", id)
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (lookupError) throw mapDbError(lookupError);
  if (!existing) throw new Error("الكوبون غير موجود لهذه العلامة.");

  const { error } = await supabase
    .from("brand_coupons")
    .update(toDbPayload(payload, cafe.id))
    .eq("id", id)
    .eq("cafe_id", cafe.id);

  if (error) throw mapDbError(error);
}

export async function updateOwnerBrandCouponStatus(couponId: string, status: BrandCouponStatus) {
  const id = text(couponId);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("معرف الكوبون غير صالح.");
  if (!isCouponStatus(status)) throw new Error("حالة الكوبون غير صالحة.");

  const { cafe, supabase } = await requireAdvancedCouponsAccess();
  const { data: existing, error: lookupError } = await supabase
    .from("brand_coupons")
    .select("id")
    .eq("id", id)
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (lookupError) throw mapDbError(lookupError);
  if (!existing) throw new Error("الكوبون غير موجود لهذه العلامة.");

  const { error } = await supabase
    .from("brand_coupons")
    .update({ status })
    .eq("id", id)
    .eq("cafe_id", cafe.id);

  if (error) throw mapDbError(error);
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

  const [offers, orders, customers, loyaltyCards, rewardRedemptions, brandCoupons, redemptions] = await Promise.all([
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
    safePagedRows(
      "brand_coupons",
      (from, to) =>
        supabase
          .from("brand_coupons")
          .select("id,code,title,description,discount_type,discount_value,starts_at,ends_at,max_redemptions,max_redemptions_per_customer,minimum_order_amount,target_segment,status,created_at,updated_at")
          .eq("cafe_id", cafe.id)
          .order("created_at", { ascending: false })
          .range(from, to),
      mapBrandCoupon,
    ),
    safePagedRows(
      "brand_coupon_redemptions",
      (from, to) =>
        supabase
          .from("brand_coupon_redemptions")
          .select("id,coupon_id,customer_id,order_id,discount_amount,redeemed_at,created_at")
          .eq("cafe_id", cafe.id)
          .order("redeemed_at", { ascending: false })
          .range(from, to),
      mapRedemption,
    ),
  ]);

  const missingSources = Array.from(
    new Set(
      [offers, orders, customers, loyaltyCards, rewardRedemptions, brandCoupons, redemptions]
        .filter((source) => source.missing)
        .map((source) => source.sourceName),
    ),
  );

  const latestCustomerIds = Array.from(
    new Set(redemptions.rows.slice(0, 10).map((redemption) => redemption.customerId).filter(Boolean) as string[]),
  );
  const customersById = new Map<string, string>();

  if (latestCustomerIds.length > 0) {
    try {
      const { data } = await supabase
        .from("customer_profiles")
        .select("id,full_name")
        .eq("cafe_id", cafe.id)
        .in("id", latestCustomerIds);

      for (const row of (Array.isArray(data) ? data : []) as Record<string, unknown>[]) {
        customersById.set(text(row.id), text(row.full_name, "عميل بدون اسم"));
      }
    } catch {
      // The main customer profile availability is already represented in missingSources.
    }
  }

  const offerRows = buildOfferRows(offers.rows, now);
  const couponRows = buildBrandCouponRows(brandCoupons.rows, redemptions.rows);
  const activeOffers = offerRows.filter((offer) => offer.status === "نشط").length;
  const activeCoupons = couponRows.filter((coupon) => coupon.status === "active").length;
  const expiredOffers = offerRows.filter((offer) => offer.status === "منتهي").length;
  const expiredCoupons = couponRows.filter((coupon) => coupon.status === "expired").length;
  const upcomingOffers = offerRows.filter((offer) => offer.status === "قادم").length;
  const upcomingCoupons = couponRows.filter((coupon) => coupon.startsAt && new Date(coupon.startsAt) > now).length;
  const discountedOrders = orders.rows.filter((order) => order.discountAmount > 0).length;
  const activeCustomers = countActiveCustomers(orders.rows, daysAgo(now, 30));
  const couponDiscountTotal = redemptions.rows.reduce((sum, redemption) => sum + redemption.discountAmount, 0);
  const couponsById = new Map(couponRows.map((coupon) => [coupon.id, coupon]));

  return {
    enabled: true,
    cafeName: cafe.name,
    totalOffers: offers.missing && brandCoupons.missing ? null : offers.rows.length + couponRows.length,
    metrics: [
      {
        key: "activeOffers",
        label: "العروض والكوبونات النشطة",
        value: offers.missing && brandCoupons.missing ? null : activeOffers + activeCoupons,
        hint: "من العروض الحالية وكوبونات العلامة الفعلية",
      },
      {
        key: "expiredOffers",
        label: "العروض والكوبونات المنتهية",
        value: offers.missing && brandCoupons.missing ? null : expiredOffers + expiredCoupons,
        hint: "حسب تاريخ النهاية أو الحالة المسجلة",
      },
      {
        key: "upcomingOffers",
        label: "العروض والكوبونات القادمة",
        value: offers.missing && brandCoupons.missing ? null : upcomingOffers + upcomingCoupons,
        hint: "العناصر التي يبدأ تاريخها لاحقًا",
      },
      {
        key: "discountOrders",
        label: "طلبات بها خصم",
        value: orders.missing ? null : discountedOrders,
        hint: activeCustomers > 0
          ? `مرتبطة بنشاط ${activeCustomers} عميل خلال آخر 30 يومًا`
          : "حسب قيمة الخصم في الطلبات",
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
    brandCoupons: couponRows,
    latestRedemptions: redemptions.rows.slice(0, 10).map((redemption) => {
      const coupon = couponsById.get(redemption.couponId);
      return {
        id: redemption.id,
        couponId: redemption.couponId,
        couponCode: coupon?.code ?? "كوبون غير معروف",
        couponTitle: coupon?.title ?? "كوبون غير معروف",
        customerName: redemption.customerId ? customersById.get(redemption.customerId) ?? "عميل بدون اسم" : "عميل بدون اسم",
        orderId: redemption.orderId,
        discountAmount: redemption.discountAmount,
        redeemedAt: redemption.redeemedAt,
      };
    }),
    couponUsageTotal: redemptions.rows.length,
    couponDiscountTotal,
    missingSources,
  };
}
