import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/data/cafes";

type DbRow = Record<string, unknown>;

export type PlatformMediaPlacement =
  | "hero"
  | "intro_video"
  | "loyalty_cards"
  | "social_post";

export type PlatformMediaItem = {
  id: string;
  placement: PlatformMediaPlacement;
  mediaType: "image" | "video";
  url: string;
  storagePath: string;
  altText: string;
  isDefault: boolean;
  sortOrder: number;
};

export const platformArabicFonts = [
  "system",
  "cairo",
  "tajawal",
  "ibm-plex-sans-arabic",
  "noto-kufi-arabic",
] as const;

export type PlatformArabicFont = (typeof platformArabicFonts)[number];

export type PlatformHomeSettings = {
  heroBadge: string;
  heroTitle: string;
  heroDescription: string;
  heroSideText: string;
  featuresTitle: string;
  loyaltyDescription: string;
  ctaTitle: string;
  ctaDescription: string;
  aboutUs: string;
  vision: string;
  mission: string;
  carouselIntervalSeconds: number;
  fontFamily: PlatformArabicFont;
  heroBadgeFontSize: number;
  heroTitleFontSize: number;
  heroDescriptionFontSize: number;
  heroSideTextFontSize: number;
  featuresTitleFontSize: number;
  loyaltyTitleFontSize: number;
  loyaltyDescriptionFontSize: number;
  ctaTitleFontSize: number;
  ctaDescriptionFontSize: number;
  aboutCardsFontSize: number;
};

export type PlatformContactSettings = {
  email: string;
  whatsapp: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  x: string;
};

export type PublicBrandItem = {
  id: string;
  name: string;
  logoUrl?: string;
  locationLabel?: string;
  href?: string;
};

export type PlatformHomePromotionType = "brand" | "product" | "offer" | "reservation";

export type PlatformHomePromotionItem = {
  id?: string;
  itemType: PlatformHomePromotionType;
  cafeId: string;
  itemId?: string | null;
  title: string;
  subtitle?: string;
  badge?: string;
  locationLabel?: string;
  imageUrl?: string;
  href: string;
  active: boolean;
  featured: boolean;
  sortOrder: number;
  brandName: string;
  brandLogoUrl?: string;
};

export type PublicPlatformHomeData = {
  settings: PlatformHomeSettings;
  contacts: PlatformContactSettings;
  heroImages: PlatformMediaItem[];
  introVideo?: PlatformMediaItem;
  loyaltyImages: PlatformMediaItem[];
  brands: PublicBrandItem[];
  promotions: PlatformHomePromotionItem[];
  videoViews: number;
  videoClicks: number;
};

export type PlatformSocialPost = {
  id: string;
  description: string;
  channels: string[];
  scheduledAt: string;
  status: string;
  mediaUrl?: string;
  mediaType?: string;
};

export type PlatformContactRequest = {
  id: string;
  fullName: string;
  email: string;
  message: string;
  status: string;
  createdAt: string;
};

const fontSizeSchema = z.coerce.number().int().min(10).max(72);

const homeSettingsSchema = z.object({
  heroBadge: z.string().trim().min(1).max(120),
  heroTitle: z.string().trim().min(1).max(180),
  heroDescription: z.string().trim().min(1).max(700),
  heroSideText: z.string().trim().max(500),
  featuresTitle: z.string().trim().min(1).max(180),
  loyaltyDescription: z.string().trim().min(1).max(500),
  ctaTitle: z.string().trim().min(1).max(180),
  ctaDescription: z.string().trim().min(1).max(500),
  aboutUs: z.string().trim().max(1000),
  vision: z.string().trim().max(1000),
  mission: z.string().trim().max(1000),
  carouselIntervalSeconds: z.coerce.number().int().min(4).max(12),
  fontFamily: z.enum(platformArabicFonts).default("system"),
  heroBadgeFontSize: fontSizeSchema.default(14),
  heroTitleFontSize: fontSizeSchema.default(48),
  heroDescriptionFontSize: fontSizeSchema.default(18),
  heroSideTextFontSize: fontSizeSchema.default(30),
  featuresTitleFontSize: fontSizeSchema.default(36),
  loyaltyTitleFontSize: fontSizeSchema.default(36),
  loyaltyDescriptionFontSize: fontSizeSchema.default(18),
  ctaTitleFontSize: fontSizeSchema.default(36),
  ctaDescriptionFontSize: fontSizeSchema.default(18),
  aboutCardsFontSize: fontSizeSchema.default(15),
});

