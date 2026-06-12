import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/data/cafes";

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
};

export type PublicPlatformHomeData = {
  settings: PlatformHomeSettings;
  contacts: PlatformContactSettings;
  heroImages: PlatformMediaItem[];
  introVideo?: PlatformMediaItem;
  loyaltyImages: PlatformMediaItem[];
  brands: PublicBrandItem[];
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
  carouselIntervalSeconds: z.number().int().min(4).max(12),
});

const contactSettingsSchema = z.object({
  email: z.string().trim().email().or(z.literal("")),
  whatsapp: z.string().trim().max(30),
  instagram: z.string().trim().max(200),
  facebook: z.string().trim().max(200),
  tiktok: z.string().trim().max(200),
  x: z.string().trim().max(200),
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
};

export const defaultPlatformContactSettings: PlatformContactSettings = {
  email: "",
  whatsapp: "",
  instagram: "",
  facebook: "",
  tiktok: "",
  x: "",
};

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
    carouselIntervalSeconds: Number(
      row.carousel_interval_seconds ?? defaultPlatformHomeSettings.carouselIntervalSeconds
    ),
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
      .order("sort_order"),
    admin
      .from("cafes")
      .select("id, name, cafe_settings(logo_storage_path)")
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
    const settings = row.cafe_settings as { logo_storage_path?: string | null } | null;
    let logoUrl: string | undefined;
    if (settings?.logo_storage_path) {
      const { data } = await admin.storage
        .from("cafe-logos")
        .createSignedUrl(settings.logo_storage_path, 10 * 60);
      logoUrl = data?.signedUrl;
    }
    brands.push({ id: String(row.id), name: String(row.name), logoUrl });
  }

  return {
    settings: mapHomeSettings(settingsResult.data as Record<string, unknown> | null),
    contacts: mapContactSettings(contactsResult.data as Record<string, unknown> | null),
    heroImages: media.filter((item) => item.placement === "hero"),
    introVideo: media.find((item) => item.placement === "intro_video"),
    loyaltyImages: media.filter((item) => item.placement === "loyalty_cards"),
    brands,
    videoClicks: (eventsResult.data ?? []).filter((event) => event.event_type === "intro_video_click").length,
    videoViews: (eventsResult.data ?? []).filter((event) => event.event_type === "intro_video_view").length,
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

export async function savePlatformHomeSettings(input: PlatformHomeSettings) {
  await requirePlatformAdmin();
  const parsed = homeSettingsSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.from("platform_home_settings").upsert({
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
  });
  if (error) throw error;
}

export async function savePlatformContactSettings(input: PlatformContactSettings) {
  await requirePlatformAdmin();
  const parsed = contactSettingsSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.from("platform_contact_settings").upsert({
    id: "main",
    email: parsed.email || null,
    whatsapp: parsed.whatsapp || null,
    instagram: parsed.instagram || null,
    facebook: parsed.facebook || null,
    tiktok: parsed.tiktok || null,
    x: parsed.x || null,
  });
  if (error) throw error;
}

export async function disablePlatformMediaAsset(id: string) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_media_assets")
    .update({ active: false })
    .eq("id", id);
  if (error) throw error;
}

export async function createPlatformSocialPost(input: {
  description: string;
  channels: string[];
  scheduledAt: string;
}) {
  await requirePlatformAdmin();
  const parsed = z.object({
    description: z.string().trim().min(1).max(2200),
    channels: z.array(z.enum(["facebook", "instagram", "tiktok", "x", "whatsapp"])).min(1),
    scheduledAt: z.string().min(1),
  }).parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.from("platform_social_posts").insert({
    description: parsed.description,
    channels: parsed.channels,
    scheduled_at: new Date(parsed.scheduledAt).toISOString(),
    status: "scheduled",
  }).select("id").single();
  if (error || !data) throw error ?? new Error("تعذر حفظ المنشور");
  return String(data.id);
}

export async function removePlatformSocialPost(id: string) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("platform_social_posts").delete().eq("id", id);
  if (error) throw error;
}
