import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
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

export async function getOwnerCafeSettings(): Promise<CafeSettings> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
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
      ownerName: "",
      ownerEmail: "",
      ownerPhone: "",
      description: "",
      domainStatus: "غير مربوط",
    };
  }

  const settings = mapDbSettingsToCafeSettings(cafe.slug, data);
  settings.cafeName = cafe.name;
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

export async function updateCafeSettings(input: z.infer<typeof settingsSchema>) {
  const parsed = settingsSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
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

  const { error } = await supabase.from("cafe_settings").upsert(payload, { onConflict: "cafe_id" });
  if (error) throw error;
}

