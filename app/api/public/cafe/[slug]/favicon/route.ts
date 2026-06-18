import { NextResponse } from "next/server";
import {
  DEFAULT_BARNDAKSA_CAFE_LOGO,
  getPreferredCafeDisplayLogoUrl,
} from "@/lib/cafe/cafe-display-logo";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity } from "@/lib/data/theme";
import { publicCacheHeader } from "@/lib/performance/server-cache";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

type Props = {
  params: Promise<{ slug: string }>;
};

const ICON_TTL_SECONDS = 10 * 60;
const FALLBACK_ANY_ICONS = {
  192: "/brand/barndaksa-app-icon-192.png",
  512: "/brand/barndaksa-app-icon-512.png",
} as const;
const FALLBACK_MASKABLE_ICONS = {
  192: "/brand/barndaksa-app-icon-192.png",
  512: "/brand/barndaksa-maskable-icon-512.png",
} as const;

function normalizeIconSize(value: string | null) {
  return value === "512" ? 512 : 192;
}

function normalizeIconPurpose(value: string | null) {
  return value === "maskable" ? "maskable" : "any";
}

function fallbackIcon(size: 192 | 512, purpose: "any" | "maskable") {
  if (purpose === "maskable") return FALLBACK_MASKABLE_ICONS[size];
  return FALLBACK_ANY_ICONS[size];
}

async function loadCafeIconUrl(slug: string) {
  const [settings, identity] = await Promise.all([
    getPublicCafeSettings(slug).catch(() => null),
    getPublicCustomIdentity(slug).catch(() => null),
  ]);

  return getPreferredCafeDisplayLogoUrl(
    settings?.logoDataUrl,
    identity?.legacyLogoDataUrl,
  );
}

export async function GET(request: Request, { params }: Props) {
  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();
  const requestUrl = new URL(request.url);
  const version = requestUrl.searchParams.get("v")?.slice(0, 160) || "default";
  const size = normalizeIconSize(requestUrl.searchParams.get("size"));
  const purpose = normalizeIconPurpose(requestUrl.searchParams.get("purpose"));

  const iconUrl = await cachedServerValue(
    `public-cafe-favicon:${normalizedSlug}:${version}:${size}:${purpose}`,
    ICON_TTL_SECONDS * 1000,
    () => loadCafeIconUrl(normalizedSlug),
  );
  const brandIconUrl =
    iconUrl && iconUrl !== DEFAULT_BARNDAKSA_CAFE_LOGO ? iconUrl : null;

  const redirectUrl = new URL(brandIconUrl ?? fallbackIcon(size, purpose), request.url);
  const response = NextResponse.redirect(redirectUrl, 307);
  response.headers.set("Cache-Control", publicCacheHeader(ICON_TTL_SECONDS));
  response.headers.set("x-barndaksa-cafe-favicon", "cached-v4");
  response.headers.set("x-barndaksa-cafe-favicon-source", brandIconUrl ? "brand" : "fallback");
  return response;
}