const contactSettingsSchema = z.object({
  email: z.string().trim().email().or(z.literal("")),
  whatsapp: z.string().trim().max(30),
  instagram: z.string().trim().max(200),
  facebook: z.string().trim().max(200),
  tiktok: z.string().trim().max(200),
  x: z.string().trim().max(200),
});

const platformHomePromotionTypeSchema = z.enum(["brand", "product", "offer", "reservation"]);

const platformHomePromotionSchema = z.object({
  id: z.string().uuid().optional(),
  itemType: platformHomePromotionTypeSchema,
  cafeId: z.string().uuid(),
  itemId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(160).optional().default(""),
  subtitle: z.string().trim().max(260).optional().default(""),
  badge: z.string().trim().max(80).optional().default(""),
  locationLabel: z.string().trim().max(120).optional().default(""),
  imageUrl: z.string().trim().max(1000).optional().default(""),
  href: z.string().trim().max(500).optional().default(""),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
});

export const defaultPlatformHomeSettings: PlatformHomeSettings = {
  heroBadge: "شريكك التقني في تطوير علامتك التجارية",
  heroTitle: "منيو تفاعلي - بطاقات ولاء - تسويق في مكان واحد",
  heroDescription:
    "بارنداكسا تساعد العلامة التجارية في إدارة المنيو التفاعلي - نظام الحجوزات والطلبات - نظام العروض والخصومات - متابعة العملاء - بطاقات الولاء - وتقديم تقارير فورية وشاملة من لوحة تحكم واحدة",
  heroSideText:
    "ابن حضور علامتك الرقمية وقدم تجربة أسهل لعملائك من أول زيارة حتى تكرار الشراء",
  featuresTitle: "كل ما تحتاجه لإدارة علامتك التجارية",
  loyaltyDescription:
    "كل نقطة تقرب عميلك أكثر — برنامج ولاء مرن يكافئ الزيارات المتكررة ويحوّل الزائر إلى عميل دائم",
  ctaTitle: "جاهز تطور علامتك التجارية ؟",
  ctaDescription:
    "انضم الآن وابدأ رحلتك مع بارنداكسا — ابن منصتك التقنية وهويتك الرقمية في منصة واحدة",
  aboutUs:
    "بارنداكسا منصة تقنية تساعد العلامات التجارية في قطاع الضيافة على بناء حضور رقمي متكامل وإدارة تجربة العميل",
  vision:
    "أن تصبح بارنداكسا الشريك التقني الأول للعلامات التجارية الطموحة في قطاع الضيافة",
  mission:
    "تمكين العلامات التجارية من النمو بأدوات رقمية عملية تربط التشغيل بالتسويق والولاء",
  carouselIntervalSeconds: 5,
  fontFamily: "system",
  heroBadgeFontSize: 14,
  heroTitleFontSize: 48,
  heroDescriptionFontSize: 18,
  heroSideTextFontSize: 30,
  featuresTitleFontSize: 36,
  loyaltyTitleFontSize: 36,
  loyaltyDescriptionFontSize: 18,
  ctaTitleFontSize: 36,
  ctaDescriptionFontSize: 18,
  aboutCardsFontSize: 15,
};

export const defaultPlatformContactSettings: PlatformContactSettings = {
  email: "",
  whatsapp: "",
  instagram: "",
  facebook: "",
  tiktok: "",
  x: "",
};

function pickFont(value: unknown): PlatformArabicFont {
  return platformArabicFonts.includes(value as PlatformArabicFont)
    ? (value as PlatformArabicFont)
    : defaultPlatformHomeSettings.fontFamily;
}

function pickNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(72, Math.max(10, Math.round(numberValue)));
}

