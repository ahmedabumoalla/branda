"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { getCustomerSession, type BarndaksaCustomerSession } from "@/lib/customer/session";
import { useCafeThemePage } from "@/lib/cafe/use-cafe-theme-page";
import { useCustomIdentityVisuals } from "@/lib/cafe/use-custom-identity-visuals";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import { getPreferredCafeDisplayLogoUrl } from "@/lib/cafe/cafe-display-logo";
import {
  buildCustomIdentityCssVars,
  defaultCustomIdentityTheme,
  OVERLAY_OPACITY,
} from "@/lib/mock/custom-identity-theme";
import { ThemedPreviewBanner } from "./themed-preview-banner";
import { ThemedCafeHeader } from "./themed-cafe-header";
import { ThemedCafeFooter } from "./themed-cafe-footer";
import {
  CustomerQuickDock,
  buildCustomerQuickDockItems,
} from "./customer-experience-primitives";
import { getCustomerLoginHref } from "@/lib/cafe/theme-links";
import { publicFeatureAllows } from "@/lib/platform/public-feature-access";

type Props = {
  slug: string;
  children: ReactNode;
  className?: string;
  maxWidth?: string;
  hideHeader?: boolean;
  hideFooter?: boolean;
  hideQuickDock?: boolean;
};

function ThemedCafeShellInner({
  slug,
  children,
  className = "",
  maxWidth = "max-w-6xl",
  hideHeader = false,
  hideFooter = false,
  hideQuickDock = false,
}: Props) {
  const ctx = useCafeThemePage(slug);
  const pathname = usePathname();
  const [customer, setCustomer] = useState<BarndaksaCustomerSession | null>(null);

  const { settings, themeId, previewThemeId, isPreview, customIdentity, features, loadError, hydrated } = ctx;
  const identityConfig = customIdentity ?? defaultCustomIdentityTheme();
  const cafeLogoUrl = useResolvedCafeLogoUrl(settings);
  const { logoUrl: identityLogoUrl, backgroundUrl } = useCustomIdentityVisuals(identityConfig);
  const [customerChecked, setCustomerChecked] = useState(false);

  const identityStyle =
    themeId === "brand-identity-custom"
      ? (buildCustomIdentityCssVars(identityConfig.palette) as CSSProperties)
      : {};

  useEffect(() => {
    let cancelled = false;
    setCustomerChecked(false);
    void getCustomerSession(slug).then((session) => {
      if (cancelled) return;
      setCustomer(session);
      setCustomerChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!hydrated) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#FCF8F3] px-4">
        <p className="text-center font-black text-[#4a4540]">جاري التحميل...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#FCF8F3] px-4">
        <p className="text-center font-black text-[#4a4540]">{loadError}</p>
      </main>
    );
  }

  const showPageBackground =
    backgroundUrl &&
    (identityConfig.backgroundScope === "all-customer-pages" ||
      identityConfig.backgroundScope === "home-only");
  const hasFeature = (feature: Parameters<typeof publicFeatureAllows>[1]) =>
    publicFeatureAllows(features, feature);
  const activeDockItem = pathname.includes("/products") || pathname.includes("/product/")
    ? "products"
    : pathname.includes("/reserve")
      ? "reserve"
      : pathname.includes("/account")
        ? "account"
        : pathname.includes("/login") || pathname.includes("/register")
          ? "account"
          : "home";

  return (
    <main
      dir="rtl"
      className="brand-identity-custom-theme barndaksa-cinematic-page relative min-h-screen bg-[var(--ci-page-bg,#FCF8F3)] pb-24 text-[var(--ci-page-fg,#311912)] md:pb-0"
      style={identityStyle}
    >
      {showPageBackground ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${backgroundUrl})`,
              backgroundSize: identityConfig.backgroundFit,
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0"
            style={{
              backgroundColor: `rgba(0,0,0,${OVERLAY_OPACITY[identityConfig.overlayStrength]})`,
            }}
          />
        </>
      ) : null}

      <div className="relative z-10">
        <ThemedPreviewBanner themeId="brand-identity-custom" visible={isPreview} />
        {!hideHeader ? (
          <ThemedCafeHeader
            slug={slug}
            cafeName={settings.cafeName}
            logoUrl={getPreferredCafeDisplayLogoUrl(cafeLogoUrl, identityLogoUrl)}
            themeId="brand-identity-custom"
            customer={customer}
            checkingCustomer={!customerChecked}
            previewThemeId={previewThemeId}
            features={features}
          />
        ) : null}
        <div className={`brand-cafe-fields barndaksa-cinematic-stage mx-auto ${maxWidth} px-4 py-6 sm:px-6 sm:py-8 ${className}`}>
          {children}
        </div>
        {!hideFooter ? (
          <div className={`mx-auto ${maxWidth} px-4 pb-6 sm:px-6`}>
            <ThemedCafeFooter slug={slug} cafeName={settings.cafeName} themeId="brand-identity-custom" />
          </div>
        ) : null}
        {!hideQuickDock ? (
          <CustomerQuickDock
            items={buildCustomerQuickDockItems({
              slug,
              homeHref: ctx.path(""),
              productsHref: ctx.path("products/popular"),
              reserveHref: ctx.path("reserve"),
              loyaltyHref: ctx.path("rewards"),
              accountHref: ctx.path("account"),
              loginHref: getCustomerLoginHref(slug, `/c/${slug}/account`, previewThemeId),
              isCustomer: customerChecked ? Boolean(customer) : true,
              hasProducts: hasFeature("menu"),
              hasReservations: hasFeature("reservations"),
              hasLoyalty: hasFeature("loyalty"),
              active: activeDockItem,
            })}
          />
        ) : null}
      </div>
    </main>
  );
}

export function ThemedCafeShell(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FCF8F3]" />}>
      <ThemedCafeShellInner {...props} />
    </Suspense>
  );
}

export { useCafeThemePage };
