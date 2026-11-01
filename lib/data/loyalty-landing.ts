import "server-only";
import { cache } from "react";
import { getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { getLoyaltyBrand } from "@/lib/data/loyalty-experience";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

/** Resolve each request against current public entitlement, never a cached catalog. */
export const getPublicLoyaltyLanding = cache(async (slug: string) => {
  const features = await getPublicCafeFeatureCodesBySlug(slug);
  if (!featureCodesAllow(features, "loyalty") || featureCodesAllow(features, "menu")) return null;
  const brand = await getLoyaltyBrand(slug);
  return brand?.program.enabled ? brand : null;
});
