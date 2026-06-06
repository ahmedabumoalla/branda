import type { CafeSettings } from "@/lib/mock/cafe-settings";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { MenuProduct } from "@/lib/mock/menu";
import type { CafeOffer } from "@/lib/mock/offers";
import type { CafeOrder, OrderStatus } from "@/lib/mock/orders";
import type { CafeReservation, ReservationStatus } from "@/lib/mock/reservations";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import type { CafeThemeId } from "@/lib/mock/cafe-theme";

/** DB row shapes (snake_case) */
export type DbCafeSettings = {
  cafe_id: string;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  logo_url: string | null;
  logo_storage_path: string | null;
  tax_number: string | null;
  commercial_register: string | null;
  maroof_certificate: string | null;
  instagram: string | null;
  whatsapp: string | null;
  description: string | null;
  custom_domain: string | null;
  domain_status: string | null;
  purchased_domain: string | null;
  purchased_domain_status: string | null;
  theme_id: string;
};

export type DbMenuProduct = {
  id: string;
  cafe_id: string;
  category_id: string | null;
  legacy_category: string | null;
  name: string;
  description: string;
  image_url: string | null;
  image_storage_path: string | null;
  image_variant: string;
  price: number;
  calories: number | null;
  loyalty_points: number;
  preparation_time_minutes: number | null;
  redeemable_with_points: boolean;
  redemption_points: number | null;
  available_for_pickup: boolean;
  pickup_lead_minutes: number | null;
  ingredients: string[] | unknown;
  available: boolean;
  promo: unknown;
  sort_order: number;
};

export type DbMenuCategory = {
  id: string;
  cafe_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  image_storage_path: string | null;
  icon: string | null;
  sort_order: number;
  visible: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
};

const ORDER_STATUS_TO_UI: Record<string, OrderStatus> = {
  pending_cafe: "بانتظار موافقة الكوفي",
  accepted: "مقبول",
  rejected: "مرفوض",
  cancelled_by_customer: "ملغي من العميل",
};

const ORDER_STATUS_FROM_UI: Record<OrderStatus, string> = {
  "بانتظار موافقة الكوفي": "pending_cafe",
  مقبول: "accepted",
  مرفوض: "rejected",
  "ملغي من العميل": "cancelled_by_customer",
};

const RESERVATION_STATUS_TO_UI: Record<string, ReservationStatus> = {
  pending: "بانتظار الرد",
  accepted: "مقبول",
  rejected: "مرفوض",
  modification_requested: "طلب تعديل",
};

const RESERVATION_STATUS_FROM_UI: Record<ReservationStatus, string> = {
  "بانتظار الرد": "pending",
  مقبول: "accepted",
  مرفوض: "rejected",
  "طلب تعديل": "modification_requested",
};

export function mapOrderStatusFromDb(status: string): OrderStatus {
  return ORDER_STATUS_TO_UI[status] ?? "بانتظار موافقة الكوفي";
}

export function mapOrderStatusToDb(status: OrderStatus): string {
  return ORDER_STATUS_FROM_UI[status];
}

export function mapReservationStatusFromDb(status: string): ReservationStatus {
  return RESERVATION_STATUS_TO_UI[status] ?? "بانتظار الرد";
}

export function mapReservationStatusToDb(status: ReservationStatus): string {
  return RESERVATION_STATUS_FROM_UI[status];
}

export function mapDbSettingsToCafeSettings(
  slug: string,
  row: DbCafeSettings
): CafeSettings {
  return {
    cafeSlug: slug,
    cafeName: slug,
    ownerName: row.owner_name ?? "",
    ownerEmail: row.owner_email ?? "",
    ownerPhone: row.owner_phone ?? "",
    logoAssetId: row.logo_storage_path ?? undefined,
    taxNumber: row.tax_number ?? undefined,
    commercialRegister: row.commercial_register ?? undefined,
    maroofCertificate: row.maroof_certificate ?? undefined,
    instagram: row.instagram ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    description: row.description ?? undefined,
    customDomain: row.custom_domain ?? undefined,
    domainStatus: (row.domain_status as CafeSettings["domainStatus"]) ?? "غير مربوط",
    purchasedDomain: row.purchased_domain ?? undefined,
    purchasedDomainStatus:
      (row.purchased_domain_status as CafeSettings["purchasedDomainStatus"]) ?? undefined,
  };
}

