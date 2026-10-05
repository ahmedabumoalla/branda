"use client";

import { useEffect, useRef } from "react";
import type { EngagementKind } from "@/lib/analytics/brand-analytics";
import { trackBrandEngagement } from "@/lib/analytics/public-tracking";

export function PublicPageAnalytics({ slug, kind }: { slug: string; kind: EngagementKind }) {
  const sent = useRef(new Set<string>());
  useEffect(() => {
    const key = `${slug}:${kind}`;
    const record = () => {
      if (document.visibilityState !== "visible" || sent.current.has(key)) return;
      sent.current.add(key);
      trackBrandEngagement(slug, kind);
    };
    record();
    document.addEventListener("visibilitychange", record);
    return () => document.removeEventListener("visibilitychange", record);
  }, [slug, kind]);
  return null;
}
