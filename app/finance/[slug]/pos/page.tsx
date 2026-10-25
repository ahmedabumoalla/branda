import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getBrandFinanceSnapshot } from "@/lib/data/brand-finance";
import { FinancePOS } from "@/components/finance/finance-pos";
import { FinanceAccessDenied } from "@/components/finance/finance-access-denied";
import { getOwnerCafeContext } from "@/lib/data/cafes";
export default async function StandaloneFinancePOS({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) notFound();
  if (!await getSessionUser()) redirect(`/finance/${slug}/login`);
  const snapshot = await getBrandFinanceSnapshot(slug).catch(() => null);
  if (!snapshot) return <FinanceAccessDenied slug={slug} />;
  // Financial membership alone never grants entry to the brand dashboard.
  // Resolve the current dashboard tenant on the server, including maintenance mode.
  const dashboardCafe = snapshot.canManage ? await getOwnerCafeContext() : null;
  const dashboardHref = dashboardCafe?.id === snapshot.cafe.id ? "/dashboard/finance" : undefined;
  return <FinancePOS initialSnapshot={snapshot} slug={slug} dashboardHref={dashboardHref} />;
}
