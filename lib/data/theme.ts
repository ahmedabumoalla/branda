import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { mapDbCustomIdentity } from "@/lib/data/mappers";
import {
  resolvePublishedStoragePathToUrl,
  storageBucketForBackground,
  storageBucketForLogo,
} from "@/lib/storage/resolve-storage-url";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import type { CafeThemeId } from "@/lib/mock/cafe-theme";

export async function getPublicThemeId(slug: string): Promise<CafeThemeId> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return "soft-cream-3d";

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_cafe_public_settings", { p_cafe_id: cafe.id });
  const row = data as { theme_id?: string } | null;
  return (row?.theme_id as CafeThemeId) ?? "soft-cream-3d";
}

export async function getPublicCustomIdentity(slug: string): Promise<CustomIdentityTheme | null> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("cafe_custom_identity")
    .select("*")
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (!data) return null;
  const identity = mapDbCustomIdentity(data);

  if (data.logo_storage_path) {
    identity.logoAssetId = data.logo_storage_path as string;
    identity.legacyLogoDataUrl = await resolvePublishedStoragePathToUrl(
      storageBucketForLogo(),
      data.logo_storage_path as string
    );
  }
  if (data.background_storage_path) {
    identity.backgroundAssetId = data.background_storage_path as string;
    identity.legacyBackgroundImageDataUrl = await resolvePublishedStoragePathToUrl(
      storageBucketForBackground(),
      data.background_storage_path as string
    );
  }

  return identity;
}

export async function updateOwnerThemeId(themeId: CafeThemeId) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("cafe_settings")
    .upsert({ cafe_id: cafe.id, theme_id: themeId }, { onConflict: "cafe_id" });
  if (error) throw error;
}

const identitySchema = z.object({
  palette: z.record(z.string(), z.string()),
  backgroundScope: z.string(),
  backgroundFit: z.string(),
  overlayStrength: z.string(),
  featuredSectionMode: z.string(),
  featuredCategoryId: z.string().uuid().optional().nullable(),
  logoStoragePath: z.string().optional().nullable(),
  backgroundStoragePath: z.string().optional().nullable(),
});

export async function upsertCustomIdentity(input: z.infer<typeof identitySchema>) {
  const parsed = identitySchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { error } = await supabase.from("cafe_custom_identity").upsert(
    {
      cafe_id: cafe.id,
      palette: parsed.palette,
      background_scope: parsed.backgroundScope,
      background_fit: parsed.backgroundFit,
      overlay_strength: parsed.overlayStrength,
      featured_section_mode: parsed.featuredSectionMode,
      featured_category_id: parsed.featuredCategoryId ?? null,
      logo_storage_path: parsed.logoStoragePath ?? null,
      logo_url: null,
      background_storage_path: parsed.backgroundStoragePath ?? null,
      background_url: null,
    },
    { onConflict: "cafe_id" }
  );
  if (error) throw error;
}

export async function getOwnerCustomIdentity(): Promise<CustomIdentityTheme | null> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("cafe_custom_identity")
    .select("*")
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (!data) return null;
  const identity = mapDbCustomIdentity(data);
  if (data.logo_storage_path) {
    identity.logoAssetId = data.logo_storage_path as string;
    identity.legacyLogoDataUrl = await resolvePublishedStoragePathToUrl(
      storageBucketForLogo(),
      data.logo_storage_path as string
    );
  }
  if (data.background_storage_path) {
    identity.backgroundAssetId = data.background_storage_path as string;
    identity.legacyBackgroundImageDataUrl = await resolvePublishedStoragePathToUrl(
      storageBucketForBackground(),
      data.background_storage_path as string
    );
  }
  return identity;
}

export async function getOwnerThemeId(): Promise<CafeThemeId> {
  const cafe = await requireOwnerCafeContext();
  return getPublicThemeId(cafe.slug);
}
