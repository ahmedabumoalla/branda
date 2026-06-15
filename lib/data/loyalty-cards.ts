import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";

export type LoyaltyCardProgram = {
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
  appleWalletEnabled: boolean;
  googleWalletEnabled: boolean;
};

export type LoyaltyBrandCard = {
  id: string;
  cardCode: string;
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
};

export type LoyaltyCardsDashboard = {
  cafeId: string;
  cafeSlug: string;
  cafeName: string;
  program: LoyaltyCardProgram;
  cards: LoyaltyBrandCard[];
  cashiers: LoyaltyCashier[];
  events: LoyaltyEvent[];
  activities: CashierActivity[];
};

const defaultProgram: LoyaltyCardProgram = {
  enabled: true,
  cardTitle: "بطاقة الولاء",
  cardSubtitle: "اجمع الأختام واحصل على مكافأتك",
  purchasesRequired: 7,
  rewardProductId: null,
  rewardProductName: "",
  rewardName: "منتج مجاني",
  stampLabel: "ختم",
  terms: "تطبق الشروط والأحكام الخاصة بالعلامة التجارية",
  cardBackground: "#4A281D",
  cardForeground: "#FCF8F3",
  cardAccent: "#D9A33F",
  appleWalletEnabled: false,
  googleWalletEnabled: false,
};

function mapProgram(row: Record<string, unknown> | null | undefined): LoyaltyCardProgram {
  if (!row) return defaultProgram;
  const product = Array.isArray(row.menu_products) ? row.menu_products[0] : row.menu_products;
  return {
    enabled: Boolean(row.enabled ?? true),
    cardTitle: String(row.card_title ?? defaultProgram.cardTitle),
    cardSubtitle: String(row.card_subtitle ?? defaultProgram.cardSubtitle),
    purchasesRequired: Number(row.purchases_required ?? 7),
    rewardProductId: row.reward_product_id ? String(row.reward_product_id) : null,
    rewardProductName:
      product && typeof product === "object" && "name" in product
        ? String((product as { name?: string }).name ?? "")
        : "",
    rewardName: String(row.reward_name ?? defaultProgram.rewardName),
    stampLabel: String(row.stamp_label ?? defaultProgram.stampLabel),
    terms: String(row.terms ?? defaultProgram.terms),
    cardBackground: String(row.card_background ?? defaultProgram.cardBackground),
    cardForeground: String(row.card_foreground ?? defaultProgram.cardForeground),
    cardAccent: String(row.card_accent ?? defaultProgram.cardAccent),
    appleWalletEnabled: Boolean(row.apple_wallet_enabled ?? false),
    googleWalletEnabled: Boolean(row.google_wallet_enabled ?? false),
  };
}

