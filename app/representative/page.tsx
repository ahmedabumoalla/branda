export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { redirect } from "next/navigation";
import { RepresentativeDashboardClient } from "@/components/representative/representative-dashboard-client";
import { getRepresentativeDashboard } from "@/lib/data/representatives";

export default async function RepresentativePage() {
  const dashboard = await getRepresentativeDashboard();

  if (!dashboard) {
    redirect("/login");
  }

  return <RepresentativeDashboardClient dashboard={dashboard} />;
}
