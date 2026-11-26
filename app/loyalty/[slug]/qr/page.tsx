import { notFound } from "next/navigation";
import { LoyaltyQrLanding } from "@/components/loyalty/loyalty-qr-landing";
import { getLoyaltyBrand } from "@/lib/data/loyalty-experience";
import { loyaltyLanguage } from "@/lib/loyalty/customer-language";
import { englishLoyaltyCopy, localizePublicProgram, publicProgramCopy } from "@/lib/loyalty/localize-public-copy";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props) {
  return { title: loyaltyLanguage((await searchParams).lang) === "en" ? "Join the loyalty program" : "انضم إلى الولاء والمكافآت", robots: { index: false, follow: false } };
}

export default async function LoyaltyQrPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const language = loyaltyLanguage((await searchParams).lang);
  const brand = await getLoyaltyBrand(slug);
  if (!brand?.program.enabled) notFound();
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://barndaksa.com").replace(/\/$/, "");
  const signupUrl = `${origin}/loyalty/${encodeURIComponent(slug)}?source=qr${language === "en" ? "&lang=en" : ""}`;
  const name = brand.identity.nameEn?.trim() || brand.identity.name;
  const translate = language === "en" ? await englishLoyaltyCopy([name, ...publicProgramCopy(brand.program)]) : null;
  const identity = translate ? { ...brand.identity, name: translate(name) } : brand.identity;
  const program = translate ? localizePublicProgram(brand.program, translate) : brand.program;
  return <LoyaltyQrLanding language={language} identity={identity} program={program} signupUrl={signupUrl} />;
}
