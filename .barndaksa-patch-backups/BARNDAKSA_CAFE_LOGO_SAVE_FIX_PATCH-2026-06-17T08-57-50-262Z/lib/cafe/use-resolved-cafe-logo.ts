"use client";

import { useEffect, useState } from "react";
import {
  getLocalAssetObjectUrl,
  revokeObjectUrl,
} from "@/lib/cafe/local-asset-store";
import type { CafeSettings } from "@/lib/mock/cafe-settings";

export function useResolvedCafeLogoUrl(
  settings: CafeSettings,
  previewUrl?: string
) {
  const [logoUrl, setLogoUrl] = useState<string | undefined>(previewUrl ?? settings.logoDataUrl);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;

    async function load() {
      if (previewUrl) {
        setLogoUrl(previewUrl);
        return;
      }

      if (settings.logoAssetId) {
        objectUrl = await getLocalAssetObjectUrl(settings.logoAssetId);
        if (!cancelled) setLogoUrl(objectUrl);
        return;
      }

      if (!cancelled) setLogoUrl(settings.logoDataUrl);
    }

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) revokeObjectUrl(objectUrl);
    };
  }, [settings.logoAssetId, settings.logoDataUrl, previewUrl]);

  return logoUrl;
}
