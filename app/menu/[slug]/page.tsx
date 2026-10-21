import type { Metadata, Viewport } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getStandaloneMenu } from "@/lib/data/standalone-menu";
import { BistroMenu } from "@/components/menu/bistro-menu";
import { FrenchCornerMenu } from "@/components/menu/french-corner-menu";
import { PublicPageAnalytics } from "@/components/analytics/public-page-analytics";
import { MenuAutoRefresh } from "@/components/menu/menu-auto-refresh";
import { isPublicHomeMenuSlug } from "@/lib/data/public-home-catalog";

export const dynamic = "force-dynamic";
// Share the preview publication check between metadata and page rendering in one request.
const isPublicShowcase = cache(isPublicHomeMenuSlug);

type Props = { params: Promise<{ slug: string }>; searchParams?: Promise<{ showcase?: string | string[] }> };

export function generateViewport(): Viewport {
  return { themeColor: "#102019", width: "device-width", initialScale: 1 };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const showcase = (await searchParams)?.showcase === "1";
  if (showcase && !await isPublicShowcase(slug)) return { title: "المنيو غير متاح", robots: { index: false, follow: false } };
  const menu = await getStandaloneMenu(slug, showcase);
  if (!menu) return { title: "المنيو غير متاح", robots: { index: false, follow: false } };
  return {
    title: `${menu.name} | المنيو`,
    description: `اكتشف منيو ${menu.name} الأصناف والأسعار والمكونات والتفاصيل`,
    ...(showcase ? { robots: { index: false, follow: false }, alternates: { canonical: `/menu/${slug}` } } : {}),
  };
}

export default async function StandaloneMenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const showcase = (await searchParams)?.showcase === "1";
  if (showcase && !await isPublicShowcase(slug)) notFound();
  const menu = await getStandaloneMenu(slug, showcase);
  if (!menu) notFound();
  // Gallery frames are genuine public menus, without visitor/customer tracking or interactions.
  const presentation = menu.slug === "brand-10620d3a586c" ? <FrenchCornerMenu menu={menu} /> : <BistroMenu menu={menu} />;
  if (showcase) return <div inert>{presentation}</div>;
  return <><PublicPageAnalytics slug={slug} kind="menu_view" /><MenuAutoRefresh slug={menu.slug} />{presentation}</>;
}
