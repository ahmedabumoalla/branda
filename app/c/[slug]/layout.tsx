import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CafeFaviconController } from "@/components/cafe/cafe-favicon-controller";
import { getPreferredCafeDisplayLogoUrl } from "@/lib/cafe/cafe-display-logo";
import { getCafeBySlug } from "@/lib/data/cafes";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity } from "@/lib/data/theme";

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getCafeIconRoute(slug: string) {
  return `/api/public/cafe/${encodeURIComponent(slug)}/favicon`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [cafe, settings, identity] = await Promise.all([
    getCafeBySlug(slug).catch(() => null),
    getPublicCafeSettings(slug).catch(() => null),
    getPublicCustomIdentity(slug).catch(() => null),
  ]);

  const name = settings?.cafeName || cafe?.name || "برندة";
  const iconRoute = getCafeIconRoute(slug);
  const displayLogoUrl = getPreferredCafeDisplayLogoUrl(
    settings?.logoDataUrl,
    identity?.legacyLogoDataUrl,
  );

  return {
    title: `${name} | برندة`,
    description: `الفرع الإلكتروني لـ ${name} على منصة برندة`,
    manifest: `/api/pwa/${encodeURIComponent(slug)}/manifest`,
    icons: {
      icon: [
        { url: iconRoute },
        { url: `${iconRoute}?shortcut=1` },
      ],
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
      <CafeFaviconController slug={slug} />
      {children}
    </>
  );
}
