import { notFound } from "next/navigation";
import { getLoyaltyBrand, getLoyaltyMembership } from "@/lib/data/loyalty-experience";
import { getWalletReadiness } from "@/lib/wallet";
import { RastEnrollment } from "@/components/rast-loyalty/rast-enrollment";
import { RastMemberCard } from "@/components/rast-loyalty/rast-member-card";
import { getVerifiedRastCustomerProfile } from "@/lib/auth/rast-loyalty-session";
import { PublicPageAnalytics } from "@/components/analytics/public-page-analytics";
import { loyaltyVisitKind } from "@/lib/analytics/brand-analytics";

export const dynamic = "force-dynamic";
export const metadata = { title: "أهل مقهى الكواكب | بطاقة الولاء", robots: { index: false, follow: false } };

export default async function LoyaltyJoinPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ source?: string | string[] }> }) {
  const { slug } = await params;
  if (slug !== "rast") notFound();
  const brand = await getLoyaltyBrand(slug);
  if (!brand) notFound();
  const membership = brand.program.enabled ? await getLoyaltyMembership(slug) : null;
  const readiness = getWalletReadiness();
  const analytics = brand.program.enabled ? <PublicPageAnalytics slug={slug} kind={loyaltyVisitKind((await searchParams).source)} /> : null;
  if (membership) return <>{analytics}<RastMemberCard identity={brand.identity} member={membership} walletAvailability={{ apple: readiness.apple && brand.program.appleWalletEnabled, google: readiness.google && brand.program.googleWalletEnabled }} /></>;
  return <>{analytics}<RastEnrollment identity={brand.identity} program={brand.program} authenticated={Boolean(await getVerifiedRastCustomerProfile())} /></>;
}
