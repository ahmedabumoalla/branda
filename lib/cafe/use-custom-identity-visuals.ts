"use client";

import { useEffect, useState } from "react";
import {
  getLocalAssetObjectUrl,
  revokeObjectUrl,
} from "@/lib/cafe/local-asset-store";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";

type PreviewUrls = {
  logoUrl?: string;
  backgroundUrl?: string;
};

export function useCustomIdentityVisuals(
  identity: CustomIdentityTheme,
  preview?: PreviewUrls
) {
  const [logoUrl, setLogoUrl] = useState<string | undefined>(preview?.logoUrl);
  const [backgroundUrl, setBackgroundUrl] = useState<string | undefined>(
    preview?.backgroundUrl
  );

  useEffect(() => {
    let cancelled = false;
    let resolvedLogoUrl: string | undefined;
    let resolvedBackgroundUrl: string | undefined;

    async function load() {
      if (preview?.logoUrl) {
        resolvedLogoUrl = preview.logoUrl;
      } else if (identity.logoAssetId) {
        resolvedLogoUrl = await getLocalAssetObjectUrl(identity.logoAssetId);
      } else if (identity.legacyLogoDataUrl) {
        resolvedLogoUrl = identity.legacyLogoDataUrl;
      }

      if (preview?.backgroundUrl) {
        resolvedBackgroundUrl = preview.backgroundUrl;
      } else if (identity.backgroundAssetId) {
        resolvedBackgroundUrl = await getLocalAssetObjectUrl(identity.backgroundAssetId);
      } else if (identity.legacyBackgroundImageDataUrl) {
        resolvedBackgroundUrl = identity.legacyBackgroundImageDataUrl;
      }

      if (!cancelled) {
        setLogoUrl(resolvedLogoUrl);
        setBackgroundUrl(resolvedBackgroundUrl);
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (!preview?.logoUrl && resolvedLogoUrl?.startsWith("blob:")) {
        revokeObjectUrl(resolvedLogoUrl);
      }
      if (!preview?.backgroundUrl && resolvedBackgroundUrl?.startsWith("blob:")) {
        revokeObjectUrl(resolvedBackgroundUrl);
      }
    };
  }, [
    identity.logoAssetId,
    identity.backgroundAssetId,
    identity.legacyLogoDataUrl,
    identity.legacyBackgroundImageDataUrl,
    preview?.logoUrl,
    preview?.backgroundUrl,
  ]);

  return { logoUrl, backgroundUrl };
}
