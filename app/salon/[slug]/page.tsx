import { notFound, redirect } from "next/navigation";
import { getStandaloneMenu } from "@/lib/data/standalone-menu";
import { getSalonAnnouncements } from "@/lib/data/salon";
import { getLoyaltyBrandAppearance } from "@/lib/data/loyalty-identity";
import { getPublicLoyaltyProgramBySlug } from "@/lib/data/loyalty-cards";
import { PublicSalon } from "@/components/salon/public-salon";
import { PublicPageAnalytics } from "@/components/analytics/public-page-analytics";
import { getPublicLoyaltyLanding } from "@/lib/data/loyalty-landing";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loyaltyBrand = await getPublicLoyaltyLanding(slug);
  if (loyaltyBrand) return { title: `${loyaltyBrand.identity.name} | الولاء والمكافآت`, description: `انضم إلى برنامج ولاء ${loyaltyBrand.identity.name} واجمع أختامك`, alternates: { canonical: `/loyalty/${loyaltyBrand.identity.slug}/qr` } };
  const menu = await getStandaloneMenu(slug);
  return { title: menu?.businessCategory === "hair_salons" ? `${menu.name} | الخدمات وحجز المواعيد` : "الصالون غير متاح" };
}
export default async function SalonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loyaltyBrand = await getPublicLoyaltyLanding(slug);
  if (loyaltyBrand) redirect(`/loyalty/${loyaltyBrand.identity.slug}/qr`);
  const menu = await getStandaloneMenu(slug);
  if (!menu || menu.businessCategory !== "hair_salons" || !menu.cafeId) notFound();
  const [announcements, identity, program] = await Promise.all([getSalonAnnouncements(slug), getLoyaltyBrandAppearance(menu.cafeId, slug), menu.loyaltyEnabled ? getPublicLoyaltyProgramBySlug(slug) : null]);
  return <><PublicPageAnalytics slug={slug} kind="menu_view" /><PublicSalon menu={{ ...menu, loyaltyEnabled: Boolean(menu.loyaltyEnabled && program?.enabled) }} announcements={announcements} colors={identity.colors} /></>;
}
