import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { getLabOrders } from "@/app/actions/erp-lab-orders";
import { LabWorkspace } from "@/components/erp/lab/lab-workspace";
import { LabLoadState } from "@/components/erp/lab/lab-load-state";

export const dynamic = "force-dynamic";
export default async function BrandLabPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) notFound();
  if (!await getSessionUser()) redirect(`/finance/${slug}/login`);
  const result = await getLabOrders(slug);
  return result.ok ? <LabWorkspace initialSnapshot={result.data} standalone /> : <LabLoadState message={result.message} />;
}
