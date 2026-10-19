import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { getStandaloneMenu } from "@/lib/data/standalone-menu";
import { BistroMenu } from "@/components/menu/bistro-menu";
import { PublicPageAnalytics } from "@/components/analytics/public-page-analytics";
import { MenuAutoRefresh } from "@/components/menu/menu-auto-refresh";
import { isPublicHomeMenuSlug } from "@/lib/data/public-home-catalog";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams?: Promise<{ showcase?: string | string[] }> };

export function generateViewport(): Viewport {
  return { themeColor: "#102019", width: "device-width", initialScale: 1 };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const showcase = (await searchParams)?.showcase === "1";
  if (showcase && !await isPublicHomeMenuSlug(slug)) return { title: "المنيو غير متاح", robots: { index: false, follow: false } };
  const menu = await getStandaloneMenu(slug);
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
  if (showcase && !await isPublicHomeMenuSlug(slug)) notFound();
  const menu = await getStandaloneMenu(slug);
  if (!menu) notFound();
  // Gallery frames are genuine public menus, without visitor/customer tracking or interactions.
  if (showcase) return <><MenuAutoRefresh slug={menu.slug} /><div inert><BistroMenu menu={menu} /></div></>;
  return <><PublicPageAnalytics slug={slug} kind="menu_view" /><MenuAutoRefresh slug={menu.slug} /><BistroMenu menu={menu} /></>;
}
