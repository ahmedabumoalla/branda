"use client";

import { Suspense, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Flame,
  Gift,
  MapPin,
  Sparkles,
} from "lucide-react";
import { getCustomerSession, type BrandaCustomerSession } from "@/lib/customer/session";
import { useCafeThemePage } from "@/lib/cafe/use-cafe-theme-page";
import { getCafePath } from "@/lib/cafe/theme-links";
import { useCustomIdentityVisuals } from "@/lib/cafe/use-custom-identity-visuals";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import {
  buildCustomIdentityCssVars,
  defaultCustomIdentityTheme,
  OVERLAY_OPACITY,
} from "@/lib/mock/custom-identity-theme";
import { ThemedPreviewBanner } from "./themed-preview-banner";
import { ThemedCafeHeader } from "./themed-cafe-header";
import { ThemedCafeFooter } from "./themed-cafe-footer";

type Props = {
  slug: string;
  children: ReactNode;
  className?: string;
  maxWidth?: string;
};

function ThemedCafeShellInner({ slug, children, className = "", maxWidth = "max-w-6xl" }: Props) {
  const ctx = useCafeThemePage(slug);
  const [customer, setCustomer] = useState<BrandaCustomerSession | null>(null);

  const { theme, experience, settings, themeId, previewThemeId, isPreview, customIdentity, loadError } =
    ctx;
  const identityConfig = customIdentity ?? defaultCustomIdentityTheme();
  const cafeLogoUrl = useResolvedCafeLogoUrl(settings);
  const { logoUrl: identityLogoUrl, backgroundUrl } = useCustomIdentityVisuals(identityConfig);
  const identityStyle =
    themeId === "brand-identity-custom"
      ? (buildCustomIdentityCssVars(identityConfig.palette) as CSSProperties)
      : {};

  useEffect(() => {
    void getCustomerSession(slug).then(setCustomer);
  }, [slug]);

  if (loadError) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#e8e4df] px-4">
        <p className="text-center font-black text-[#4a4540]">{loadError}</p>
      </main>
    );
  }

  const isCustomIdentity = themeId === "brand-identity-custom";

  const pb = experience.showMobileBottomNav
    ? "pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]"
    : "";

  const showPageBackground =
    themeId === "brand-identity-custom" &&
    backgroundUrl &&
    (identityConfig.backgroundScope === "all-customer-pages" ||
      identityConfig.backgroundScope === "home-only");

  const navItems = [
    { href: getCafePath(slug, "products/offers", previewThemeId), icon: Gift, label: "العروض" },
    { href: getCafePath(slug, "products/latest", previewThemeId), icon: Sparkles, label: "أحدث" },
    { href: getCafePath(slug, "products/popular", previewThemeId), icon: Flame, label: "شائع" },
    { href: getCafePath(slug, "reserve", previewThemeId), icon: CalendarDays, label: "حجز" },
    { href: getCafePath(slug, "", previewThemeId), icon: MapPin, label: "الرئيسية" },
  ];

  return (
    <main
      dir="rtl"
      className={`relative min-h-screen ${isCustomIdentity ? "brand-identity-custom-theme" : ""} ${theme.page} ${pb}`}
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
        <ThemedPreviewBanner themeId={themeId} visible={isPreview} />
        <ThemedCafeHeader
          slug={slug}
          cafeName={settings.cafeName}
          logoUrl={identityLogoUrl ?? cafeLogoUrl}
          themeId={themeId}
          experience={experience}
          customer={customer}
          previewThemeId={previewThemeId}
        />
        <div
          className={`brand-cafe-fields mx-auto ${maxWidth} px-4 py-6 sm:px-5 sm:py-8 ${className}`}
        >
          {children}
        </div>
        <div
          className={`mx-auto ${maxWidth} px-4 sm:px-5 ${experience.showMobileBottomNav ? "mb-4" : ""}`}
        >
          <ThemedCafeFooter slug={slug} cafeName={settings.cafeName} themeId={themeId} />
        </div>

        {experience.showMobileBottomNav ? (
          <nav
            className={`fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 gap-1 border-t px-2 py-2 ${theme.nav}`}
          >
            {navItems.map(({ href, icon: Icon, label }) => (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-black"
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </main>
  );
}

export function ThemedCafeShell(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ThemedCafeShellInner {...props} />
    </Suspense>
  );
}

export { useCafeThemePage };
