import { notFound } from "next/navigation";
import { getLoyaltyBrand } from "@/lib/data/loyalty-experience";
import { LoyaltyQrLanding } from "@/components/loyalty/loyalty-qr-landing";

export const dynamic = "force-dynamic";
export const metadata = { title: "انضم إلى الولاء والمكافآت", robots: { index: false, follow: false } };

export default async function LoyaltyQrPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await getLoyaltyBrand(slug);
  if (!brand?.program.enabled) notFound();
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://barndaksa.com").replace(/\/$/, "");
  const signupUrl = `${origin}/loyalty/${encodeURIComponent(brand.identity.slug)}?source=qr`;
  return <LoyaltyQrLanding identity={brand.identity} program={brand.program} signupUrl={signupUrl} />;
}
