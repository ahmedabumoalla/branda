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
import { TeaBakeryMenu } from "@/components/menu/tea-bakery-menu";
import { JamilaMenu, JAMILA_SLUG } from "@/components/menu/jamila-menu";
import { FawaselStore } from "@/components/store/fawasel-store";
import { isFawaselStore } from "@/lib/commerce/fawasel-profile";
import { AldeemStore } from "@/components/store/aldeem-store";
import { isAldeemStore } from "@/lib/commerce/aldeem-profile";
import { isHospitalStore, MIND_HOSPITAL_SLUG } from "@/lib/commerce/hospital-profile";
import { HospitalMenu } from "@/components/menu/hospital-menu";

export const dynamic = "force-dynamic";
// Share the preview publication check between metadata and page rendering in one request.
const isPublicShowcase = cache(isPublicHomeMenuSlug);

type Props = { params: Promise<{ slug: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const { slug } = await params;
  return { themeColor: isAldeemStore(slug) ? "#6b347e" : isFawaselStore(slug) ? "#ff8500" : slug === JAMILA_SLUG ? "#5c5c5c" : "#102019", width: "device-width", initialScale: 1 };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const query = await searchParams;
  const showcase = query?.showcase === "1";
  const branch = typeof query?.branch === "string" ? query.branch : undefined;
  if (slug === "brand-8ad185ee82e3" && branch === "hospital") return { title: "مايند | MIND Café & Bakery", alternates: { canonical: `/menu/${MIND_HOSPITAL_SLUG}` } };
  if (showcase && !await isPublicShowcase(slug)) return { title: "المنيو غير متاح", robots: { index: false, follow: false } };
  const loyaltyBrand = await getPublicLoyaltyLanding(slug);
  if (loyaltyBrand) return { title: `${loyaltyBrand.identity.name} | الولاء والمكافآت`, description: `انضم إلى برنامج ولاء ${loyaltyBrand.identity.name} واجمع أختامك`, alternates: { canonical: `/loyalty/${loyaltyBrand.identity.slug}/qr` }, ...(showcase ? { robots: { index: false, follow: false } } : {}) };
  const menu = await getStandaloneMenu(slug, showcase, branch);
  if (!menu) return { title: "المنيو غير متاح", robots: { index: false, follow: false } };
  if (isAldeemStore(menu.slug)) return { title: "خيال الديم | حلا يكمّل حلو أيامك", description: "اكتشف تشكيلة سلسلة خيال الديم للحلويات من الكيك والتشيز والحلا واختَر ما يناسب لحظتك", alternates: { canonical: `/menu/${menu.slug}` }, ...(showcase ? { robots: { index: false, follow: false } } : {}) };
  if (isFawaselStore(menu.slug)) return { title: "فواصل | ستايلك كل يوم", description: "تسوّق أزياء وأحذية وإكسسوارات فواصل واختر تفاصيل إطلالتك وانضم إلى نادي فواصل", alternates: { canonical: `/menu/${menu.slug}` }, ...(showcase ? { robots: { index: false, follow: false } } : {}) };
  if (menu.slug === JAMILA_SLUG && menu.products.length === 0) return {
    title: `${menu.name} | قهوة ومخبوزات`, description: "أهلًا بك في جميلة قهوة ومخبوزات ولحظات جميلة قائمتنا قريبًا",
    ...(showcase ? { robots: { index: false, follow: false }, alternates: { canonical: `/menu/${slug}` } } : {}),
  };
  return {
    title: `${menu.name}${menu.branch ? ` | ${menu.branch.name}` : ""} | ${menu.businessCategory === "gifts_flowers" ? "المنتجات والخدمات" : menu.businessCategory === "butcher_shops" ? "المنتجات" : "المنيو"}`,
    description: menu.businessCategory === "gifts_flowers" ? `اكتشف منتجات وخدمات ${menu.name} واختر هديتك بتفاصيلها` : menu.businessCategory === "butcher_shops" ? `اكتشف منتجات ${menu.name} والأصناف والأسعار والتفاصيل` : `اكتشف منيو ${menu.name} الأصناف والأسعار والمكونات والتفاصيل`,
    ...(showcase ? { robots: { index: false, follow: false }, alternates: { canonical: `/menu/${slug}` } } : {}),
  };
}

export default async function StandaloneMenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const showcase = query?.showcase === "1";
  const branch = typeof query?.branch === "string" ? query.branch : undefined;
  if (slug === "brand-8ad185ee82e3" && branch === "hospital") redirect(`/menu/${MIND_HOSPITAL_SLUG}${showcase ? "?showcase=1" : ""}`);
  if (showcase && !await isPublicShowcase(slug)) notFound();
  const loyaltyBrand = await getPublicLoyaltyLanding(slug);
  if (loyaltyBrand) redirect(`/loyalty/${loyaltyBrand.identity.slug}/qr`);
  const menu = await getStandaloneMenu(slug, showcase, branch);
  if (!menu) notFound();
  if (isHospitalStore(slug)) {
    const hospital = <HospitalMenu menu={menu} />;
    return showcase ? <div inert>{hospital}</div> : <><PublicPageAnalytics slug={slug} kind="menu_view" /><MenuAutoRefresh slug={slug} />{hospital}</>;
  }
  if (menu.businessCategory === "hair_salons") redirect(`/salon/${menu.slug}`);
  const fawasel = isFawaselStore(menu.slug);
  const aldeem = isAldeemStore(menu.slug);
  const giftStore = menu.businessCategory === "gifts_flowers" || fawasel || aldeem;
  const teaBakery = menu.slug === "brand-9010051467ed";
  const jamila = menu.slug === JAMILA_SLUG && menu.products.length === 0;
  const signature = signatureBrand(menu.slug, menu.branch?.slug) || defaultSignatureBrand(menu);
  const program = (jamila || teaBakery || giftStore || signature || menu.slug === "brand-10620d3a586c" || isLocoMenu(menu.slug)) && menu.loyaltyEnabled
    ? await getPublicLoyaltyProgramBySlug(menu.slug).catch(() => null) : null;
  const loyalty = program?.enabled ? { purchasesRequired: program.purchasesRequired, rewardName: program.rewardName } : null;
  // Gallery frames are genuine public menus, without visitor/customer tracking or interactions.
  const storeSettings = giftStore ? await getGiftStoreSettings(menu.slug).catch(() => null) : null;
  if (aldeem) {
    const storefront = <AldeemStore menu={menu} settings={storeSettings} loyalty={loyalty} />;
    if (showcase) return <div inert>{storefront}</div>;
    return <><PublicPageAnalytics slug={slug} kind="menu_view" /><MenuAutoRefresh slug={menu.slug} />{storefront}</>;
  }
  if (fawasel) {
    const storefront = <FawaselStore menu={menu} settings={storeSettings} loyalty={loyalty} />;
    if (showcase) return <div inert>{storefront}</div>;
    return <><PublicPageAnalytics slug={slug} kind="menu_view" /><MenuAutoRefresh slug={menu.slug} />{storefront}</>;
  }
  const presentation = jamila ? <JamilaMenu menu={menu} loyalty={loyalty} /> : teaBakery ? <TeaBakeryMenu key={`${menu.slug}:${menu.branch?.id ?? "primary"}`} menu={menu} loyalty={loyalty} /> : signature ? <SignatureMenu key={`${menu.slug}:${menu.branch?.id ?? "primary"}`} menu={menu} brand={signature} loyalty={loyalty} /> : giftStore && menu.slug === "brand-871ec6e243c0" ? <TogetherStore menu={menu} loyalty={loyalty} settings={storeSettings} /> : isLocoMenu(menu.slug) ? <LocoMenu menu={menu} loyalty={loyalty} /> : menu.slug === "brand-10620d3a586c" ? <FrenchCornerMenu menu={menu} loyalty={loyalty} /> : <BistroMenu menu={menu} />;
  if (showcase) return <div inert>{presentation}</div>;
  return <><PublicPageAnalytics slug={slug} kind="menu_view" /><MenuAutoRefresh slug={menu.slug} />{presentation}</>;
}
