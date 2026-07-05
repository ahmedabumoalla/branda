"use client";

import { useEffect } from "react";
import { trackCafeVisitAction } from "@/app/actions/platform-upgrade";

type Props = {
  slug: string;
};

export function PublicCafeVisitTracker({ slug }: Props) {
  useEffect(() => {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!normalizedSlug) return;

    const sessionKey = `barndaksa_visit_session_${normalizedSlug}`;
    let sessionId = sessionStorage.getItem(sessionKey);

    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(sessionKey, sessionId);
    }

    const path = window.location.pathname;
    const pingKey = `barndaksa_visit_ping_${normalizedSlug}_${path}`;
    const lastPing = Number(sessionStorage.getItem(pingKey) ?? 0);
    if (Date.now() - lastPing < 15 * 60_000) return;
    sessionStorage.setItem(pingKey, String(Date.now()));

    void trackCafeVisitAction({
      slug: normalizedSlug,
      sessionId,
      path,
      referrer: document.referrer || undefined,
    }).catch((error) => console.warn("[PublicCafeVisitTracker]", error));
  }, [slug]);

  return null;
}
