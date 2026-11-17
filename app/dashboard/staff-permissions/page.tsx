import { notFound } from "next/navigation";
import { getOwnerCafeContext } from "@/lib/data/cafes";
import { LOCO_CAFE_ID } from "@/lib/whatsapp/brand-connection-types";
import { listBrandStaff } from "@/lib/staff/brand-staff-server";
import { StaffPermissionsPage } from "@/components/dashboard/pages/staff-permissions-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Loco only (user request 2026-11-17)
export default async function StaffPermissionsRoute() {
  const cafe = await getOwnerCafeContext();
  if (!cafe || cafe.id !== LOCO_CAFE_ID || !["owner", "platform_admin"].includes(cafe.role)) notFound();
  const staff = await listBrandStaff().catch(() => null);
  return <StaffPermissionsPage brandName={cafe.name} initial={staff} />;
}
