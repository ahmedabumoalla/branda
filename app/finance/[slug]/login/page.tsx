import { notFound } from "next/navigation";
import { FinanceLogin } from "@/components/finance/finance-login";
import { SalesCashierLogin } from "@/components/finance/sales-cashier-login";
export default async function FinanceLoginPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ access?: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) notFound();
  const { access } = await searchParams;
  if (access === "management") return <FinanceLogin slug={slug} />;
  return <SalesCashierLogin slug={slug} />;
}
