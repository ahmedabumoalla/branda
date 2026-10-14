import { loyaltyStampStyle, type LoyaltyStampStyle } from "@/lib/loyalty/stamp-style";
import { z } from "zod";
import { getLoyaltyCustomerProfile } from "@/lib/auth/rast-loyalty-session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { operationEventTypes, recordOperationEvent } from "@/lib/data/operation-events";
import type { LoyaltyCardDesign } from "@/lib/loyalty/types";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { isGreenApiConfigured, sendGreenApiCashierWelcome } from "@/lib/whatsapp/green-api";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { getLoyaltyBrandAppearance } from "@/lib/data/loyalty-identity";

export type LoyaltyCardProgram = {
  stampStyle?: LoyaltyStampStyle;
  brandSlug?: string;
  logoUrl?: string;
  enabled: boolean;
  cardTitle: string;
  cardSubtitle: string;
  purchasesRequired: number;
  rewardProductId: string | null;
  rewardProductName: string;
  rewardName: string;
  stampLabel: string;
  terms: string;
  cardBackground: string;
  cardForeground: string;
  cardAccent: string;
  cardDesign: LoyaltyCardDesign | null;
  appleWalletEnabled: boolean;
  googleWalletEnabled: boolean;
};

export type LoyaltyBrandCard = {
  id: string;
  cafeId: string;
  cardCode: string;
  displayNumber?: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  stampsInCycle: number;
  completedCycles: number;
  availableRewards: number;
  totalPurchases: number;
  issuedAt: string;
  updatedAt: string;
};

export type LoyaltyCashier = {
  id: string;
  fullName: string;
  email: string;
  employeeNumber: string;
  temporaryPassword: string;
  authMethod?: "password" | "whatsapp_otp";
  canUseLoyalty?: boolean;
  canUsePager?: boolean;
  pagerStation?: string;
  phone?: string;
  ownerUserId?: string | null;
  active: boolean;
  lastLoginAt: string | null;
  lastLogoutAt: string | null;
  createdAt: string;
};

export type LoyaltyEvent = {
  id: string;
  customerName: string;
  cardCode: string;
  cashierName: string;
  eventType: "stamp" | "redeem" | "void";
  invoiceBarcode: string;
  invoiceAmount: number;
  stampsAfter: number;
  rewardsAfter: number;
  createdAt: string;
};

export type CashierActivity = {
  id: string;
  cashierName: string;
  actionType: string;
  targetType: string;
  targetId: string;
  invoiceBarcode: string;
  details: Record<string, unknown>;
  createdAt: string;
};


export type CustomerLoyaltyCardView = {
  card: LoyaltyBrandCard;
  program: LoyaltyCardProgram;
  cafeSlug: string;
  cafeName: string;
  businessCategory: string;
};

export type LoyaltyCardsDashboard = {
  cafeId: string;
  cafeSlug: string;
  cafeName: string;
  businessCategory: string;
  program: LoyaltyCardProgram;
  cards: LoyaltyBrandCard[];
  cashiers: LoyaltyCashier[];
  events: LoyaltyEvent[];
  activities: CashierActivity[];
};

export type CashierOperationsDashboard = {
  canOpenAsOwner?: boolean;
  cafeId: string;
  cafeSlug: string;
  cafeName: string;
  businessCategory: string;
  cashiers: Array<Omit<LoyaltyCashier, "temporaryPassword">>;
  activities: CashierActivity[];
};

const defaultProgram: LoyaltyCardProgram = {
  enabled: false,
  cardTitle: "بطاقة الولاء",
  cardSubtitle: "اجمع الأختام واستبدل مكافأتك بسهولة",
  purchasesRequired: 7,
  rewardProductId: null,
  rewardProductName: "",
  rewardName: "مشروب مجاني عند اكتمال البطاقة",
  stampLabel: "ختم",
  terms: "تطبق الشروط والأحكام الخاصة بالعلامة التجارية",
  cardBackground: "#4a281d",
  cardForeground: "#fcf8f3",
  cardAccent: "#d9a33f",
  cardDesign: null,
  appleWalletEnabled: false,
  googleWalletEnabled: false,
};

function safeCardSubtitle(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "اجمع الأختام واحصل على مكافأتك") return defaultProgram.cardSubtitle;
  return normalized;
}

function mapCardDesign(value: unknown): LoyaltyCardDesign | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as LoyaltyCardDesign;
}

