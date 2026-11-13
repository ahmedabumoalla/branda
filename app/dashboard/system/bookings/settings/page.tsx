import { getErpBookings } from "@/lib/data/erp-bookings";
import { BookingWorkspace } from "@/components/erp/bookings/booking-workspace";
export const dynamic="force-dynamic";
export default async function Page(){const data=await getErpBookings();return <BookingWorkspace initial={data.snapshot} slug={data.slug} initialFrom={data.from} initialTo={data.to} settingsPage/>;}
