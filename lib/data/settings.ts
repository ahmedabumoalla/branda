import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { readMaintenanceSessionCookie } from "@/lib/platform/maintenance";
import { mapDbSettingsToCafeSettings } from "@/lib/data/mappers";
import {
  resolvePublishedStoragePathToUrl,
  storageBucketForLogo,
} from "@/lib/storage/resolve-storage-url";
import type { CafeSettings } from "@/lib/mock/cafe-settings";

type PublicSettingsRow = {
  cafe_id: string;
  description: string | null;
  logo_url: string | null;
  logo_storage_path: string | null;
  instagram: string | null;
  whatsapp: string | null;
  theme_id: string;
};

export async function getPublicCafeSettings(slug: string): Promise<CafeSettings | null> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_cafe_public_settings", {
    p_cafe_id: cafe.id,
  });

  if (error) throw error;
  if (!data) {
    return {
      cafeSlug: slug,
      cafeName: cafe.name,
      businessCategory: cafe.business_category ?? "cafes_coffee",
      ownerName: "",
      ownerEmail: "",
      ownerPhone: "",
      description: "",
      domainStatus: "غير مربوط",
    };
  }

  const row = data as PublicSettingsRow;
  const logoFromPath = row.logo_storage_path
    ? await resolvePublishedStoragePathToUrl(storageBucketForLogo(), row.logo_storage_path)
    : undefined;

  return {
    cafeSlug: slug,
    cafeName: cafe.name,
    businessCategory: cafe.business_category ?? "cafes_coffee",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    description: row.description ?? "",
    instagram: row.instagram ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    logoAssetId: row.logo_storage_path ?? undefined,
    logoDataUrl: logoFromPath ?? row.logo_url ?? undefined,
    domainStatus: "غير مربوط",
  };
}

async function requireSettingsContext() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("سجل دخولك للوصول إلى إعدادات العلامة");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (profileError || profile?.status !== "active") throw new Error("هذا الحساب غير مخول لإدارة إعدادات العلامة");
  const cafe = await requireOwnerCafeContext();
  if (profile.role === "platform_admin") {
    const maintenance = await readMaintenanceSessionCookie();
    if (!maintenance || maintenance.adminUserId !== user.id || maintenance.cafeId !== cafe.id || maintenance.expiresAt <= Date.now()) {
      throw new Error("افتح حساب العلامة المطلوب من وضع الصيانة قبل تعديل الإعدادات");
    }
  }
  return { cafe, supabase };
}

export async function getOwnerCafeSettings(): Promise<CafeSettings> {
  const { cafe, supabase } = await requireSettingsContext();
  const { data, error } = await supabase
    .from("cafe_settings")
    .select("*")
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return {
      cafeSlug: cafe.slug,
      cafeName: cafe.name,
      businessCategory: cafe.businessCategory,
      ownerName: "",
      ownerEmail: "",
      ownerPhone: "",
      description: "",
      domainStatus: "غير مربوط",
    };
  }

  const settings = mapDbSettingsToCafeSettings(cafe.slug, data);
  settings.cafeName = cafe.name;
  settings.businessCategory = cafe.businessCategory;
  if (cafe.slug === "brand-406bf519a458" && !data.logo_storage_path && typeof data.logo_url === "string") {
    settings.logoDataUrl = data.logo_url;
  }
  if (data.logo_storage_path) {
    settings.logoAssetId = data.logo_storage_path as string;
    settings.logoDataUrl = await resolvePublishedStoragePathToUrl(
      storageBucketForLogo(),
      data.logo_storage_path as string
    );
  }
  return settings;
}

const settingsSchema = z.object({
  cafeName: z.string().trim().min(1, "أدخل اسم العلامة التجارية").max(160, "اسم العلامة طويل جدًا").refine(value => !/[\u0000-\u001f\u007f]/.test(value), "أدخل اسم علامة صالحًا"),
  ownerName: z.string().optional(),
  ownerEmail: z.string().email().optional().or(z.literal("")),
  ownerPhone: z.string().optional(),
  taxNumber: z.string().optional(),
  commercialRegister: z.string().optional(),
  maroofCertificate: z.string().optional(),
  instagram: z.string().optional(),
  whatsapp: z.string().optional(),
  description: z.string().optional(),
  customDomain: z.string().optional(),
  domainStatus: z.string().optional(),
  purchasedDomain: z.string().optional(),
  purchasedDomainStatus: z.string().optional(),
  logoStoragePath: z.string().optional().nullable(),
  themeId: z.string().optional(),
});

export async function updateCafeSettings(input: z.infer<typeof settingsSchema>): Promise<CafeSettings> {
  const parsed = settingsSchema.parse(input);
  const { cafe, supabase } = await requireSettingsContext();

  const payload = {
    cafe_name: parsed.cafeName,
    owner_name: parsed.ownerName ?? null,
    owner_email: parsed.ownerEmail || null,
    owner_phone: parsed.ownerPhone ?? null,
    tax_number: parsed.taxNumber ?? null,
    commercial_register: parsed.commercialRegister ?? null,
    maroof_certificate: parsed.maroofCertificate ?? null,
    instagram: parsed.instagram ?? null,
    whatsapp: parsed.whatsapp ?? null,
    description: parsed.description ?? null,
    custom_domain: parsed.customDomain ?? null,
    domain_status: parsed.domainStatus ?? null,
    purchased_domain: parsed.purchasedDomain ?? null,
    purchased_domain_status: parsed.purchasedDomainStatus ?? null,
    logo_url: null,
    logo_storage_path: parsed.logoStoragePath ?? null,
    theme_id: parsed.themeId,
  };

  const { data, error } = await supabase.rpc("save_owner_cafe_settings", { p_cafe_id: cafe.id, p_settings: payload });
  if (error) throw new Error(error.code === "42501" ? "ليست لديك صلاحية تعديل إعدادات هذه العلامة" : "تعذر حفظ إعدادات العلامة حاول مرة أخرى");
  if (!data || data.cafe?.id !== cafe.id || data.settings?.cafe_id !== cafe.id || typeof data.cafe.name !== "string" || typeof data.cafe.slug !== "string") {
    throw new Error("لم يتم تأكيد حفظ الإعدادات أعد المحاولة");
  }
  // Use the transaction's saved rows, not the request-cached cafe context.
  const saved = mapDbSettingsToCafeSettings(data.cafe.slug, data.settings);
  saved.cafeName = data.cafe.name;
  saved.businessCategory = data.cafe.business_category ?? cafe.businessCategory;
  if (data.settings.logo_storage_path) {
    saved.logoDataUrl = await resolvePublishedStoragePathToUrl(storageBucketForLogo(), data.settings.logo_storage_path);
  }
  return saved;
}

