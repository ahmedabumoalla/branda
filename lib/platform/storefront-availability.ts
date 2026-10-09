import "server-only";

/** Archived storefront functionality is opt-in on the server, never via a URL or client flag. */
export function isStorefrontEnabled() {
  return process.env.STOREFRONT_ENABLED === "true";
}

export function requireStorefrontEnabled() {
  if (!isStorefrontEnabled()) throw new Error("الفرع الإلكتروني غير متاح حاليًا");
}

export function isStorefrontPath(pathname: string) {
  return ["/c", "/api/public/cafe", "/api/customer-fast", "/api/pwa"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function storefrontUnavailableResponse() {
  return new Response("الخدمة غير متاحة حاليًا", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
