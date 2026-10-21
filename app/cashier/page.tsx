import { redirect } from "next/navigation";
import { getLoyaltyBrand } from "@/lib/data/loyalty-experience";
import { getCashierConsole, getCashierToken, getCashierLandingPath, requireCashierSessionContext } from "@/lib/data/cashier";
import { RastCashier } from "@/components/rast-loyalty/rast-cashier";
import { PublicServiceUnavailable } from "@/components/public-service-unavailable";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function CashierPage() {
  const landing = await getCashierLandingPath().catch(() => null);
  if (landing === "/pager") redirect(landing);
  const data = await getCashierConsole();

  if (!data) {
    // A valid employee session without service access is not an expired login.
    const session = await requireCashierSessionContext().catch(() => null);
    if (session) return <PublicServiceUnavailable />;
    if (await getCashierToken()) {
      redirect("/cashier/session/clear?reason=invalid");
    }
    redirect("/cashier/login");
  }

  const brand = await getLoyaltyBrand(data.cafe.slug);
  return <RastCashier initialData={data} identity={brand?.identity} />;
}
