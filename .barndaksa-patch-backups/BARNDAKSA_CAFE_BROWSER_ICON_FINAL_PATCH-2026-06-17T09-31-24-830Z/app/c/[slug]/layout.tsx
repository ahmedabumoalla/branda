import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getCafeBySlug } from "@/lib/data/cafes";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity } from "@/lib/data/theme";
import { getPreferredCafeDisplayLogoUrl } from "@/lib/cafe/cafe-display-logo";

type Props = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [cafe, settings, identity] = await Promise.all([
    getCafeBySlug(slug).catch(() => null),
    getPublicCafeSettings(slug).catch(() => null),
    getPublicCustomIdentity(slug).catch(() => null),
  ]);

  const name = settings?.cafeName || cafe?.name || "برندة";
  const iconUrl = getPreferredCafeDisplayLogoUrl(
    settings?.logoDataUrl,
    identity?.legacyLogoDataUrl,
  );

  return {
    title: `${name} | برندة`,
    description: `الفرع الإلكتروني لـ ${name} على منصة برندة`,
    manifest: `/api/pwa/${encodeURIComponent(slug)}/manifest`,
    icons: {
      icon: [{ url: iconUrl }],
      shortcut: [{ url: iconUrl }],
      apple: [{ url: iconUrl }],
    },
    openGraph: {
      title: `${name} | برندة`,
      description: `الفرع الإلكتروني لـ ${name} على منصة برندة`,
      images: [{ url: iconUrl }],
    },
  };
}

export default function CafeSlugLayout({ children }: Props) {
  return children;
}
