import { notFound, redirect } from "next/navigation";
import { FinanceLogin } from "@/components/finance/finance-login";
import { SalesCashierLogin } from "@/components/finance/sales-cashier-login";
import { FinanceAccessDenied } from "@/components/finance/finance-access-denied";
import { getSessionUser } from "@/lib/supabase/server";
import { getBrandFinanceSnapshot } from "@/lib/data/brand-finance";
import { getFinanceEntryPath } from "@/lib/data/finance-entry";
export default async function FinanceLoginPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ access?: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) notFound();
  const { access } = await searchParams;
  if (access === "management" || access === "team") {
    if (await getSessionUser()) {
      const snapshot = await getBrandFinanceSnapshot(slug).catch(() => null);
      if (!snapshot) return access === "team" ? <FinanceLogin slug={slug} /> : <FinanceAccessDenied slug={slug} />;
      redirect(await getFinanceEntryPath(slug, snapshot));
    }
    // Owners use the platform's normal account and dashboard login.
    if (access === "management") redirect("/login");
    return <FinanceLogin slug={slug} />;
  }
  return <SalesCashierLogin slug={slug} />;
}
