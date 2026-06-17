"use client";

import { useEffect, useState } from "react";
import {
  getLocalAssetObjectUrl,
  revokeObjectUrl,
} from "@/lib/cafe/local-asset-store";
import { isHttpImageUrl, isLegacyDataImageUrl } from "@/lib/cafe/image-asset-pipeline";
import type { CustomIdentityTheme } from "@/lib/mock/custom-identity-theme";
import { cachedRequest } from "@/lib/performance/browser-cache";

type PreviewUrls = {
  logoUrl?: string;
  backgroundUrl?: string;
};

const publicUrlCache = new Map<string, string>();

async function resolvePublicStorageUrl(bucket: string, path: string) {
  const key = `${bucket}:${path}`;
  const cached = publicUrlCache.get(key);
  if (cached) return cached;

  return cachedRequest(`public-storage:${key}`, 60 * 60_000, async () => {
    const response = await fetch(
      `/api/public/storage?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`,
      { cache: "no-store" }
    );

    if (!response.ok) return undefined;

    const payload = (await response.json()) as { url?: string };
    if (payload.url) {
      publicUrlCache.set(key, payload.url);
    }

    return payload.url;
  });
}

async function resolveAssetUrl(assetId: string | undefined, bucket: string) {
  if (!assetId) return undefined;

  if (isHttpImageUrl(assetId) || isLegacyDataImageUrl(assetId)) {
    return assetId;
  }

  const localObjectUrl = await getLocalAssetObjectUrl(assetId);
  if (localObjectUrl) return localObjectUrl;

  if (assetId.includes("/")) {
    return resolvePublicStorageUrl(bucket, assetId);
  }

  return undefined;
}

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
      resolvedLogoUrl =
        preview?.logoUrl ??
        (await resolveAssetUrl(identity.logoAssetId, "cafe-logos")) ??
        identity.legacyLogoDataUrl;

      resolvedBackgroundUrl =
        preview?.backgroundUrl ??
        (await resolveAssetUrl(identity.backgroundAssetId, "cafe-backgrounds")) ??
        identity.legacyBackgroundImageDataUrl;

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
