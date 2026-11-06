import { notFound } from "next/navigation";
import { BrandPhonePage } from "@/components/dashboard/pages/brand-phone-page";
import { getOwnerCafeContext } from "@/lib/data/cafes";
import { BrandWhatsAppError, getBrandWhatsAppDashboard } from "@/lib/data/brand-whatsapp";
import { LOCO_CAFE_ID } from "@/lib/whatsapp/brand-connection-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function BrandPhoneRoute() {
  const cafe = await getOwnerCafeContext();
  if (!cafe || cafe.id !== LOCO_CAFE_ID) notFound();
  const dashboard = await getBrandWhatsAppDashboard().catch(error => {
    if (error instanceof BrandWhatsAppError && error.status === 403) notFound();
    return null;
  });
  return <BrandPhonePage initialDashboard={dashboard} />;
}
