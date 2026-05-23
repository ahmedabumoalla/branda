import type { CafeSettings } from "@/lib/mock/cafe-settings";

export type CafeDomainLinkStatus = "غير مربوط" | "بانتظار التحقق" | "مربوط";

export type CafeDomainSettings = {
  customDomain?: string;
  domainStatus: CafeDomainLinkStatus;
};

export const CAFE_DOMAIN_SETTINGS_KEY = "branda_qatrah_domain_settings";

const DEFAULT_PLATFORM_DOMAIN =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_BRANDA_PUBLIC_DOMAIN) ||
  "branda.local";

export function getPlatformPublicDomain() {
  return DEFAULT_PLATFORM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function normalizeCafeDomainInput(domain: string) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/^www\./, "");
}

export function getCafeSubdomainHost(slug: string) {
  return `${slug}.${getPlatformPublicDomain()}`;
}

export function getCafeDisplayDomain(
  slug: string,
  settings?: Pick<CafeSettings, "customDomain" | "domainStatus"> | null
) {
  const custom = settings?.customDomain?.trim();
  if (custom && settings?.domainStatus === "مربوط") {
    return normalizeCafeDomainInput(custom);
  }
  return getCafeSubdomainHost(slug);
}

type PublicUrlOptions = {
  path?: string;
  previewTheme?: string;
  origin?: string;
};

export function getCafePublicUrl(slug: string, options?: PublicUrlOptions) {
  const path = options?.path ?? "";
  const normalizedPath = path.startsWith("/") ? path : path ? `/${path}` : "";

  const previewTheme = options?.previewTheme;
  const query = previewTheme
    ? `?previewTheme=${encodeURIComponent(previewTheme)}`
    : "";

  if (options?.origin) {
    const base = options.origin.replace(/\/$/, "");
    const routePath = `/c/${slug}${normalizedPath}`;
    return `${base}${routePath}${query}`;
  }

  if (typeof window !== "undefined") {
    const base = window.location.origin;
    const routePath = `/c/${slug}${normalizedPath}`;
    return `${base}${routePath}${query}`;
  }

  const routePath = `/c/${slug}${normalizedPath}`;
  return `https://${getPlatformPublicDomain()}${routePath}${query}`;
}

/** يحل slug من hostname (مستقبلي) أو pathname الحالي */
export function resolveCafeSlugFromHost(hostname: string, pathname: string) {
  const platformDomain = getPlatformPublicDomain();
  const host = hostname.toLowerCase().split(":")[0];

  if (host.endsWith(`.${platformDomain}`) && host !== platformDomain) {
    const sub = host.replace(`.${platformDomain}`, "");
    if (sub && !sub.includes(".")) return sub;
  }

  const match = pathname.match(/^\/c\/([^/]+)/);
  return match?.[1] ?? null;
}

export const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";

export function getDomainSetupInstructions(slug: string) {
  return {
    cname: VERCEL_CNAME_TARGET,
    subdomain: getCafeSubdomainHost(slug),
    note:
      "لتفعيل دومين خاص: أضف سجل CNAME يشير إلى cname.vercel-dns.com ثم انتظر التحقق من لوحة برندة.",
  };
}
