import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { loadEmployeeApprovals } from "@/app/actions/finance-employee-approvals";
import { EmployeeApprovalWorkspace } from "@/components/finance/employee-approval-workspace";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) notFound();
  if (!await getSessionUser()) redirect(`/finance/${slug}/login`);
  const data = await loadEmployeeApprovals(slug);
  return <EmployeeApprovalWorkspace slug={slug} name={data.name} initial={data.rows} />;
}
