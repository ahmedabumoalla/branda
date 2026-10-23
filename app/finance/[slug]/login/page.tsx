import { notFound } from "next/navigation";
import { FinanceLogin } from "@/components/finance/finance-login";
export default async function FinanceLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) notFound();
  return <FinanceLogin slug={slug} />;
}