function mapHomeSettings(row?: Record<string, unknown> | null): PlatformHomeSettings {
  if (!row) return defaultPlatformHomeSettings;
  return {
    heroBadge: String(row.hero_badge ?? defaultPlatformHomeSettings.heroBadge),
    heroTitle: String(row.hero_title ?? defaultPlatformHomeSettings.heroTitle),
    heroDescription: String(row.hero_description ?? defaultPlatformHomeSettings.heroDescription),
    heroSideText: String(row.hero_side_text ?? defaultPlatformHomeSettings.heroSideText),
    featuresTitle: String(row.features_title ?? defaultPlatformHomeSettings.featuresTitle),
    loyaltyDescription: String(row.loyalty_description ?? defaultPlatformHomeSettings.loyaltyDescription),
    ctaTitle: String(row.cta_title ?? defaultPlatformHomeSettings.ctaTitle),
    ctaDescription: String(row.cta_description ?? defaultPlatformHomeSettings.ctaDescription),
    aboutUs: String(row.about_us ?? defaultPlatformHomeSettings.aboutUs),
    vision: String(row.vision ?? defaultPlatformHomeSettings.vision),
    mission: String(row.mission ?? defaultPlatformHomeSettings.mission),
    carouselIntervalSeconds: pickNumber(
      row.carousel_interval_seconds,
      defaultPlatformHomeSettings.carouselIntervalSeconds
    ),
    fontFamily: pickFont(row.font_family),
    heroBadgeFontSize: pickNumber(row.hero_badge_font_size, defaultPlatformHomeSettings.heroBadgeFontSize),
    heroTitleFontSize: pickNumber(row.hero_title_font_size, defaultPlatformHomeSettings.heroTitleFontSize),
    heroDescriptionFontSize: pickNumber(
      row.hero_description_font_size,
      defaultPlatformHomeSettings.heroDescriptionFontSize
    ),
    heroSideTextFontSize: pickNumber(row.hero_side_text_font_size, defaultPlatformHomeSettings.heroSideTextFontSize),
    featuresTitleFontSize: pickNumber(row.features_title_font_size, defaultPlatformHomeSettings.featuresTitleFontSize),
    loyaltyTitleFontSize: pickNumber(row.loyalty_title_font_size, defaultPlatformHomeSettings.loyaltyTitleFontSize),
    loyaltyDescriptionFontSize: pickNumber(
      row.loyalty_description_font_size,
      defaultPlatformHomeSettings.loyaltyDescriptionFontSize
    ),
    ctaTitleFontSize: pickNumber(row.cta_title_font_size, defaultPlatformHomeSettings.ctaTitleFontSize),
    ctaDescriptionFontSize: pickNumber(row.cta_description_font_size, defaultPlatformHomeSettings.ctaDescriptionFontSize),
    aboutCardsFontSize: pickNumber(row.about_cards_font_size, defaultPlatformHomeSettings.aboutCardsFontSize),
  };
}

function mapContactSettings(row?: Record<string, unknown> | null): PlatformContactSettings {
  if (!row) return defaultPlatformContactSettings;
  return {
    email: String(row.email ?? ""),
    whatsapp: String(row.whatsapp ?? ""),
    instagram: String(row.instagram ?? ""),
    facebook: String(row.facebook ?? ""),
    tiktok: String(row.tiktok ?? ""),
    x: String(row.x ?? ""),
  };
}

function isMissingPlatformPromotionsTable(error: unknown) {
  const row = error as { code?: string; message?: string } | null;
  const message = String(row?.message ?? "").toLowerCase();
  return (
    row?.code === "42P01" ||
    row?.code === "PGRST205" ||
    (message.includes("platform_home_promotions") && message.includes("does not exist"))
  );
}

function firstNestedRecord(value: unknown): DbRow | null {
  if (Array.isArray(value)) return (value[0] as DbRow | undefined) ?? null;
  return value && typeof value === "object" ? (value as DbRow) : null;
}

function publicCafeHref(slug: unknown) {
  const value = String(slug ?? "").trim();
  return value ? `/c/${value}` : "/";
}

