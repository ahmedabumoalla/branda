import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicPageAnalytics } from "@/components/analytics/public-page-analytics";
import { LoyaltyLanguageLink } from "@/components/rast-loyalty/loyalty-language-link";
import { RastEnrollment } from "@/components/rast-loyalty/rast-enrollment";
import { RastMemberCard } from "@/components/rast-loyalty/rast-member-card";
import { loyaltyVisitKind } from "@/lib/analytics/brand-analytics";
import { getLoyaltyCustomerProfile } from "@/lib/auth/rast-loyalty-session";
import { isFawaselStore } from "@/lib/commerce/fawasel-profile";
import { getBrandPhoneCountry } from "@/lib/data/brand-phone-country";
import { listPublicLoyaltyBranches } from "@/lib/data/loyalty-branches";
import { getBranchLoyaltyBrand, getLoyaltyMembership } from "@/lib/data/loyalty-experience";
import { branchEnrollmentPath } from "@/lib/loyalty/branch-types";
import { loyaltyLanguage } from "@/lib/loyalty/customer-language";
import { englishLoyaltyCopy, localizePublicProgram, publicProgramCopy } from "@/lib/loyalty/localize-public-copy";
import { getWalletReadiness } from "@/lib/wallet";

export const dynamic = "force-dynamic";

type Query = { lang?: string | string[]; source?: string | string[]; branch?: string | string[] };
type PageProps = { params: Promise<{ slug: string }>; searchParams: Promise<Query> };

export async function generateMetadata({ searchParams }: PageProps) {
  const language = loyaltyLanguage((await searchParams).lang);
  return { title: language === "en" ? "Loyalty card and rewards" : "بطاقة الولاء والمكافآت", robots: { index: false, follow: false } };
}

export default async function LoyaltyJoinPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const language = loyaltyLanguage(query.lang);
  const en = language === "en";
  if (query.branch !== undefined && (typeof query.branch !== "string" || !/^[a-f0-9-]{36}$/i.test(query.branch))) notFound();
  const branchId = typeof query.branch === "string" ? query.branch : undefined;
  const [brand, profile] = await Promise.all([getBranchLoyaltyBrand(slug, branchId), getLoyaltyCustomerProfile(slug)]);
  if (!brand) notFound();

  if (!profile && !branchId && isFawaselStore(slug)) {
    const branches = await listPublicLoyaltyBranches(brand.cafeId);
    if (branches.length) {
      const translate = en ? await englishLoyaltyCopy(branches.map(branch => branch.name)) : (value: string) => value;
      const options = new URLSearchParams();
      if (en) options.set("lang", "en");
      if (typeof query.source === "string") options.set("source", query.source);
      const suffix = options.size ? "&" + options.toString() : "";
      return <main lang={language} dir={en ? "ltr" : "rtl"} className="mx-auto max-w-3xl px-5 py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">{en ? "Choose your branch" : "اختر فرعك"}</h1>
          <LoyaltyLanguageLink language={language} />
        </header>
        <p className="my-4">{en ? "Your card shows the issuing branch. Use your balance and rewards at any Fawasel branch" : "بطاقتك بهوية فرع الإصدار ورصيدك ومكافآتك متاحة في جميع فروع فواصل"}</p>
        <div className="grid gap-4 sm:grid-cols-2">{branches.map(branch => <Link key={branch.id} href={branchEnrollmentPath(slug, branch.id) + suffix} className="flex min-h-24 items-center gap-4 rounded-xl border bg-white p-5 text-stone-900 focus-visible:outline-2">
          {branch.logo && <img src={branch.logo} alt="" className="h-14 w-14 object-contain" />}<strong>{translate(branch.name)}</strong>
        </Link>)}</div>
      </main>;
    }
  }

  const membership = brand.program.enabled && profile ? await getLoyaltyMembership(slug, branchId) : null;
  const source = membership ?? brand;
  const programFields = publicProgramCopy(source.program);
  const name = source.identity.nameEn?.trim() || source.identity.name;
  const translate = en ? await englishLoyaltyCopy([name, ...programFields]) : (value: string) => value;
  const identity = en ? { ...source.identity, name: translate(name), nameEn: translate(name) } : source.identity;
  const program = en ? localizePublicProgram(source.program, translate) : source.program;
  const analytics = brand.program.enabled ? <PublicPageAnalytics slug={slug} kind={loyaltyVisitKind(query.source)} /> : null;
  if (membership) {
    const readiness = getWalletReadiness();
    // Snapshot text only reuses translations for public program wording; customer records stay private.
    const rewardCopy = en ? Object.fromEntries(programFields.map(value => [value, translate(value)])) : undefined;
    return <>{analytics}<RastMemberCard language={language} identity={identity} member={{ ...membership, program }} rewardCopy={rewardCopy}
      loadedAt={membership.loadedAt} walletAvailability={{ apple: readiness.apple && brand.program.appleWalletEnabled, google: readiness.google && brand.program.googleWalletEnabled }} /></>;
  }
  return <>{analytics}<RastEnrollment language={language} phoneCountry={await getBrandPhoneCountry(brand.cafeId)} identity={identity} program={program} authenticated={Boolean(profile)} /></>;
}
