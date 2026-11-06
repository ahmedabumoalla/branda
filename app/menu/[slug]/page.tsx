import type { Metadata, Viewport } from "next";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getStandaloneMenu } from "@/lib/data/standalone-menu";
import { getPublicLoyaltyProgramBySlug } from "@/lib/data/loyalty-cards";
import { BistroMenu } from "@/components/menu/bistro-menu";
import { FrenchCornerMenu } from "@/components/menu/french-corner-menu";
import { LocoMenu } from "@/components/menu/loco-menu";
import { isLocoMenu } from "@/lib/menu/loco-brand";
import { PublicPageAnalytics } from "@/components/analytics/public-page-analytics";
import { MenuAutoRefresh } from "@/components/menu/menu-auto-refresh";
import { isPublicHomeMenuSlug } from "@/lib/data/public-home-catalog";
import { TogetherStore } from "@/components/store/together-store";
import { getGiftStoreSettings } from "@/lib/data/gift-orders";
import { getPublicLoyaltyLanding } from "@/lib/data/loyalty-landing";
import { signatureBrand } from "@/lib/menu/signature-brands";
import { SignatureMenu } from "@/components/menu/signature-menu";
import { defaultSignatureBrand } from "@/lib/menu/default-signature";

export const dynamic = "force-dynamic";
// Share the preview publication check between metadata and page rendering in one request.
const isPublicShowcase = cache(isPublicHomeMenuSlug);

type Props = { params: Promise<{ slug: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

export function generateViewport(): Viewport {
  return { themeColor: "#102019", width: "device-width", initialScale: 1 };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const query = await searchParams;
  const showcase = query?.showcase === "1";
  const branch = typeof query?.branch === "string" ? query.branch : undefined;
  if (showcase && !await isPublicShowcase(slug)) return { title: "المنيو غير متاح", robots: { index: false, follow: false } };
  const loyaltyBrand = await getPublicLoyaltyLanding(slug);
  if (loyaltyBrand) return { title: `${loyaltyBrand.identity.name} | الولاء والمكافآت`, description: `انضم إلى برنامج ولاء ${loyaltyBrand.identity.name} واجمع أختامك`, alternates: { canonical: `/loyalty/${loyaltyBrand.identity.slug}/qr` }, ...(showcase ? { robots: { index: false, follow: false } } : {}) };
  const menu = await getStandaloneMenu(slug, showcase, branch);
  if (!menu) return { title: "المنيو غير متاح", robots: { index: false, follow: false } };
  return {
    title: `${menu.name}${menu.branch ? ` | ${menu.branch.name}` : ""} | ${menu.businessCategory === "gifts_flowers" ? "المنتجات والخدمات" : "المنيو"}`,
    description: menu.businessCategory === "gifts_flowers" ? `اكتشف منتجات وخدمات ${menu.name} واختر هديتك بتفاصيلها` : `اكتشف منيو ${menu.name} الأصناف والأسعار والمكونات والتفاصيل`,
    ...(showcase ? { robots: { index: false, follow: false }, alternates: { canonical: `/menu/${slug}` } } : {}),
  };
}

export default async function StandaloneMenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const showcase = query?.showcase === "1";
  const branch = typeof query?.branch === "string" ? query.branch : undefined;
  if (showcase && !await isPublicShowcase(slug)) notFound();
  const loyaltyBrand = await getPublicLoyaltyLanding(slug);
  if (loyaltyBrand) redirect(`/loyalty/${loyaltyBrand.identity.slug}/qr`);
  const menu = await getStandaloneMenu(slug, showcase, branch);
  if (!menu) notFound();
  if (menu.businessCategory === "hair_salons") redirect(`/salon/${menu.slug}`);
  const giftStore = menu.businessCategory === "gifts_flowers";
  const signature = signatureBrand(menu.slug, menu.branch?.slug) || defaultSignatureBrand(menu);
  const program = (giftStore || signature || menu.slug === "brand-10620d3a586c" || isLocoMenu(menu.slug)) && menu.loyaltyEnabled
    ? await getPublicLoyaltyProgramBySlug(menu.slug).catch(() => null) : null;
  const loyalty = program?.enabled ? { purchasesRequired: program.purchasesRequired, rewardName: program.rewardName } : null;
  // Gallery frames are genuine public menus, without visitor/customer tracking or interactions.
  const storeSettings = giftStore ? await getGiftStoreSettings(menu.slug).catch(() => null) : null;
  const branchQuery = new URLSearchParams(Object.entries(query ?? {}).flatMap(([key, value]) => value === undefined ? [] : (Array.isArray(value) ? value : [value]).map(item => [key, item]))).toString();
  const presentation = signature ? <SignatureMenu key={`${menu.slug}:${menu.branch?.id ?? "primary"}`} menu={menu} brand={signature} loyalty={loyalty} branchQuery={branchQuery} /> : giftStore && menu.slug === "brand-871ec6e243c0" ? <TogetherStore menu={menu} loyalty={loyalty} settings={storeSettings} /> : isLocoMenu(menu.slug) ? <LocoMenu menu={menu} loyalty={loyalty} /> : menu.slug === "brand-10620d3a586c" ? <FrenchCornerMenu menu={menu} loyalty={loyalty} /> : <BistroMenu menu={menu} />;
  if (showcase) return <div inert>{presentation}</div>;
  return <><PublicPageAnalytics slug={slug} kind="menu_view" /><MenuAutoRefresh slug={menu.slug} />{presentation}</>;
}