function promotionCtaPath(itemType: PlatformHomePromotionType, cafeSlug: string, itemId?: string | null) {
  if (itemType === "product" && itemId) return `/c/${cafeSlug}/product/${itemId}`;
  if (itemType === "offer") return `/c/${cafeSlug}/products/offers`;
  if (itemType === "reservation") return `/c/${cafeSlug}?tab=reservations`;
  return `/c/${cafeSlug}`;
}

async function signPublishedAsset(
  bucket: "cafe-logos" | "menu-products" | "offer-banners",
  path?: string | null
) {
  if (!path) return undefined;
  const admin = createAdminClient();
  const { data } = await admin.storage.from(bucket).createSignedUrl(path, 10 * 60);
  return data?.signedUrl || undefined;
}

async function signCafeLogo(path?: string | null) {
  return signPublishedAsset("cafe-logos", path);
}

async function mapPromotionRow(row: DbRow): Promise<PlatformHomePromotionItem | null> {
  const cafe = firstNestedRecord(row.cafes);
  if (!cafe) return null;

  const itemType = String(row.item_type ?? "brand") as PlatformHomePromotionType;
  if (!platformHomePromotionTypeSchema.safeParse(itemType).success) return null;

  const settings = firstNestedRecord(cafe.cafe_settings);
  const cafeSlug = String(cafe.slug ?? "");
  const cafeName = String(cafe.name ?? "");
  const brandLogoUrl = await signCafeLogo(settings?.logo_storage_path ? String(settings.logo_storage_path) : null);
  const title = String(row.title ?? "").trim() || cafeName;
  const href = String(row.href ?? "").trim() || promotionCtaPath(itemType, cafeSlug, row.item_id ? String(row.item_id) : null);

  return {
    id: String(row.id),
    itemType,
    cafeId: String(row.cafe_id),
    itemId: row.item_id ? String(row.item_id) : null,
    title,
    subtitle: String(row.subtitle ?? ""),
    badge: String(row.badge ?? ""),
    locationLabel: String(row.location_label ?? ""),
    imageUrl: String(row.image_url ?? "") || brandLogoUrl,
    href,
    active: Boolean(row.active),
    featured: Boolean(row.featured),
    sortOrder: Number(row.sort_order ?? 0),
    brandName: cafeName,
    brandLogoUrl,
  };
}

async function getPublicHomePromotions(): Promise<PlatformHomePromotionItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_home_promotions")
    .select("*, cafes(id, name, slug, cafe_settings(logo_storage_path))")
    .eq("active", true)
    .order("featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    if (isMissingPlatformPromotionsTable(error)) return [];
    console.warn("[getPublicHomePromotions]", error);
    return [];
  }

  const items = await Promise.all(((data ?? []) as DbRow[]).map(mapPromotionRow));
  return items.filter((item): item is PlatformHomePromotionItem => Boolean(item));
}

async function signPlatformMedia(path: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("platform-media")
    .createSignedUrl(path, 10 * 60);
  if (error || !data?.signedUrl) return "";
  return data.signedUrl;
}

async function mapMediaItems(rows: Record<string, unknown>[]) {
  const items: PlatformMediaItem[] = [];
  for (const row of rows) {
    const url = await signPlatformMedia(String(row.storage_path));
    if (!url) continue;
    items.push({
      id: String(row.id),
      placement: String(row.placement) as PlatformMediaPlacement,
      mediaType: String(row.media_type) as "image" | "video",
      url,
      storagePath: String(row.storage_path),
      altText: String(row.alt_text ?? ""),
      isDefault: Boolean(row.is_default),
      sortOrder: Number(row.sort_order ?? 0),
    });
  }
  return items;
}

