import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CafeFaviconController } from "@/components/cafe/cafe-favicon-controller";
import { getPreferredCafeDisplayLogoUrl } from "@/lib/cafe/cafe-display-logo";
import { getCafeBySlug } from "@/lib/data/cafes";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity } from "@/lib/data/theme";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

const META_TTL_MS = 10 * 60 * 1000;

function getCafeIconRoute(slug: string) {
  return `/api/public/cafe/${encodeURIComponent(slug)}/favicon`;
}

function getPwaInstallPromptCaptureScript() {
  return `
(function () {
  window.__barndaksaDeferredInstallPrompt = null;
  window.__barndaksaPwaInstallReady = false;
  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    window.__barndaksaDeferredInstallPrompt = event;
    window.__barndaksaPwaInstallReady = true;
    window.dispatchEvent(new Event("barndaksa:pwa-install-ready"));
  });
})();
`;
}

async function loadCafeMeta(slug: string) {
  const [cafe, settings, identity] = await Promise.all([
    getCafeBySlug(slug).catch(() => null),
    getPublicCafeSettings(slug).catch(() => null),
    getPublicCustomIdentity(slug).catch(() => null),
  ]);

  return { cafe, settings, identity };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();
  const { cafe, settings, identity } = await cachedServerValue(
    `public-cafe-layout-meta:${normalizedSlug}`,
    META_TTL_MS,
    () => loadCafeMeta(normalizedSlug),
  );

  const name = settings?.cafeName || cafe?.name || "برندة";
  const iconRoute = getCafeIconRoute(normalizedSlug);
  const displayLogoUrl = getPreferredCafeDisplayLogoUrl(
    settings?.logoDataUrl,
    identity?.legacyLogoDataUrl,
  );

  return {
    title: `${name} | برندة`,
    description: `الفرع الإلكتروني لـ ${name} على منصة برندة`,
    manifest: `/api/pwa/${encodeURIComponent(normalizedSlug)}/manifest`,
    icons: {
      icon: [{ url: iconRoute }],
      shortcut: [{ url: `${iconRoute}?shortcut=1` }],
      apple: [{ url: `${iconRoute}?apple=1` }],
    },
    openGraph: {
      title: `${name} | برندة`,
      description: `الفرع الإلكتروني لـ ${name} على منصة برندة`,
      images: [{ url: displayLogoUrl }],
    },
  };
}

export default async function CafeSlugLayout({ children, params }: Props) {
  const { slug } = await params;

  return (
    <>
      <script
        id="barndaksa-pwa-install-prompt-capture"
        dangerouslySetInnerHTML={{ __html: getPwaInstallPromptCaptureScript() }}
      />
      <CafeFaviconController slug={slug} />
      {children}
    </>
  );
}
