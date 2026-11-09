import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getBrandFinanceSnapshot } from "@/lib/data/brand-finance";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { FinanceAccessDenied } from "@/components/finance/finance-access-denied";
import { getFinanceEntryPath } from "@/lib/data/finance-entry";
export default async function StandaloneFinanceWorkspace({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ section?: string; view?: string; party?: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) notFound();
  if (!await getSessionUser()) redirect(`/finance/${slug}/login?access=team`);
  const snapshot = await getBrandFinanceSnapshot(slug).catch(() => null);
  if (!snapshot) return <FinanceAccessDenied slug={slug} />;
  if (!snapshot.canManage) redirect(`/finance/${slug}/pos`);
  if (await getFinanceEntryPath(slug, snapshot) === "/dashboard/finance") {
    const { section, view, party } = await searchParams;
    const query = new URLSearchParams();
    if (section) query.set("section", section);
    if (view) query.set("view", view);
    if (party) query.set("party", party);
    redirect(`/dashboard/finance${query.size ? `?${query}` : ""}`);
  }
  return <FinanceWorkspace initialSnapshot={snapshot} slug={slug} />;
}