async function mapProgram(row: Record<string, unknown> | null | undefined, cafeId: string, slug: string): Promise<LoyaltyCardProgram> {
  const { colors } = await getLoyaltyBrandAppearance(cafeId, slug);
  const brandColors = { brandSlug: slug, logoUrl: `/api/wallet/brand/${encodeURIComponent(slug)}/logo?v=brand-stamps-v1`, cardBackground: colors.background, cardForeground: colors.foreground, cardAccent: colors.accent };
  if (!row) return { ...defaultProgram, ...brandColors };
  const product = Array.isArray(row.menu_products) ? row.menu_products[0] : row.menu_products;
  return {
    enabled: Boolean(row.enabled ?? true),
    cardTitle: String(row.card_title ?? defaultProgram.cardTitle),
    cardSubtitle: safeCardSubtitle(row.card_subtitle ?? defaultProgram.cardSubtitle),
    purchasesRequired: Number(row.purchases_required ?? 7),
    rewardProductId: row.reward_product_id ? String(row.reward_product_id) : null,
    rewardProductName:
      product && typeof product === "object" && "name" in product
        ? String((product as { name?: string }).name ?? "")
        : "",
    rewardName: String(row.reward_name ?? defaultProgram.rewardName),
    stampStyle: loyaltyStampStyle((row.card_design as Record<string, unknown> | null)?.stampStyle),
    stampLabel: String(row.stamp_label ?? defaultProgram.stampLabel),
    terms: String(row.terms ?? defaultProgram.terms),
    ...brandColors,
    cardDesign: row.card_design ? { ...mapCardDesign(row.card_design)!, ...brandColors, layoutVersion: "brand-stamps-v1", logoPreviewUrl: brandColors.logoUrl } : null,
    appleWalletEnabled: Boolean(row.apple_wallet_enabled ?? false),
    googleWalletEnabled: Boolean(row.google_wallet_enabled ?? false),
  };
}

