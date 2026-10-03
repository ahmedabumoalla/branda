import { notFound } from "next/navigation";
import { getLoyaltyBrand, getLoyaltyMembership } from "@/lib/data/loyalty-experience";
import { getWalletReadiness } from "@/lib/wallet";
import { RastEnrollment } from "@/components/rast-loyalty/rast-enrollment";
import { RastMemberCard } from "@/components/rast-loyalty/rast-member-card";
import { getVerifiedRastCustomerProfile } from "@/lib/auth/rast-loyalty-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "أهل راست | بطاقة الولاء", robots: { index: false, follow: false } };

export default async function LoyaltyJoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug !== "rast") notFound();
  const brand = await getLoyaltyBrand(slug);
  if (!brand) notFound();
  const membership = brand.program.enabled ? await getLoyaltyMembership(slug) : null;
  const readiness = getWalletReadiness();
  if (membership) return <RastMemberCard identity={brand.identity} member={membership} walletAvailability={{ apple: readiness.apple && brand.program.appleWalletEnabled, google: readiness.google && brand.program.googleWalletEnabled }} />;
  return <RastEnrollment identity={brand.identity} program={brand.program} authenticated={Boolean(await getVerifiedRastCustomerProfile())} />;
}
