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
import type { CafeSettings } from "@/lib/mock/cafe-settings";

const publicUrlCache = new Map<string, { url: string; expiresAt: number }>();

function canRenderImageValue(value?: string | null): boolean {
  return (
    isHttpImageUrl(value) ||
    isLegacyDataImageUrl(value) ||
    Boolean(value?.startsWith("/"))
  );
}

function getRenderableImageValue(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const next = value.trim();
  return canRenderImageValue(next) ? next : undefined;
}

async function resolvePublicCafeLogoUrl(storagePath: string) {
  const key = `cafe-logos:${storagePath}`;
  const cached = publicUrlCache.get(key);

  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.url;
  }

  const response = await fetch(
    `/api/public/storage?bucket=cafe-logos&path=${encodeURIComponent(storagePath)}`,
    { cache: "no-store" }
  );

  if (!response.ok) return undefined;

  const payload = (await response.json()) as { url?: string; expiresIn?: number };
  if (!payload.url) return undefined;

  const expiresIn = Number(payload.expiresIn ?? 3600);
  publicUrlCache.set(key, {
    url: payload.url,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
  });

  return payload.url;
}

export function useResolvedCafeLogoUrl(
  settings: CafeSettings,
  previewUrl?: string
) {
  const [logoUrl, setLogoUrl] = useState<string | undefined>(() =>
    previewUrl ?? getRenderableImageValue(settings.logoDataUrl)
  );

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;

    async function load() {
      if (previewUrl) {
        setLogoUrl(previewUrl);
        return;
      }

      const fallback = getRenderableImageValue(settings.logoDataUrl);
      const assetId =
        typeof settings.logoAssetId === "string" ? settings.logoAssetId.trim() : "";

      if (assetId.length > 0) {
        const renderableAssetUrl = getRenderableImageValue(assetId);
        if (renderableAssetUrl) {
          if (!cancelled) setLogoUrl(renderableAssetUrl);
          return;
        }

        // Production cafe logos are saved as Supabase Storage paths.
        // Resolve these paths through the public storage API before trying legacy local assets.
        if (assetId.indexOf("/") >= 0) {
          const signedUrl = await resolvePublicCafeLogoUrl(assetId);
          if (!cancelled && signedUrl) {
            setLogoUrl(signedUrl);
            return;
          }
        }

        // Keep support for older local IndexedDB logo IDs used by the mock/local flow.
        objectUrl = await getLocalAssetObjectUrl(assetId);
        if (objectUrl) {
          if (!cancelled) setLogoUrl(objectUrl);
          return;
        }
      }

      if (!cancelled) setLogoUrl(fallback);
    }

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) revokeObjectUrl(objectUrl);
    };
  }, [settings.logoAssetId, settings.logoDataUrl, previewUrl]);

  return logoUrl;
}
