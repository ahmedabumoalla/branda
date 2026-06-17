"use client";

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

type Props = {
  slug: string;
  children: ReactNode;
  className?: string;
  maxWidth?: string;
};

function ThemedCafeShellInner({ slug, children, className = "", maxWidth = "max-w-6xl" }: Props) {
  const ctx = useCafeThemePage(slug);
  const [customer, setCustomer] = useState<BarndaksaCustomerSession | null>(null);

  const { settings, themeId, previewThemeId, isPreview, customIdentity, features, loadError } = ctx;
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
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#FCF8F3] px-4">
        <p className="text-center font-black text-[#4a4540]">{loadError}</p>
      </main>
    );
  }

  const showPageBackground =
    backgroundUrl &&
    (identityConfig.backgroundScope === "all-customer-pages" ||
      identityConfig.backgroundScope === "home-only");

  return (
    <main
      dir="rtl"
      className="brand-identity-custom-theme relative min-h-screen bg-[#FCF8F3] text-[#311912]"
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
        <ThemedCafeHeader
          slug={slug}
          cafeName={settings.cafeName}
          logoUrl={getPreferredCafeDisplayLogoUrl(cafeLogoUrl, identityLogoUrl)}
          themeId="brand-identity-custom"
          customer={customer}
          previewThemeId={previewThemeId}
          features={features}
        />
        <div className={`brand-cafe-fields mx-auto ${maxWidth} px-4 py-6 sm:px-6 sm:py-8 ${className}`}>
          {children}
        </div>
        <div className={`mx-auto ${maxWidth} px-4 pb-6 sm:px-6`}>
          <ThemedCafeFooter slug={slug} cafeName={settings.cafeName} themeId="brand-identity-custom" />
        </div>
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
