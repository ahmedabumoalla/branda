"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

function shouldPrefetch(href: string) {
  if (!href || href.startsWith("#")) return false;
  if (!href.startsWith("/")) return false;
  if (href.startsWith("/api/") || href.startsWith("/_next/")) return false;
  if (/\.(?:png|jpg|jpeg|webp|gif|svg|ico|pdf|zip|xlsx?|csv)(?:\?|$)/i.test(href)) return false;
  return true;
}

export function RoutePrefetcher() {
  const router = useRouter();

  useEffect(() => {
    const prefetched = new Set<string>();

    function prefetch(rawHref: string | null | undefined) {
      if (!rawHref) return;
      let href = rawHref;
      try {
        const url = new URL(rawHref, window.location.origin);
        if (url.origin !== window.location.origin) return;
        href = `${url.pathname}${url.search}`;
      } catch {
        return;
      }

      if (!shouldPrefetch(href) || prefetched.has(href)) return;
      prefetched.add(href);
      router.prefetch(href);
    }

    const onPointerEnter = (event: Event) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (anchor) prefetch(anchor.getAttribute("href"));
    };

    document.addEventListener("pointerover", onPointerEnter, { passive: true });
    document.addEventListener("touchstart", onPointerEnter, { passive: true });

    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
    const idleId = window.setTimeout(() => {
      for (const anchor of anchors.slice(0, 60)) {
        prefetch(anchor.getAttribute("href"));
      }
    }, 900);

    return () => {
      document.removeEventListener("pointerover", onPointerEnter);
      document.removeEventListener("touchstart", onPointerEnter);
      window.clearTimeout(idleId);
    };
  }, [router]);

  return null;
}
