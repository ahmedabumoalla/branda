import { notFound } from "next/navigation";
import { getSalonPortal } from "@/lib/data/salon";
import { BookingPortal } from "@/components/salon/booking-portal";
export const dynamic = "force-dynamic";
export const metadata = { title: "متابعة حجز الصالون", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await getSalonPortal(token);
  if (!portal) notFound();
  return <BookingPortal token={token} {...portal} />;
}
