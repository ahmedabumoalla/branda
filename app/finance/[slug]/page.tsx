import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getBrandFinanceSnapshot } from "@/lib/data/brand-finance";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { FinanceAccessDenied } from "@/components/finance/finance-access-denied";
export default async function StandaloneFinanceWorkspace({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) notFound();
  if (!await getSessionUser()) redirect(`/finance/${slug}/login`);
  const snapshot = await getBrandFinanceSnapshot(slug).catch(() => null);
  if (!snapshot) return <FinanceAccessDenied slug={slug} />;
  if (!snapshot.canManage) redirect(`/finance/${slug}/pos`);
  return <FinanceWorkspace initialSnapshot={snapshot} slug={slug} />;
}
