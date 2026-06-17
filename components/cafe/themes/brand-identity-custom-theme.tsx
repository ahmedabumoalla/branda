"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { CafeThemePageProps } from "@/lib/cafe/cafe-theme-types";
import {
  featuredSectionTitle,
  resolveFeaturedProducts,
} from "@/lib/cafe/custom-identity-featured";
import { useCustomIdentityVisuals } from "@/lib/cafe/use-custom-identity-visuals";
import { CafeHeader } from "@/components/cafe/cafe-header";
import { getCafePath } from "@/lib/cafe/theme-links";
import {
  buildCustomIdentityCssVars,
  defaultCustomIdentityTheme,
  OVERLAY_OPACITY,
  type CustomIdentityTheme,
} from "@/lib/mock/custom-identity-theme";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import {
  CafeIdentityBlock,
  ThemeBannerCarousel,
  ThemePageFooter,
  ThemeProductCard,
  ThemeCategoryStrip,
  buildCafeNavItems,
} from "./theme-shared";

import { getPreferredCafeDisplayLogoUrl } from "@/lib/cafe/cafe-display-logo";
type BgTarget = "page" | "hero" | "banner";

function scopeApplies(scope: CustomIdentityTheme["backgroundScope"], target: BgTarget) {
  if (scope === "all-customer-pages" || scope === "home-only") return target === "page";
  if (scope === "hero-only") return target === "hero";
  if (scope === "top-banner") return target === "banner";
  return false;
}

function IdentityBackground({
  identity,
  backgroundUrl,
  target,
  className = "",
  children,
}: {
  identity: CustomIdentityTheme;
  backgroundUrl?: string;
  target: BgTarget;
  className?: string;
  children: ReactNode;
}) {
  if (!backgroundUrl || !scopeApplies(identity.backgroundScope, target)) {
    return <div className={className}>{children}</div>;
  }

  const overlay = OVERLAY_OPACITY[identity.overlayStrength];

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${backgroundUrl})`,
          backgroundSize: identity.backgroundFit,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundColor: `rgba(0,0,0,${overlay})` }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function BrandIdentityCustomTheme(props: CafeThemePageProps) {
  const {
    slug,
    cafeSettings,
    themeId,
    theme,
    bannerOffers,
    previewThemeId,
    availableProducts,
    popularProducts,
    latestProducts,
    cafeLogoUrl,
    customIdentityPreviewUrls,
  } = props;

  const [identity, setIdentity] = useState(
    () => props.customIdentityOverride ?? defaultCustomIdentityTheme()
  );
  const [categories, setCategories] = useState(() => props.menuCategories ?? []);

  useEffect(() => {
    if (props.customIdentityOverride) {
      setIdentity(props.customIdentityOverride);
    }
    if (props.menuCategories) {
      setCategories(props.menuCategories);
    }
  }, [props.customIdentityOverride, props.menuCategories]);

  const { logoUrl: identityLogoUrl, backgroundUrl } = useCustomIdentityVisuals(
    identity,
    customIdentityPreviewUrls
  );

  const cssVars = buildCustomIdentityCssVars(identity.palette) as CSSProperties;
  const logoUrl = getPreferredCafeDisplayLogoUrl(cafeLogoUrl, identityLogoUrl);

  const featuredProducts = useMemo(
    () =>
      resolveFeaturedProducts(
        { availableProducts, popularProducts, latestProducts },
        identity,
        categories
      ),
    [availableProducts, popularProducts, latestProducts, identity, categories]
  );

  const sectionTitle = featuredSectionTitle(identity, categories);

  return (
    <main
      dir="rtl"
      className={`min-h-screen brand-identity-custom-theme ${theme.page}`}
      style={cssVars}
    >
      <IdentityBackground
        identity={identity}
        backgroundUrl={backgroundUrl}
        target="banner"
        className="border-b border-black/5"
      >
        <CafeHeader
          slug={slug}
          cafeName={cafeSettings.cafeName}
          logoUrl={logoUrl}
          themeId={themeId}
          customer={props.customer}
        />
      </IdentityBackground>

      <IdentityBackground identity={identity} backgroundUrl={backgroundUrl} target="page">
        <div className="mx-auto max-w-5xl px-5 py-8">
          <IdentityBackground identity={identity} backgroundUrl={backgroundUrl} target="hero">
            <section className={`rounded-3xl p-8 ${theme.hero}`}>
              <CafeIdentityBlock
                cafeName={cafeSettings.cafeName}
                logoUrl={logoUrl}
                description={cafeSettings.description}
                theme={theme}
              />
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={getCafePath(slug, "products/popular", previewThemeId)}
                  className={`rounded-2xl px-6 py-3 font-black ${theme.button}`}
                >
                  تصفح المنيو
                </Link>
                <Link
                  href={getCafePath(slug, "reserve", previewThemeId)}
                  className={`rounded-2xl px-6 py-3 font-black ${theme.buttonOutline}`}
                >
                  احجز طاولة
                </Link>
              </div>
            </section>
          </IdentityBackground>

          <nav className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {buildCafeNavItems(slug, previewThemeId).map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`rounded-2xl py-4 text-center text-xs font-black ${theme.card}`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <ThemeCategoryStrip
            slug={slug}
            theme={theme}
            previewThemeId={previewThemeId}
            className="mt-6"
          />

          {bannerOffers.length > 0 ? (
            <ThemeBannerCarousel
              slug={slug}
              offers={bannerOffers}
              theme={theme}
              previewThemeId={previewThemeId}
              variant="soft"
            />
          ) : null}

          {featuredProducts.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-4 text-xl font-black">{sectionTitle}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {featuredProducts.map((p) => (
                  <ThemeProductCard
                    key={p.id}
                    slug={slug}
                    product={p}
                    theme={theme}
                    previewThemeId={previewThemeId}
                    size="compact"
                  />
                ))}
              </div>
            </section>
          ) : null}

          <ThemePageFooter slug={slug} cafeName={cafeSettings.cafeName} themeId={themeId} />
        </div>
      </IdentityBackground>
    </main>
  );
}
