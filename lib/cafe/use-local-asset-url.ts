"use client";

import { useEffect, useState } from "react";
import {
  getLocalAssetObjectUrl,
  revokeObjectUrl,
} from "@/lib/cafe/local-asset-store";
import {
  isHttpImageUrl,
  isLegacyDataImageUrl,
} from "@/lib/cafe/image-asset-pipeline";

export function useLocalAssetUrl(
  assetId?: string,
  fallbackSrc?: string | null,
  previewUrl?: string
) {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (previewUrl) return previewUrl;
    if (isLegacyDataImageUrl(fallbackSrc) || isHttpImageUrl(fallbackSrc)) {
      return fallbackSrc ?? undefined;
    }
    return undefined;
  });

  useEffect(() => {
    if (previewUrl) {
      setUrl(previewUrl);
      return;
    }

    let cancelled = false;
    let objectUrl: string | undefined;

    async function load() {
      if (assetId) {
        objectUrl = await getLocalAssetObjectUrl(assetId);
        if (!cancelled) {
          setUrl(
            objectUrl ??
              (isLegacyDataImageUrl(fallbackSrc) || isHttpImageUrl(fallbackSrc)
                ? fallbackSrc ?? undefined
                : undefined)
          );
        }
        return;
      }

      if (!cancelled) {
        setUrl(
          isLegacyDataImageUrl(fallbackSrc) || isHttpImageUrl(fallbackSrc)
            ? fallbackSrc ?? undefined
            : undefined
        );
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) revokeObjectUrl(objectUrl);
    };
  }, [assetId, fallbackSrc, previewUrl]);

  return url;
}
