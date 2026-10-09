export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { OperationsReportPage } from "@/components/admin/pages/operations-report-page";
import { getAdminOperationsReport } from "@/lib/data/operations-report";

export default async function AdminOperationsRoutePage() {
  const report = await getAdminOperationsReport().catch(() => null);
  return <OperationsReportPage initialReport={report} />;
}