function mapCard(row: Record<string, unknown>): LoyaltyBrandCard {
  return {
    id: String(row.id),
    cafeId: String(row.cafe_id ?? ""),
    cardCode: String(row.card_code),
    displayNumber: row.display_number == null ? undefined : String(row.display_number),
    customerName: String(row.customer_name ?? "عميل"),
    customerPhone: String(row.customer_phone ?? ""),
    customerEmail: String(row.customer_email ?? ""),
    stampsInCycle: Number(row.stamps_in_cycle ?? 0),
    completedCycles: Number(row.completed_cycles ?? 0),
    availableRewards: Number(row.available_rewards ?? 0),
    totalPurchases: Number(row.total_purchases ?? 0),
    issuedAt: String(row.issued_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function getOwnerLoyaltyCardsDashboard(): Promise<LoyaltyCardsDashboard> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const [
    { data: programRow, error: programError },
    { data: cardRows, error: cardsError },
    { data: cashierRows, error: cashiersError },
    { data: eventRows, error: eventsError },
    { data: activityRows, error: activitiesError },
  ] = await Promise.all([
    supabase.from("cafe_loyalty_programs").select("*, menu_products(name)").eq("cafe_id", cafe.id).maybeSingle(),
    supabase.from("loyalty_cards").select("*").eq("cafe_id", cafe.id).order("updated_at", { ascending: false }).limit(100),
    supabase.from("cafe_cashiers").select("*").eq("cafe_id", cafe.id).order("created_at", { ascending: false }),
    supabase
      .from("loyalty_card_events")
      .select("*, loyalty_cards!loyalty_card_events_card_same_cafe(customer_name, card_code), cafe_cashiers(full_name)")
      .eq("cafe_id", cafe.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("cafe_cashier_activity_logs")
      .select("*, cafe_cashiers(full_name)")
      .eq("cafe_id", cafe.id)
      .in("action_type", ["loyalty_card_scan", "loyalty_reward_redeem", "experience_reward_redeem", "order_accept", "cashier_accept_order"])
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  if (programError) throw programError;
  if (cardsError) throw cardsError;
  if (cashiersError) throw cashiersError;
  if (eventsError) throw eventsError;
  if (activitiesError) throw activitiesError;

  return {
    cafeId: cafe.id,
    cafeSlug: cafe.slug,
    cafeName: cafe.name,
    businessCategory: cafe.businessCategory,
    program: await mapProgram(programRow, cafe.id, cafe.slug),
    cards: (cardRows ?? []).map(mapCard),
    cashiers: (cashierRows ?? []).map((row) => ({
      id: String(row.id),
      fullName: String(row.full_name),
      email: String(row.email ?? ""),
      employeeNumber: String(row.employee_number ?? ""),
      temporaryPassword: String(row.temporary_password ?? ""),
      active: Boolean(row.active),
      lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
      lastLogoutAt: row.last_logout_at ? String(row.last_logout_at) : null,
      createdAt: String(row.created_at),
    })),
    events: (eventRows ?? []).map((row) => {
      const card = Array.isArray(row.loyalty_cards) ? row.loyalty_cards[0] : row.loyalty_cards;
      const cashier = Array.isArray(row.cafe_cashiers) ? row.cafe_cashiers[0] : row.cafe_cashiers;
      return {
        id: String(row.id),
        customerName: card?.customer_name ? String(card.customer_name) : "عميل",
        cardCode: card?.card_code ? String(card.card_code) : "",
        cashierName: cashier?.full_name ? String(cashier.full_name) : "لوحة التحكم",
        eventType: row.event_type as "stamp" | "redeem" | "void",
        invoiceBarcode: String(row.invoice_barcode ?? ""),
        invoiceAmount: Number(row.invoice_amount ?? 0),
        stampsAfter: Number(row.stamps_after ?? 0),
        rewardsAfter: Number(row.rewards_after ?? 0),
        createdAt: String(row.created_at),
      };
    }),
    activities: (activityRows ?? []).map((row) => {
      const cashier = Array.isArray(row.cafe_cashiers) ? row.cafe_cashiers[0] : row.cafe_cashiers;
      return {
        id: String(row.id),
        cashierName: cashier?.full_name ? String(cashier.full_name) : "كاشير",
        actionType: String(row.action_type),
        targetType: String(row.target_type ?? ""),
        targetId: String(row.target_id ?? ""),
        invoiceBarcode: String(row.invoice_barcode ?? ""),
        details: (row.details as Record<string, unknown>) ?? {},
        createdAt: String(row.created_at),
      };
    }),
  };
}

export async function getOwnerCashierOperations(): Promise<CashierOperationsDashboard> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const [{ data: cashierRows, error: cashiersError }, { data: activityRows, error: activitiesError }] =
    await Promise.all([
      supabase
        .from("cafe_cashiers")
        .select("id,full_name,email,phone,auth_method,owner_user_id,employee_number,active,last_login_at,last_logout_at,created_at,can_use_loyalty,can_use_pager,pager_station")
        .eq("cafe_id", cafe.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("cafe_cashier_activity_logs")
        .select("id,cashier_id,action_type,target_type,target_id,invoice_barcode,details,created_at,cafe_cashiers(full_name)")
        .eq("cafe_id", cafe.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  if (cashiersError) throw cashiersError;
  if (activitiesError) throw activitiesError;

  return {
    canOpenAsOwner: cafe.role === "owner" || cafe.role === "platform_admin",
    cafeId: cafe.id,
    cafeSlug: cafe.slug,
    cafeName: cafe.name,
    businessCategory: cafe.businessCategory,
    cashiers: (cashierRows ?? []).map((row) => ({
      id: String(row.id),
      fullName: String(row.full_name),
      email: String(row.email ?? ""),
      authMethod: row.auth_method === "whatsapp_otp" ? "whatsapp_otp" : "password",
      phone: String(row.phone ?? ""),
      ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
      canUseLoyalty: row.can_use_loyalty === true,
      canUsePager: row.can_use_pager === true,
      pagerStation: String(row.pager_station ?? ""),
      employeeNumber: String(row.employee_number ?? ""),
      active: Boolean(row.active),
      lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
      lastLogoutAt: row.last_logout_at ? String(row.last_logout_at) : null,
      createdAt: String(row.created_at),
    })),
    activities: (activityRows ?? []).map((row) => {
      const cashier = Array.isArray(row.cafe_cashiers)
        ? row.cafe_cashiers[0]
        : row.cafe_cashiers;
      return {
        id: String(row.id),
        cashierName: cashier?.full_name ? String(cashier.full_name) : "موظف الكاشير",
        actionType: String(row.action_type),
        targetType: String(row.target_type ?? ""),
        targetId: String(row.target_id ?? ""),
        invoiceBarcode: String(row.invoice_barcode ?? ""),
        details: (row.details as Record<string, unknown>) ?? {},
        createdAt: String(row.created_at),
      };
    }),
  };
}

const programSchema = z.object({
  enabled: z.boolean(),
  cardTitle: z.string().min(2).max(80),
  cardSubtitle: z.string().min(2).max(140),
  purchasesRequired: z.number().int().min(1).max(100),
  rewardProductId: z.string().uuid().nullable(),
  rewardName: z.string().min(2).max(80),
  stampLabel: z.string().min(1).max(40),
  terms: z.string().max(1000),
  cardBackground: z.string().min(4).max(20),
  cardForeground: z.string().min(4).max(20),
  cardAccent: z.string().min(4).max(20),
  cardDesign: z.unknown().optional().nullable(),
});

export async function saveOwnerLoyaltyProgram(input: z.infer<typeof programSchema>) {
  const parsed = programSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  if (parsed.rewardProductId) {
    const { data: product, error: productError } = await supabase
      .from("menu_products")
      .select("id")
      .eq("id", parsed.rewardProductId)
      .eq("cafe_id", cafe.id)
      .maybeSingle();

    if (productError) throw productError;
    if (!product) throw new Error("Reward product does not belong to this cafe");
  }

  const { error } = await supabase.rpc("set_cafe_loyalty_program", {
    p_cafe_id: cafe.id,
    p_enabled: parsed.enabled,
    p_card_title: parsed.cardTitle,
    p_card_subtitle: parsed.cardSubtitle,
    p_purchases_required: parsed.purchasesRequired,
    p_reward_product_id: parsed.rewardProductId,
    p_reward_name: parsed.rewardName,
    p_stamp_label: parsed.stampLabel,
    p_terms: parsed.terms,
    p_card_background: parsed.cardBackground,
    p_card_foreground: parsed.cardForeground,
    p_card_accent: parsed.cardAccent,
  });

  if (error) throw error;

  if (Object.prototype.hasOwnProperty.call(parsed, "cardDesign")) {
    const { error: designError } = await supabase.rpc("set_cafe_loyalty_card_design", {
      p_cafe_id: cafe.id,
      p_card_design: parsed.cardDesign ?? {},
    });

    if (designError) throw designError;
  }
}

export async function createOwnerCashier(input: {
  fullName: string;
  phone: string;
  employeeNumber?: string;
  canUseLoyalty?: boolean;
  canUsePager?: boolean;
  pagerStation?: string;
}) {
  const parsed = z.object({
    fullName: z.string().trim().min(2).max(80).regex(/^[^\r\n\x00-\x1f]+$/),
    phone: z.string().max(30).transform(normalizeSaudiPhone).refine(Boolean),
    employeeNumber: z.string().trim().max(40).optional(),
    canUseLoyalty: z.boolean().default(true),
    canUsePager: z.boolean().default(false),
    pagerStation: z.string().trim().max(80).default(""),
  }).refine((value) => value.canUseLoyalty || value.canUsePager).parse(input);

  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const phone = `+${parsed.phone}`;
  const { data: cashierId, error } = await supabase.rpc("create_cafe_staff_whatsapp", {
    p_cafe_id: cafe.id,
    p_full_name: parsed.fullName,
    p_phone: phone,
    p_employee_number: parsed.employeeNumber || null,
    p_can_use_loyalty: parsed.canUseLoyalty,
    p_can_use_pager: parsed.canUsePager,
    p_pager_station: parsed.pagerStation,
  });

  // Do not return raw SQL/provider errors: they may include submitted credentials.
  if (error || typeof cashierId !== "string") throw new Error("تعذر إنشاء الموظف تحقق من البيانات وأن رقم واتساب غير مستخدم لحساب موظف جديد");
  let whatsappStatus: "queued" | "failed" | "unavailable" = "unavailable";
  if (isGreenApiConfigured()) {
    try {
      await sendGreenApiCashierWelcome({
        phone, fullName: parsed.fullName, brandName: cafe.name,
      });
      whatsappStatus = "queued";
    } catch {
      whatsappStatus = "failed";
    }
  }
  // Account creation remains successful even if the provider fails afterwards.
  const cashier: Omit<LoyaltyCashier, "temporaryPassword"> = {
    id: cashierId, fullName: parsed.fullName, email: "", phone, authMethod: "whatsapp_otp",
    employeeNumber: parsed.employeeNumber ?? "", active: true, ownerUserId: null,
    canUseLoyalty: parsed.canUseLoyalty, canUsePager: parsed.canUsePager, pagerStation: parsed.pagerStation,
    lastLoginAt: null, lastLogoutAt: null, createdAt: new Date().toISOString(),
  };
  return { cashier, whatsappStatus };
}

export async function updateOwnerCashierPermissions(input: {
  cashierId: string; canUseLoyalty: boolean; canUsePager: boolean; pagerStation: string;
}) {
  const parsed = z.object({
    cashierId: z.string().uuid(), canUseLoyalty: z.boolean(), canUsePager: z.boolean(),
    pagerStation: z.string().trim().max(80).regex(/^[^\x00-\x1f]*$/),
  }).refine((value) => value.canUseLoyalty || value.canUsePager).parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_cafe_staff_permissions", {
    p_cafe_id: cafe.id, p_cashier_id: parsed.cashierId,
    p_can_use_loyalty: parsed.canUseLoyalty, p_can_use_pager: parsed.canUsePager,
    p_pager_station: parsed.pagerStation,
  });
  if (error) throw new Error("تعذر حفظ صلاحيات الموظف تحقق من الباقة وحاول مجددًا");
  return parsed;
}

export async function setOwnerCashierStatus(cashierId: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_cashier_status", {
    p_cashier_id: z.string().uuid().parse(cashierId),
    p_active: active,
  });
  if (error) throw error;
}

export async function recordOwnerLoyaltyOperation(input: {
  cardCode: string;
  invoiceBarcode?: string;
  invoiceAmount?: number;
  operation?: "stamp" | "redeem";
}) {
  await requireOwnerCafeContext();
  void input;
  throw new Error("استخدم شاشة الموظف لتسجيل الأختام وصرف المكافآت");
}

export async function issueCurrentCustomerLoyaltyCard(slug: string) {
  const program = await getPublicLoyaltyProgramBySlug(slug);
  if (!program?.enabled) {
    throw new Error("بطاقة الولاء غير مفعلة لهذه العلامة التجارية");
  }

  const profile = await getLoyaltyCustomerProfile(slug);
  if (!profile) throw new Error("أدخل اسمك ورقم جوالك لفتح بطاقتك");
  const { data, error } = await createAdminClient().rpc("issue_rast_loyalty_card", { p_customer_profile_id: profile.id });
  if (error) throw new Error("تعذر إصدار بطاقة الولاء");
  return String(data);
}

export async function getCardByCode(cardCode: string) {
  const admin = createAdminClient();
  const { data: cardRow, error } = await admin
    .from("loyalty_cards")
    .select("*")
    .eq("card_code", cardCode.toUpperCase())
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  if (cardRow && !featureCodesAllow(await getCafeFeatureCodes(String(cardRow.cafe_id)), "loyalty")) return null;
  return cardRow ? mapCard(cardRow) : null;
}

export async function getLoyaltyCardViewByCode(cardCode: string): Promise<CustomerLoyaltyCardView | null> {
  const admin = createAdminClient();

  const { data: cardRow, error } = await admin
    .from("loyalty_cards")
    .select("*, cafes(slug, name, business_category)")
    .eq("card_code", cardCode.toUpperCase())
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  if (!cardRow) return null;
  if (!featureCodesAllow(await getCafeFeatureCodes(String(cardRow.cafe_id)), "loyalty")) return null;

  const cafe = Array.isArray(cardRow.cafes) ? cardRow.cafes[0] : cardRow.cafes;
  const cafeSlug = cafe?.slug ? String(cafe.slug) : "";
  const cafeName = cafe?.name ? String(cafe.name) : "العلامة التجارية";
  const businessCategory = cafe?.business_category ? String(cafe.business_category) : "cafes_coffee";

  const { data: programRow } = await admin
    .from("cafe_loyalty_programs")
    .select("*, menu_products(name)")
    .eq("cafe_id", String(cardRow.cafe_id))
    .maybeSingle();
  const program = await mapProgram(programRow, String(cardRow.cafe_id), cafeSlug);
  if (programRow && !program.enabled) return null;

  return {
    card: mapCard(cardRow),
    program,
    cafeSlug,
    cafeName,
    businessCategory,
  };
}

export async function getCurrentCustomerLoyaltyCardView(slug: string): Promise<CustomerLoyaltyCardView> {
  const code = await issueCurrentCustomerLoyaltyCard(slug);
  const view = await getLoyaltyCardViewByCode(code);

  if (!view) {
    throw new Error("تعذر تحميل بطاقة الولاء");
  }

  return view;
}

export async function getCustomerLoyaltyCardViewForProfile(
  slug: string,
  customerProfileId: string,
): Promise<CustomerLoyaltyCardView | null> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return null;
  if (!featureCodesAllow(await getCafeFeatureCodes(cafe.id), "loyalty")) return null;

  const profile = await getLoyaltyCustomerProfile(slug);
  if (!profile || profile.id !== customerProfileId) return null;
  const { data, error } = await createAdminClient().rpc("issue_rast_loyalty_card", { p_customer_profile_id: profile.id });
  if (error) throw new Error("تعذر إصدار بطاقة الولاء تحقق من تفعيل البرنامج");
  return getLoyaltyCardViewByCode(String(data));
}

export async function getPublicLoyaltyProgramBySlug(slug: string) {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return null;
  if (!featureCodesAllow(await getCafeFeatureCodes(cafe.id), "loyalty")) return null;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("cafe_loyalty_programs")
    .select("*, menu_products(name)")
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  return mapProgram(data, cafe.id, cafe.slug);
}
