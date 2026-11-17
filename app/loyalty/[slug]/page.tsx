import { notFound } from "next/navigation";
import { getBranchLoyaltyBrand, getLoyaltyMembership } from "@/lib/data/loyalty-experience";
import { listPublicLoyaltyBranches } from "@/lib/data/loyalty-branches";
import { isFawaselStore } from "@/lib/commerce/fawasel-profile";
import { branchEnrollmentPath } from "@/lib/loyalty/branch-types";
import Link from "next/link";
import { getWalletReadiness } from "@/lib/wallet";
import { RastEnrollment } from "@/components/rast-loyalty/rast-enrollment";
import { RastMemberCard } from "@/components/rast-loyalty/rast-member-card";
import { getLoyaltyCustomerProfile } from "@/lib/auth/rast-loyalty-session";
import { PublicPageAnalytics } from "@/components/analytics/public-page-analytics";
import { loyaltyVisitKind } from "@/lib/analytics/brand-analytics";

export const dynamic = "force-dynamic";
export const metadata = { title: "بطاقة الولاء والمكافآت", robots: { index: false, follow: false } };

export default async function LoyaltyJoinPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ source?: string | string[]; branch?: string | string[] }> }) {
  const { slug } = await params;
  const query = await searchParams;
  if (query.branch !== undefined && (typeof query.branch !== "string" || !/^[a-f0-9-]{36}$/i.test(query.branch))) notFound();
  const branchId = typeof query.branch === "string" ? query.branch : undefined;
  const [brand, profile] = await Promise.all([getBranchLoyaltyBrand(slug, branchId), getLoyaltyCustomerProfile(slug)]);
  if (!brand) notFound();
  if (!profile && !branchId && isFawaselStore(slug)) {
    const branches = await listPublicLoyaltyBranches(brand.cafeId);
    if (branches.length) return <main dir="rtl" className="mx-auto max-w-3xl px-5 py-12"><h1 className="text-3xl font-bold">اختر فرعك</h1><p className="my-4">بطاقتك بهوية فرع الإصدار ورصيدك ومكافآتك متاحة في جميع فروع فواصل</p><div className="grid gap-4 sm:grid-cols-2">{branches.map(branch => <Link key={branch.id} href={branchEnrollmentPath(slug, branch.id)} className="flex min-h-24 items-center gap-4 rounded-xl border bg-white p-5 text-stone-900 focus-visible:outline-2">{branch.logo && <img src={branch.logo} alt="" className="h-14 w-14 object-contain" />}<strong>{branch.name}</strong></Link>)}</div></main>;
  }
  // Anonymous visitors do not need the authenticated membership query waterfall.
  const membership = brand.program.enabled && profile ? await getLoyaltyMembership(slug, branchId) : null;
  const readiness = getWalletReadiness();
  const analytics = brand.program.enabled ? <PublicPageAnalytics slug={slug} kind={loyaltyVisitKind((await searchParams).source)} /> : null;
  if (membership) return <>{analytics}<RastMemberCard identity={membership.identity} member={membership} loadedAt={membership.loadedAt} walletAvailability={{ apple: readiness.apple && brand.program.appleWalletEnabled, google: readiness.google && brand.program.googleWalletEnabled }} /></>;
  return <>{analytics}<RastEnrollment identity={brand.identity} program={brand.program} authenticated={Boolean(profile)} /></>;
}
