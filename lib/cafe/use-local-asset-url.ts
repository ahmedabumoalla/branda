"use client";

import { useEffect, useState } from "react";
import { getLocalAssetObjectUrl, revokeObjectUrl } from "@/lib/cafe/local-asset-store";
import { isHttpImageUrl, isLegacyDataImageUrl } from "@/lib/cafe/image-asset-pipeline";

const publicUrlCache = new Map<string, { url: string; expiresAt: number }>();

function isRenderableUrl(url?: string | null) {
  return Boolean(
    url &&
      (isLegacyDataImageUrl(url) ||
        isHttpImageUrl(url) ||
        url.startsWith("blob:"))
  );
}

async function resolvePublicStorageUrl(bucket: string, path: string) {
  const key = `${bucket}:${path}`;
  const cached = publicUrlCache.get(key);

  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.url;
  }

  const response = await fetch(
    `/api/public/storage?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`,
  );

  if (!response.ok) return undefined;

  const payload = (await response.json()) as { url?: string; expiresIn?: number };

  if (payload.url) {
    const expiresIn = Number(payload.expiresIn ?? 3600);
    publicUrlCache.set(key, {
      url: payload.url,
      expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    });
  }

  return payload.url;
}

export function useLocalAssetUrl(
  assetId?: string,
  fallbackSrc?: string | null,
  previewUrl?: string,
  publicBucket?: string
) {
  const [url, setUrl] = useState<string | undefined>(() =>
    previewUrl ||
    (isRenderableUrl(fallbackSrc) ? fallbackSrc ?? undefined : undefined)
  );

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

        if (objectUrl) {
          if (!cancelled) setUrl(objectUrl);
          return;
        }

        if (publicBucket && assetId.includes("/")) {
          const signedUrl = await resolvePublicStorageUrl(publicBucket, assetId);
          if (!cancelled && signedUrl) {
            setUrl(signedUrl);
            return;
          }
        }
      }

      if (!cancelled) {
        setUrl(isRenderableUrl(fallbackSrc) ? fallbackSrc ?? undefined : undefined);
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) revokeObjectUrl(objectUrl);
    };
  }, [assetId, fallbackSrc, previewUrl, publicBucket]);

  return url;
}
