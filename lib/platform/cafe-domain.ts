import type { CafeSettings } from "@/lib/mock/cafe-settings";

export type CafeDomainLinkStatus = "غير مربوط" | "بانتظار التحقق" | "مربوط";

export type CafeDomainSettings = {
  customDomain?: string;
  domainStatus: CafeDomainLinkStatus;
  purchasedDomain?: string;
  purchasedDomainStatus?: CafeDomainLinkStatus;
};

export type CafeDomainSource =
  | "platform_subdomain"
  | "external_custom_domain"
  | "purchased_domain";

export const CAFE_DOMAIN_SETTINGS_KEY = "barndaksa_qatrah_domain_settings";

const DEFAULT_PLATFORM_DOMAIN =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_BARNDAKSA_PUBLIC_DOMAIN) ||
  "barndaksa.local";

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
  settings?: Pick<
    CafeSettings,
    "customDomain" | "domainStatus" | "purchasedDomain" | "purchasedDomainStatus"
  > | null
) {
  const purchased = settings?.purchasedDomain?.trim();
  if (purchased && settings?.purchasedDomainStatus === "مربوط") {
    return normalizeCafeDomainInput(purchased);
  }
  const custom = settings?.customDomain?.trim();
  if (custom && settings?.domainStatus === "مربوط") {
    return normalizeCafeDomainInput(custom);
  }
  return getCafeSubdomainHost(slug);
}

export function resolveCafeDomainSource(
  settings?: Pick<
    CafeSettings,
    "customDomain" | "domainStatus" | "purchasedDomain" | "purchasedDomainStatus"
  > | null
): CafeDomainSource {
  if (settings?.purchasedDomain && settings.purchasedDomainStatus === "مربوط") {
    return "purchased_domain";
  }
  if (settings?.customDomain && settings.domainStatus === "مربوط") {
    return "external_custom_domain";
  }
  return "platform_subdomain";
}

type PublicUrlOptions = {
  path?: string;
  previewTheme?: string;
  origin?: string;
  settings?: Pick<
    CafeSettings,
    "customDomain" | "domainStatus" | "purchasedDomain" | "purchasedDomainStatus"
  > | null;
};

export function getCafePublicUrl(slug: string, options?: PublicUrlOptions) {
  const path = options?.path ?? "";
  const normalizedPath = path.startsWith("/") ? path : path ? `/${path}` : "";

  const previewTheme = options?.previewTheme;
  const query = previewTheme
    ? `?previewTheme=${encodeURIComponent(previewTheme)}`
    : "";
  const selectedDomain = getCafeDisplayDomain(slug, options?.settings);
  const source = resolveCafeDomainSource(options?.settings);
  const routePath = `/c/${slug}${normalizedPath}`;

  if (options?.origin) {
    const base = options.origin.replace(/\/$/, "");
    const isLocalOrigin = /localhost|127\.0\.0\.1/.test(base);
    if (!isLocalOrigin && source !== "platform_subdomain") {
      const onRoot = normalizedPath === "";
      return `https://${selectedDomain}${onRoot ? "" : normalizedPath}${query}`;
    }
    return `${base}${routePath}${query}`;
  }

  if (typeof window !== "undefined") {
    const base = window.location.origin;
    const isLocalWindow = /localhost|127\.0\.0\.1/.test(window.location.hostname);
    if (!isLocalWindow && source !== "platform_subdomain") {
      const onRoot = normalizedPath === "";
      return `https://${selectedDomain}${onRoot ? "" : normalizedPath}${query}`;
    }
    return `${base}${routePath}${query}`;
  }

  if (process.env.NODE_ENV === "production" && source !== "platform_subdomain") {
    const onRoot = normalizedPath === "";
    return `https://${selectedDomain}${onRoot ? "" : normalizedPath}${query}`;
  }
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
      "لتفعيل دومين خاص: أضف سجل CNAME يشير إلى cname.vercel-dns.com ثم انتظر التحقق من لوحة بارنداكسا.",
  };
}
