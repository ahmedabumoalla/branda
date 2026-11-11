import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapLoyaltyBrandAppearance } from "@/lib/data/loyalty-identity";
import { mapLoyaltyProgramSnapshot } from "@/lib/data/loyalty-cards";
import { standaloneLogoVariant } from "@/lib/menu/logo-variants";
import { resolvePublishedStoragePathToUrl, storageBucketForLogo } from "@/lib/storage/resolve-storage-url";

type Snapshot = {
  requiresSessionVisibility?: boolean;
  cafe: { id: string; slug: string; name: string; name_en: string | null; business_category: string | null };
  settings: { logo_url: string | null; logo_storage_path: string | null } | null;
  appearance: Record<string, unknown> | null;
  program: Record<string, unknown> | null;
};

/** One fresh database statement, never a persistent authorization or membership cache. */
export async function loadPublicLoyaltyBrandSnapshot(slug: string) {
  const { data, error } = await createAdminClient().rpc("get_loyalty_brand_read_snapshot", { p_slug: slug });
  if (error) throw new Error("تعذر تحميل برنامج الولاء");
  if (!data) return null;
  const snapshot = data as Snapshot;
  // Private owner/admin previews keep their existing session-bound RLS path.
  if (snapshot.requiresSessionVisibility === true) return "session" as const;
  const { cafe, settings } = snapshot;
  if (!cafe?.id || !cafe.slug) throw new Error("تعذر تحميل هوية برنامج الولاء");
  const appearance = mapLoyaltyBrandAppearance(cafe.slug, cafe.business_category, snapshot.appearance);
  const program = mapLoyaltyProgramSnapshot(snapshot.program, cafe.slug, appearance);
  const source = settings?.logo_storage_path || settings?.logo_url || appearance.logoPath || appearance.logoUrl;
  let logoUrl = standaloneLogoVariant(cafe.id, source);
  if (!logoUrl) {
    // Storage permission remains independent from database visibility. Reuse only
    // this request's result if the same source is present in both identity rows.
    const paths = new Map<string, Promise<string | undefined>>();
    const resolve = (path: string) => {
      let result = paths.get(path);
      if (!result) { result = resolvePublishedStoragePathToUrl(storageBucketForLogo(), path); paths.set(path, result); }
      return result;
    };
    logoUrl = (settings?.logo_storage_path ? await resolve(settings.logo_storage_path) : null)
      || settings?.logo_url
      || (appearance.logoPath ? await resolve(appearance.logoPath) : appearance.logoUrl)
      || (cafe.slug === "rast" ? "/menu-logos/kawakib-transparent-20261008.png" : null);
  }
  return {
    cafeId: String(cafe.id),
    identity: {
      businessCategory: appearance.businessCategory, slug: String(cafe.slug), name: String(cafe.name), nameEn: String(cafe.name_en ?? ""),
      logoUrl, logoDisplayUrl: logoUrl ? `/api/wallet/brand/${encodeURIComponent(cafe.slug)}/logo?v=brand-stamps-v1` : null,
      ...(cafe.slug === "rast" ? {} : { cardBackground: program.cardBackground, cardForeground: program.cardForeground, cardAccent: program.cardAccent }),
    },
    program,
  };
}