export async function getPublicPlatformHomeData(): Promise<PublicPlatformHomeData> {
  const admin = createAdminClient();
  const [
    settingsResult,
    contactsResult,
    mediaResult,
    cafesResult,
    eventsResult,
  ] = await Promise.all([
    admin.from("platform_home_settings").select("*").eq("id", "home").maybeSingle(),
    admin.from("platform_contact_settings").select("*").eq("id", "main").maybeSingle(),
    admin
      .from("platform_media_assets")
      .select("*")
      .eq("active", true)
      .in("placement", ["hero", "intro_video", "loyalty_cards"])
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    admin
      .from("cafes")
      .select("id, name, slug, cafe_settings(logo_storage_path)")
      .eq("status", "active")
      .eq("is_public", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
    admin.from("platform_public_events").select("event_type"),
  ]);

  const media = await mapMediaItems((mediaResult.data ?? []) as Record<string, unknown>[]);

  const brands: PublicBrandItem[] = [];
  for (const row of cafesResult.data ?? []) {
    const settings = firstNestedRecord(row.cafe_settings);
    const logoUrl = await signCafeLogo(settings?.logo_storage_path ? String(settings.logo_storage_path) : null);
    brands.push({
      id: String(row.id),
      name: String(row.name),
      logoUrl,
      href: publicCafeHref(row.slug),
    });
  }

  const promotions = await getPublicHomePromotions();
  const controlledBrands = promotions
    .filter((item) => item.itemType === "brand")
    .map((item) => ({
      id: item.id ?? item.cafeId,
      name: item.brandName || item.title,
      logoUrl: item.brandLogoUrl || item.imageUrl,
      locationLabel: item.locationLabel,
      href: item.href,
    }));

  return {
    settings: mapHomeSettings(settingsResult.data as Record<string, unknown> | null),
    contacts: mapContactSettings(contactsResult.data as Record<string, unknown> | null),
    heroImages: media.filter((item) => item.placement === "hero"),
    introVideo: media.find((item) => item.placement === "intro_video"),
    loyaltyImages: media.filter((item) => item.placement === "loyalty_cards"),
    brands: controlledBrands.length ? controlledBrands : brands,
    promotions,
    videoClicks: (eventsResult.data ?? []).filter((event) => event.event_type === "intro_video_click").length,
    videoViews: (eventsResult.data ?? []).filter((event) => event.event_type === "intro_video_view").length,
  };
}

export type AdminClientBrandAvailableItem = {
  key: string;
  itemType: PlatformHomePromotionType;
  cafeId: string;
  itemId?: string | null;
  title: string;
  subtitle?: string;
  badge?: string;
  locationLabel?: string;
  imageUrl?: string;
  href: string;
  brandName: string;
  brandLogoUrl?: string;
};

export type AdminClientBrandsData = {
  promotions: PlatformHomePromotionItem[];
  availableItems: AdminClientBrandAvailableItem[];
  promotionsTableMissing: boolean;
};

async function mapCafeBrandItem(row: DbRow): Promise<AdminClientBrandAvailableItem> {
  const settings = firstNestedRecord(row.cafe_settings);
  const logoUrl = await signCafeLogo(settings?.logo_storage_path ? String(settings.logo_storage_path) : null);
  return {
    key: `brand:${String(row.id)}`,
    itemType: "brand",
    cafeId: String(row.id),
    itemId: null,
    title: String(row.name ?? ""),
    subtitle: String(settings?.description ?? ""),
    badge: "علامة مختارة",
    locationLabel: "",
    imageUrl: logoUrl,
    href: publicCafeHref(row.slug),
    brandName: String(row.name ?? ""),
    brandLogoUrl: logoUrl,
  };
}

async function getCafeLookup(cafes: DbRow[]) {
  const lookup = new Map<string, AdminClientBrandAvailableItem>();
  for (const cafe of cafes) {
    const item = await mapCafeBrandItem(cafe);
    lookup.set(item.cafeId, item);
  }
  return lookup;
}

function getCafeMeta(
  cafeLookup: Map<string, AdminClientBrandAvailableItem>,
  cafeId: unknown
) {
  const id = String(cafeId ?? "");
  return cafeLookup.get(id);
}

async function safeSelectPromotionsForAdmin() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_home_promotions")
    .select("*, cafes(id, name, slug, cafe_settings(logo_storage_path))")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingPlatformPromotionsTable(error)) {
      return { rows: [] as DbRow[], missing: true };
    }
    throw error;
  }

  return { rows: (data ?? []) as DbRow[], missing: false };
}

