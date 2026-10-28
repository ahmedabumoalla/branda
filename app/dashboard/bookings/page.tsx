import { notFound } from "next/navigation";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getSalonBookings } from "@/lib/data/salon";
import { BookingConsole } from "@/components/salon/booking-console";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ booking?: string }> }) {
  const cafe = await requireOwnerCafeContext();
  if (cafe.businessCategory !== "hair_salons") notFound();
  if (!(await getOwnerFeatureCodes()).includes("menu")) return <DashboardFeatureBlockedState title="متابعة الحجوزات" />;
  const query = await searchParams;
  const booking = typeof query.booking === "string" && /^[0-9a-f-]{36}$/i.test(query.booking) ? query.booking : undefined;
  const initial = await getSalonBookings({ booking });
  return <BookingConsole initial={initial} initialBooking={booking} brandName={cafe.name} />;
}
