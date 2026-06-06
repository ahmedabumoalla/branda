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
