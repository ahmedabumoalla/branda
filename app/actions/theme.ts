"use server";

import { updateOwnerThemeId, upsertCustomIdentity, getOwnerCustomIdentity } from "@/lib/data/theme";
import type { CafeThemeId } from "@/lib/mock/cafe-theme";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";

export async function adoptThemeAction(_themeId: CafeThemeId) {
  await updateOwnerThemeId("brand-identity-custom");
}

export async function saveCustomIdentityAction(identity: CustomIdentityTheme) {
  await upsertCustomIdentity({
    palette: identity.palette,
    backgroundScope: identity.backgroundScope,
    backgroundFit: identity.backgroundFit,
    overlayStrength: identity.overlayStrength,
    featuredSectionMode: identity.featuredSectionMode,
    featuredCategoryId: identity.featuredCategoryId ?? null,
    logoStoragePath: identity.logoAssetId ?? null,
    backgroundStoragePath: identity.backgroundAssetId ?? null,
  });
}

export async function fetchOwnerCustomIdentityAction() {
  return getOwnerCustomIdentity();
}
