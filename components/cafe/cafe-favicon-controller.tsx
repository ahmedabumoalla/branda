"use client";

import { useEffect } from "react";

type CafeFaviconControllerProps = {
  slug: string;
};

function upsertFaviconLink(rel: string, href: string) {
  const existingLinks = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`),
  );

  const links = existingLinks.length > 0 ? existingLinks : [document.createElement("link")];

  for (const link of links) {
    link.setAttribute("rel", rel);
    link.setAttribute("href", href);
    link.setAttribute("data-barndaksa-cafe-icon", "true");
    if (!link.parentElement) {
      document.head.appendChild(link);
    }
  }
}

export function CafeFaviconController({ slug }: CafeFaviconControllerProps) {
  useEffect(() => {
    if (!slug) return;

    const encodedSlug = encodeURIComponent(slug);
    const version = Date.now().toString();
    const href = `/api/public/cafe/${encodedSlug}/favicon?source=client&v=${version}`;

    upsertFaviconLink("icon", href);
    upsertFaviconLink("shortcut icon", href);
    upsertFaviconLink("apple-touch-icon", href);
  }, [slug]);

  return null;
}
