import { notFound } from "next/navigation";
import { getStandaloneMenu } from "@/lib/data/standalone-menu";
import { getSalonAnnouncements } from "@/lib/data/salon";
import { getLoyaltyBrandAppearance } from "@/lib/data/loyalty-identity";
import { PublicSalon } from "@/components/salon/public-salon";
import { PublicPageAnalytics } from "@/components/analytics/public-page-analytics";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const menu = await getStandaloneMenu((await params).slug);
  return { title: menu?.businessCategory === "hair_salons" ? `${menu.name} | الخدمات وحجز المواعيد` : "الصالون غير متاح" };
}
export default async function SalonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const menu = await getStandaloneMenu(slug);
  if (!menu || menu.businessCategory !== "hair_salons" || !menu.cafeId) notFound();
  const [announcements, identity] = await Promise.all([getSalonAnnouncements(slug), getLoyaltyBrandAppearance(menu.cafeId, slug)]);
  return <><PublicPageAnalytics slug={slug} kind="menu_view" /><PublicSalon menu={menu} announcements={announcements} colors={identity.colors} /></>;
}
