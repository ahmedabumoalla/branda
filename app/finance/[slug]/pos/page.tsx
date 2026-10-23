import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getBrandFinanceSnapshot } from "@/lib/data/brand-finance";
import { FinancePOS } from "@/components/finance/finance-pos";
import { FinanceAccessDenied } from "@/components/finance/finance-access-denied";
export default async function StandaloneFinancePOS({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) notFound();
  if (!await getSessionUser()) redirect(`/finance/${slug}/login`);
  const snapshot = await getBrandFinanceSnapshot(slug).catch(() => null);
  if (!snapshot) return <FinanceAccessDenied slug={slug} />;
  return <FinancePOS initialSnapshot={snapshot} slug={slug} />;
}
