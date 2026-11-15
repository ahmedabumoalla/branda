import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { readFinanceLoyaltySettings } from "@/app/actions/finance-loyalty-settings";
import { FinanceLoyaltySettings } from "@/components/loyalty/finance-loyalty-settings";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) notFound();
  if (!await getSessionUser()) redirect(`/finance/${slug}/login`);
  return <main className="mx-auto max-w-4xl p-4 sm:p-6"><Link href={`/finance/${slug}`}>العودة للمالية</Link><FinanceLoyaltySettings slug={slug} initialResult={await readFinanceLoyaltySettings(slug)} /></main>;
}
