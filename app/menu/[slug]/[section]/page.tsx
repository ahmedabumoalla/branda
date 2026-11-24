import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { getStandaloneMenu } from "@/lib/data/standalone-menu";
import { withAwladCatalogPreview } from "@/lib/data/awlad-preview";
import { isAwladAlIzz, AWLAD_BLUE } from "@/lib/menu/awlad-al-izz";
import { AwladAlIzz } from "@/components/menu/awlad-al-izz";
import { PublicPageAnalytics } from "@/components/analytics/public-page-analytics";
import { MenuAutoRefresh } from "@/components/menu/menu-auto-refresh";
import { getPublicLoyaltyProgramBySlug } from "@/lib/data/loyalty-cards";

export const dynamic = "force-dynamic";
export const viewport: Viewport = { themeColor: AWLAD_BLUE, width: "device-width", initialScale: 1 };
type Props = { params: Promise<{ slug: string; section: string }>; searchParams?: Promise<{ branch?: string }> };
const isSection = (value: string): value is "cafe" | "laser" => value === "cafe" || value === "laser";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, section } = await params;
  if (!isSection(section)) return { title: "القسم غير متاح", robots: { index: false, follow: false } };
  const menu = await getStandaloneMenu(slug);
  if (!menu || !isAwladAlIzz(menu.cafeId)) return { title: "القسم غير متاح", robots: { index: false, follow: false } };
  return { title: `${menu.name} | ${section === "cafe" ? "المشروبات والمنيو" : "خدمات الليزر"}`, alternates: { canonical: `/menu/${menu.slug}/${section}` } };
}

export default async function AwladSectionPage({ params, searchParams }: Props) {
  const { slug, section } = await params;
  if (!isSection(section)) notFound();
  const savedMenu = await getStandaloneMenu(slug, undefined, (await searchParams)?.branch);
  if (!savedMenu || !isAwladAlIzz(savedMenu.cafeId)) notFound();
  const { menu, preview } = withAwladCatalogPreview(savedMenu);
  const program = menu.loyaltyEnabled ? await getPublicLoyaltyProgramBySlug(menu.slug) : null;
  return <>{!preview && <><PublicPageAnalytics slug={menu.slug} kind="menu_view" /><MenuAutoRefresh slug={menu.slug} /></>}<AwladAlIzz menu={menu} view={section} showLoyalty={Boolean(program?.enabled)} /></>;
}
