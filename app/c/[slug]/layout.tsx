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

function getCafePwaBootstrapScript(slug: string) {
  const encodedSlug = encodeURIComponent(slug);
  const debug = process.env.NODE_ENV !== "production";

  return `
(function () {
  var slug = ${JSON.stringify(slug)};
  var encodedSlug = ${JSON.stringify(encodedSlug)};
  var debug = ${debug ? "true" : "false"};
  var manifestHref = "/api/pwa/" + encodedSlug + "/manifest";
  var swPath = "/api/pwa/" + encodedSlug + "/sw";
  var scope = "/c/" + encodedSlug;
  var scopeWithSlash = scope + "/";
  var log = function () {
    if (debug && window.console && console.debug) {
      console.debug.apply(console, ["[branda-pwa]"].concat(Array.prototype.slice.call(arguments)));
    }
  };
  if (!window.__barndaksaPwaInstallCaptureReady) {
    window.__barndaksaPwaInstallCaptureReady = true;
    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      window.__barndaksaPwaInstallPromptEvent = event;
      window.__barndaksaPwaInstallPromptSeen = true;
      log("beforeinstallprompt captured early");
      window.dispatchEvent(new CustomEvent("barndaksa:beforeinstallprompt"));
    });
  }
  var manifestLink = Array.prototype.slice.call(document.head.querySelectorAll('link[rel="manifest"]')).find(function (link) {
    return link.getAttribute("href") === manifestHref || link.href.indexOf(manifestHref) !== -1;
  });
  if (!manifestLink) {
    manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = manifestHref;
    manifestLink.setAttribute("data-barndaksa-pwa", slug);
    document.head.appendChild(manifestLink);
  }
  log("manifest link present", Boolean(manifestLink), manifestHref);
  log("display-mode standalone", Boolean(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches));
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(swPath, { scope: scope }).then(function (registration) {
      log("service worker registered", registration.scope, "covers", scope, scopeWithSlash);
    }).catch(function (error) {
      log("service worker registration failed", error);
    });
  } else {
    log("service worker unsupported");
  }
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
  const normalizedSlug = slug.trim().toLowerCase();
  const manifestHref = `/api/pwa/${encodeURIComponent(normalizedSlug)}/manifest`;

  return (
    <>
      <link
        rel="manifest"
        href={manifestHref}
        data-barndaksa-pwa={normalizedSlug}
        data-barndaksa-pwa-scope={`/c/${encodeURIComponent(normalizedSlug)}/`}
      />
      <script
        id={`barndaksa-cafe-pwa-${normalizedSlug}`}
        dangerouslySetInnerHTML={{ __html: getCafePwaBootstrapScript(normalizedSlug) }}
      />
      <CafeFaviconController slug={normalizedSlug} />
      {children}
    </>
  );
}