function mapCard(row: Record<string, unknown>): LoyaltyBrandCard {
  return {
    id: String(row.id),
    cardCode: String(row.card_code),
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

function makePermanentPassword() {
  const letters = Math.random().toString(36).slice(2, 5).toUpperCase();
  const number = Math.floor(100 + Math.random() * 899);
  return `K${number}${letters}`;
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
      .select("*, loyalty_cards(customer_name, card_code), cafe_cashiers(full_name)")
      .eq("cafe_id", cafe.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("cafe_cashier_activity_logs")
      .select("*, cafe_cashiers(full_name)")
      .eq("cafe_id", cafe.id)
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
    program: mapProgram(programRow),
    cards: (cardRows ?? []).map(mapCard),
    cashiers: (cashierRows ?? []).map((row) => ({
      id: String(row.id),
      fullName: String(row.full_name),
      email: String(row.email),
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
});

export async function saveOwnerLoyaltyProgram(input: z.infer<typeof programSchema>) {
  const parsed = programSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

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
}

export async function createOwnerCashier(input: {
  fullName: string;
  email: string;
  employeeNumber?: string;
}) {
  const parsed = z.object({
    fullName: z.string().min(2).max(80),
    email: z.string().email(),
    employeeNumber: z.string().max(40).optional(),
  }).parse(input);

  const cafe = await requireOwnerCafeContext();
  const permanentPassword = makePermanentPassword();
  const supabase = await createClient();

  const { error } = await supabase.rpc("create_cafe_cashier", {
    p_cafe_id: cafe.id,
    p_full_name: parsed.fullName,
    p_email: parsed.email,
    p_temp_password: permanentPassword,
    p_employee_number: parsed.employeeNumber || null,
  });

  if (error) throw error;
  return permanentPassword;
}

export async function setOwnerCashierStatus(cashierId: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_cashier_status", {
    p_cashier_id: z.string().uuid().parse(cashierId),
    p_active: active,
  });
  if (error) throw error;
}

function makeLoyaltyScanReference(cardCode: string) {
  const normalized =
    cardCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 64) || "CARD";
  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `LOYALTY-CARD-${normalized}-${Date.now()}-${suffix}`;
}

export async function recordOwnerLoyaltyOperation(input: {
  cardCode: string;
  invoiceBarcode?: string;
  invoiceAmount?: number;
  operation?: "stamp" | "redeem";
}) {
  const parsed = z.object({
    cardCode: z.string().min(4).max(500),
    invoiceBarcode: z.string().max(500).optional(),
    invoiceAmount: z.number().min(0).max(999999).optional(),
    operation: z.enum(["stamp", "redeem"]).optional(),
  }).parse(input);

  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const normalizedCardCode =
    parseBarndaksaQrPayload(parsed.cardCode, "loyalty-card") ??
    parsed.cardCode.trim().toUpperCase();

  const normalizedInvoiceBarcode = parsed.invoiceBarcode?.trim()
    ? parseBarndaksaQrPayload(parsed.invoiceBarcode, "invoice") ?? parsed.invoiceBarcode.trim()
    : makeLoyaltyScanReference(normalizedCardCode);

  const { data, error } = await supabase.rpc("record_loyalty_card_operation", {
    p_cafe_id: cafe.id,
    p_card_code: normalizedCardCode,
    p_invoice_barcode: normalizedInvoiceBarcode,
    p_invoice_amount: parsed.invoiceAmount ?? 0,
    p_operation: parsed.operation ?? "stamp",
    p_cashier_session_token: null,
  });

  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function issueCurrentCustomerLoyaltyCard(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_loyalty_card_for_customer", {
    p_cafe_slug: slug,
  });
  if (error) throw error;
  return String(data);
}

export async function getCardByCode(cardCode: string) {
  const supabase = await createClient();
  const { data: cardRow, error } = await supabase
    .from("loyalty_cards")
    .select("*")
    .eq("card_code", cardCode.toUpperCase())
    .maybeSingle();

  if (error) throw error;
  return cardRow ? mapCard(cardRow) : null;
}

export async function getLoyaltyCardViewByCode(cardCode: string): Promise<CustomerLoyaltyCardView | null> {
  const supabase = await createClient();

  const { data: cardRow, error } = await supabase
    .from("loyalty_cards")
    .select("*, cafes(slug, name)")
    .eq("card_code", cardCode.toUpperCase())
    .maybeSingle();

  if (error) throw error;
  if (!cardRow) return null;

  const cafe = Array.isArray(cardRow.cafes) ? cardRow.cafes[0] : cardRow.cafes;
  const cafeSlug = cafe?.slug ? String(cafe.slug) : "";
  const cafeName = cafe?.name ? String(cafe.name) : "العلامة التجارية";

  const { data: programRow } = await supabase
    .from("cafe_loyalty_programs")
    .select("*, menu_products(name)")
    .eq("cafe_id", String(cardRow.cafe_id))
    .eq("enabled", true)
    .maybeSingle();

  return {
    card: mapCard(cardRow),
    program: mapProgram(programRow),
    cafeSlug,
    cafeName,
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

export async function getPublicLoyaltyProgramBySlug(slug: string) {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("cafe_loyalty_programs")
    .select("*, menu_products(name)")
    .eq("cafe_id", cafe.id)
    .eq("enabled", true)
    .maybeSingle();

  return data ? mapProgram(data) : defaultProgram;
}