export async function getAdminClientBrandsData(): Promise<AdminClientBrandsData> {
  await requirePlatformAdmin();
  const admin = createAdminClient();

  const cafesResult = await admin
    .from("cafes")
    .select("id, name, slug, status, is_public, cafe_settings(logo_storage_path, description)")
    .eq("status", "active")
    .eq("is_public", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(80);

  if (cafesResult.error) throw cafesResult.error;

  const cafes = (cafesResult.data ?? []) as DbRow[];
  const cafeLookup = await getCafeLookup(cafes);
  const cafeIds = cafes.map((row) => String(row.id));

  const [productsResult, offersResult, reservationsResult, promotionsResult] = await Promise.all([
    cafeIds.length
      ? admin
          .from("menu_products")
          .select("id, cafe_id, name, description, image_url, image_storage_path, price, available, sort_order")
          .in("cafe_id", cafeIds)
          .eq("available", true)
          .is("deleted_at", null)
          .order("sort_order", { ascending: true })
          .limit(240)
      : Promise.resolve({ data: [], error: null }),
    cafeIds.length
      ? admin
          .from("offers")
          .select("id, cafe_id, title, description, banner_url, banner_storage_path, discount_percent, status, visible_in_cafe, linked_product_id, reservation_service_id")
          .in("cafe_id", cafeIds)
          .eq("visible_in_cafe", true)
          .in("status", ["active", "scheduled", "published"])
          .is("deleted_at", null)
          .eq("is_archived", false)
          .order("created_at", { ascending: false })
          .limit(160)
      : Promise.resolve({ data: [], error: null }),
    cafeIds.length
      ? admin
          .from("reservation_services")
          .select("id, cafe_id, name, description, price, is_free, image_storage_path, active, sort_order")
          .in("cafe_id", cafeIds)
          .eq("active", true)
          .order("sort_order", { ascending: true })
          .limit(160)
      : Promise.resolve({ data: [], error: null }),
    safeSelectPromotionsForAdmin(),
  ]);

  if (productsResult.error) throw productsResult.error;
  if (offersResult.error) throw offersResult.error;
  if (reservationsResult.error) throw reservationsResult.error;

  const availableItems: AdminClientBrandAvailableItem[] = Array.from(cafeLookup.values());

  for (const row of (productsResult.data ?? []) as DbRow[]) {
    const cafe = getCafeMeta(cafeLookup, row.cafe_id);
    if (!cafe) continue;
    const productImage = String(row.image_url ?? "") || await signPublishedAsset("menu-products", row.image_storage_path ? String(row.image_storage_path) : null);
    availableItems.push({
      key: `product:${String(row.id)}`,
      itemType: "product",
      cafeId: String(row.cafe_id),
      itemId: String(row.id),
      title: String(row.name ?? ""),
      subtitle: String(row.description ?? ""),
      badge: row.price == null ? "منتج مختار" : `${Number(row.price)} SAR`,
      locationLabel: "",
      imageUrl: productImage,
      href: promotionCtaPath("product", cafe.href.replace("/c/", ""), String(row.id)),
      brandName: cafe.brandName,
      brandLogoUrl: cafe.brandLogoUrl,
    });
  }

  for (const row of (offersResult.data ?? []) as DbRow[]) {
    const cafe = getCafeMeta(cafeLookup, row.cafe_id);
    if (!cafe) continue;
    const offerImage = String(row.banner_url ?? "") || await signPublishedAsset("offer-banners", row.banner_storage_path ? String(row.banner_storage_path) : null);
    availableItems.push({
      key: `offer:${String(row.id)}`,
      itemType: "offer",
      cafeId: String(row.cafe_id),
      itemId: String(row.id),
      title: String(row.title ?? ""),
      subtitle: String(row.description ?? ""),
      badge: row.discount_percent == null ? "عرض مختار" : `خصم ${Number(row.discount_percent)}%`,
      locationLabel: "",
      imageUrl: offerImage,
      href: promotionCtaPath("offer", cafe.href.replace("/c/", ""), String(row.id)),
      brandName: cafe.brandName,
      brandLogoUrl: cafe.brandLogoUrl,
    });
  }

  for (const row of (reservationsResult.data ?? []) as DbRow[]) {
    const cafe = getCafeMeta(cafeLookup, row.cafe_id);
    if (!cafe) continue;
    const reservationImage = await signPublishedAsset("menu-products", row.image_storage_path ? String(row.image_storage_path) : null);
    availableItems.push({
      key: `reservation:${String(row.id)}`,
      itemType: "reservation",
      cafeId: String(row.cafe_id),
      itemId: String(row.id),
      title: String(row.name ?? ""),
      subtitle: String(row.description ?? ""),
      badge: Boolean(row.is_free) ? "حجز مجاني" : row.price == null ? "خدمة حجز" : `${Number(row.price)} SAR`,
      locationLabel: "",
      imageUrl: reservationImage,
      href: promotionCtaPath("reservation", cafe.href.replace("/c/", ""), String(row.id)),
      brandName: cafe.brandName,
      brandLogoUrl: cafe.brandLogoUrl,
    });
  }

  const promotions = await Promise.all(promotionsResult.rows.map(mapPromotionRow));

  return {
    promotions: promotions.filter((item): item is PlatformHomePromotionItem => Boolean(item)),
    availableItems,
    promotionsTableMissing: promotionsResult.missing,
  };
}

export async function getAdminPlatformContentData() {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const [publicData, mediaResult, postsResult, contactsResult, accountsResult] = await Promise.all([
    getPublicPlatformHomeData(),
    admin.from("platform_media_assets").select("*").order("created_at", { ascending: false }),
    admin.from("platform_social_posts").select("*").order("scheduled_at", { ascending: false }),
    admin.from("platform_contact_requests").select("*").order("created_at", { ascending: false }).limit(30),
    admin.from("platform_social_accounts").select("*").order("provider"),
  ]);
  return {
    ...publicData,
    allMedia: await mapMediaItems((mediaResult.data ?? []) as Record<string, unknown>[]),
    posts: (postsResult.data ?? []).map((row) => ({
      id: String(row.id),
      description: String(row.description ?? ""),
      channels: Array.isArray(row.channels) ? (row.channels as string[]) : [],
      scheduledAt: String(row.scheduled_at),
      status: String(row.status),
    })) as PlatformSocialPost[],
    contactRequests: (contactsResult.data ?? []).map((row) => ({
      id: String(row.id),
      fullName: String(row.full_name ?? ""),
      email: String(row.email),
      message: String(row.message),
      status: String(row.status),
      createdAt: String(row.created_at),
    })) as PlatformContactRequest[],
    accounts: accountsResult.data ?? [],
  };
}

export async function savePlatformHomePromotions(input: PlatformHomePromotionItem[]) {
  const user = await requirePlatformAdmin();
  const parsed = z.array(platformHomePromotionSchema).max(80).parse(input);
  const admin = createAdminClient();

  const { data: existingRows, error: existingError } = await admin
    .from("platform_home_promotions")
    .select("id");

  if (existingError) {
    if (isMissingPlatformPromotionsTable(existingError)) {
      throw new Error("جدول platform_home_promotions غير موجود. يلزم اعتماد migration قبل الحفظ.");
    }
    throw existingError;
  }

  const existingIds = new Set(((existingRows ?? []) as DbRow[]).map((row) => String(row.id)));
  const keptIds = new Set(parsed.map((item) => item.id).filter((id): id is string => Boolean(id)));
  const deleteIds = Array.from(existingIds).filter((id) => !keptIds.has(id));

  if (deleteIds.length) {
    const { error } = await admin.from("platform_home_promotions").delete().in("id", deleteIds);
    if (error) throw error;
  }

  const now = new Date().toISOString();
  const rows = parsed.map((item) => ({
    id: item.id,
    item_type: item.itemType,
    cafe_id: item.cafeId,
    item_id: item.itemId ?? null,
    title: item.title || null,
    subtitle: item.subtitle || null,
    badge: item.badge || null,
    location_label: item.locationLabel || null,
    image_url: item.imageUrl || null,
    href: item.href || null,
    active: item.active,
    featured: item.featured,
    sort_order: item.sortOrder,
    updated_by: user.id,
    updated_at: now,
  }));

  const updates = rows.filter((row) => row.id);
  const inserts = rows
    .filter((row) => !row.id)
    .map(({ id: _id, ...row }) => ({
      ...row,
      created_by: user.id,
      created_at: now,
    }));

  if (updates.length) {
    const { error } = await admin
      .from("platform_home_promotions")
      .upsert(updates, { onConflict: "id" });
    if (error) throw error;
  }

  if (inserts.length) {
    const { error } = await admin.from("platform_home_promotions").insert(inserts);
    if (error) throw error;
  }
}

export async function savePlatformHomeSettings(input: PlatformHomeSettings) {
  const user = await requirePlatformAdmin();
  const parsed = homeSettingsSchema.parse(input);
  const admin = createAdminClient();
  const { error } = await admin.from("platform_home_settings").upsert(
    {
      id: "home",
      hero_badge: parsed.heroBadge,
      hero_title: parsed.heroTitle,
      hero_description: parsed.heroDescription,
      hero_side_text: parsed.heroSideText,
      features_title: parsed.featuresTitle,
      loyalty_description: parsed.loyaltyDescription,
      cta_title: parsed.ctaTitle,
      cta_description: parsed.ctaDescription,
      about_us: parsed.aboutUs,
      vision: parsed.vision,
      mission: parsed.mission,
      carousel_interval_seconds: parsed.carouselIntervalSeconds,
      font_family: parsed.fontFamily,
      hero_badge_font_size: parsed.heroBadgeFontSize,
      hero_title_font_size: parsed.heroTitleFontSize,
      hero_description_font_size: parsed.heroDescriptionFontSize,
      hero_side_text_font_size: parsed.heroSideTextFontSize,
      features_title_font_size: parsed.featuresTitleFontSize,
      loyalty_title_font_size: parsed.loyaltyTitleFontSize,
      loyalty_description_font_size: parsed.loyaltyDescriptionFontSize,
      cta_title_font_size: parsed.ctaTitleFontSize,
      cta_description_font_size: parsed.ctaDescriptionFontSize,
      about_cards_font_size: parsed.aboutCardsFontSize,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`تعذر حفظ محتوى الصفحة الرئيسية: ${error.message}`);
}

export async function savePlatformContactSettings(input: PlatformContactSettings) {
  const user = await requirePlatformAdmin();
  const parsed = contactSettingsSchema.parse(input);
  const admin = createAdminClient();
  const { error } = await admin.from("platform_contact_settings").upsert(
    {
      id: "main",
      email: parsed.email || null,
      whatsapp: parsed.whatsapp || null,
      instagram: parsed.instagram || null,
      facebook: parsed.facebook || null,
      tiktok: parsed.tiktok || null,
      x: parsed.x || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`تعذر حفظ وسائل التواصل: ${error.message}`);
}

export async function disablePlatformMediaAsset(id: string) {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_media_assets")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`تعذر حذف الملف من العرض: ${error.message}`);
}

export async function createPlatformSocialPost(input: {
  description: string;
  channels: string[];
  scheduledAt: string;
}) {
  const user = await requirePlatformAdmin();
  const parsed = z.object({
    description: z.string().trim().min(1).max(2200),
    channels: z.array(z.enum(["facebook", "instagram", "tiktok", "x", "whatsapp"])).min(1),
    scheduledAt: z.string().min(1),
  }).parse(input);
  const admin = createAdminClient();
  const { data, error } = await admin.from("platform_social_posts").insert({
    description: parsed.description,
    channels: parsed.channels,
    scheduled_at: new Date(parsed.scheduledAt).toISOString(),
    status: "scheduled",
    created_by: user.id,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "تعذر حفظ المنشور");
  return String(data.id);
}

export async function removePlatformSocialPost(id: string) {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("platform_social_posts").delete().eq("id", id);
  if (error) throw new Error(`تعذر حذف المنشور: ${error.message}`);
}

export async function recordPlatformPublicEvent(eventType: "intro_video_click" | "intro_video_view") {
  const admin = createAdminClient();
  const { error } = await admin.from("platform_public_events").insert({ event_type: eventType });
  if (error) console.error("[recordPlatformPublicEvent]", error);
}
