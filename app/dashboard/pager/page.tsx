import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { PagerConsole } from "@/components/pager/pager-console";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerPagerContext, getPagerPage } from "@/lib/data/pager";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getSalonBookings } from "@/lib/data/salon";
import { BookingConsole } from "@/components/salon/booking-console";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function OwnerPagerPage() {
  const features = await getOwnerFeatureCodes();
  if (!features.includes("pager")) return <DashboardFeatureBlockedState title="نظام البيجر" />;
  const cafe = await requireOwnerCafeContext();
  if (cafe.businessCategory === "hair_salons") return <BookingConsole pager initial={await getSalonBookings({ status: "active" }, "owner", true)} brandName={cafe.name} />;
  const [context, initialPage] = await Promise.all([getOwnerPagerContext(), getPagerPage({ status: "active" }, "owner")]);
  return <PagerConsole context={context} initialPage={initialPage} mode="owner" />;
}