export function mapDbCategoryToRecord(slug: string, row: DbMenuCategory): MenuCategoryRecord {
  return {
    id: row.id,
    cafeSlug: slug,
    name: row.name,
    description: row.description ?? undefined,
    imageAssetId: row.image_storage_path ?? undefined,
    icon: row.icon ?? undefined,
    sortOrder: row.sort_order,
    visible: row.visible,
    featured: row.featured,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDbProductToMenuProduct(row: DbMenuProduct, categoryName?: string): MenuProduct {
  return {
    id: row.id,
    name: row.name,
    category: categoryName ?? row.legacy_category ?? "أخرى",
    categoryId: row.category_id ?? undefined,
    description: row.description,
    imageAssetId: row.image_storage_path ?? undefined,
    imageDataUrl: row.image_url,
    imageVariant: row.image_variant as MenuProduct["imageVariant"],
    price: Number(row.price),
    calories: row.calories ?? undefined,
    loyaltyPoints: row.loyalty_points,
    preparationTimeMinutes: row.preparation_time_minutes ?? undefined,
    redeemableWithPoints: row.redeemable_with_points,
    redemptionPoints: row.redemption_points ?? undefined,
    availableForPickup: row.available_for_pickup,
    pickupLeadTimeMinutes: row.pickup_lead_minutes ?? undefined,
    ingredients: Array.isArray(row.ingredients) ? (row.ingredients as string[]) : [],
    available: row.available,
    promo: (row.promo as MenuProduct["promo"]) ?? null,
  };
}

export function mapDbOfferToCafeOffer(row: Record<string, unknown>): CafeOffer {
  const promo = (row.promo_payload as Record<string, unknown>) ?? {};
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? "",
    type: row.offer_type as CafeOffer["type"],
    status: row.status as CafeOffer["status"],
    placement: row.placement as CafeOffer["placement"],
    visibleInCafe: row.visible_in_cafe as boolean,
    discountPercent: row.discount_percent as number | undefined,
    code: row.code as string | undefined,
    startDate: row.start_date as string | undefined,
    endDate: row.end_date as string | undefined,
    linkedProductId: row.linked_product_id as string | undefined,
    bannerImageUrl: row.banner_url as string | undefined,
    bannerAssetId: row.banner_storage_path as string | undefined,
    ctaText: row.cta_text as string | undefined,
    promoProductName: promo.promoProductName as string | undefined,
    promoProductPrice: promo.promoProductPrice as number | undefined,
    promoProductCategory: promo.promoProductCategory as string | undefined,
    promoProductDescription: promo.promoProductDescription as string | undefined,
  };
}

export function mapDbCustomIdentity(row: Record<string, unknown>): CustomIdentityTheme {
  const now = new Date().toISOString();
  return {
    logoAssetId: row.logo_storage_path as string | undefined,
    backgroundAssetId: row.background_storage_path as string | undefined,
    palette: (row.palette as CustomIdentityTheme["palette"]) ?? {
      primary: "#6B3A25",
      secondary: "#4A281D",
      button: "#6B3A25",
      background: "#FCF8F3",
      text: "#311912",
      accent: "#D9A33F",
    },
    backgroundScope: (row.background_scope as CustomIdentityTheme["backgroundScope"]) ?? "home-only",
    backgroundFit: (row.background_fit as CustomIdentityTheme["backgroundFit"]) ?? "cover",
    overlayStrength: (row.overlay_strength as CustomIdentityTheme["overlayStrength"]) ?? "medium",
    featuredSectionMode:
      (row.featured_section_mode as CustomIdentityTheme["featuredSectionMode"]) ?? "latest",
    featuredCategoryId: row.featured_category_id as string | undefined,
    createdAt: (row.created_at as string) ?? now,
    updatedAt: (row.updated_at as string) ?? now,
  };
}

export function mapThemeIdFromDb(themeId: string): CafeThemeId {
  return themeId as CafeThemeId;
}

export function mapDbOrderToCafeOrder(
  slug: string,
  order: Record<string, unknown>,
  items: Record<string, unknown>[]
): CafeOrder {
  return {
    id: order.id as string,
    cafeSlug: slug,
    customerId: (order.customer_id as string) ?? "",
    customerName: order.customer_name as string,
    customerPhone: order.customer_phone as string,
    customerEmail: order.customer_email as string | undefined,
    branchName: order.branch_name as string | undefined,
    type: "استلام",
    status: mapOrderStatusFromDb(order.status as string),
    paymentStatus: "الدفع عند الاستلام",
    pickupAt: order.pickup_at as string | undefined,
    rejectionReason: order.rejection_reason as string | undefined,
    cafeResponseAt: order.responded_at as string | undefined,
    items: items.map((item) => ({
      id: item.id as string,
      productId: (item.product_id as string) ?? "",
      name: item.name as string,
      quantity: item.quantity as number,
      unitPrice: Number(item.unit_price),
      notes: item.notes as string | undefined,
    })),
    subtotal: Number(order.subtotal),
    discountAmount: Number(order.discount_amount),
    taxAmount: Number(order.tax_amount),
    total: Number(order.total),
    loyaltyPointsEarned: order.loyalty_points_earned as number,
    createdAt: order.created_at as string,
    notes: order.notes as string | undefined,
  };
}

export function mapDbReservationToCafeReservation(row: Record<string, unknown>): CafeReservation {
  return {
    id: row.id as string,
    customerId: row.customer_id as string | undefined,
    customerName: row.customer_name as string,
    phone: row.phone as string,
    type: row.event_type as CafeReservation["type"],
    guests: row.guests as number,
    date: row.reservation_date as string,
    time: row.reservation_time as string,
    durationMinutes: row.duration_minutes as number | undefined,
    branchName: row.branch_name as string | undefined,
    spaceType: row.space_type as string | undefined,
    eventTitle: row.event_title as string | undefined,
    needsDecoration: row.needs_decoration as boolean | undefined,
    needsCatering: row.needs_catering as boolean | undefined,
    budgetEstimate: row.budget_estimate as number | undefined,
    notes: row.notes as string | undefined,
    status: mapReservationStatusFromDb(row.status as string),
    rejectionReason: row.rejection_reason as string | undefined,
    cafeMessage: row.cafe_message as string | undefined,
    createdAt: row.created_at as string,
  };
}
