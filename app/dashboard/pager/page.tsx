import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { PagerConsole } from "@/components/pager/pager-console";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerPagerContext, getPagerPage } from "@/lib/data/pager";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getSalonBookings } from "@/lib/data/salon";
import { DEGREES_SALON_ID } from "@/lib/salon/degrees";
import { BookingConsole } from "@/components/salon/booking-console";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function OwnerPagerPage() {
  const features = await getOwnerFeatureCodes();
  const cafe = await requireOwnerCafeContext();
  if (!features.includes(cafe.id === DEGREES_SALON_ID ? "menu" : "pager")) return <DashboardFeatureBlockedState title="نظام البيجر" />;
  if (cafe.businessCategory === "hair_salons") return <BookingConsole editablePrice={cafe.id === DEGREES_SALON_ID} pager initial={await getSalonBookings({ status: "active" }, "owner", true)} brandName={cafe.name} />;
  const [context, initialPage] = await Promise.all([getOwnerPagerContext(), getPagerPage({ status: "active" }, "owner")]);
  return <PagerConsole context={{ ...context, canUseLoyalty: features.includes("loyalty") }} initialPage={initialPage} mode="owner" />;
}
