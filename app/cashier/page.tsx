import { redirect } from "next/navigation";
import { getLoyaltyBrand, getBranchLoyaltyBrand } from "@/lib/data/loyalty-experience";
import { getCashierConsole, getCashierToken, getCashierLandingPath, requireCashierSessionContext } from "@/lib/data/cashier";
import { RastCashier } from "@/components/rast-loyalty/rast-cashier";
import { PublicServiceUnavailable } from "@/components/public-service-unavailable";
import { StaffWorkspace } from "@/components/cashier/staff-workspace";
import { CashierSessionGuard } from "@/components/cashier/cashier-session-guard";
import { cashierWorkspaceKey } from "@/lib/cashier/workspace-session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
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

  const brand = data.cashier.loyaltyBranchId ? await getBranchLoyaltyBrand(data.cafe.slug, data.cashier.loyaltyBranchId) : await getLoyaltyBrand(data.cafe.slug);
  const initialData = { ...data, pointsProgram: brand?.program.pointsProgram };
  if (data.cafe.businessCategory === "hair_salons") return <><CashierSessionGuard /><RastCashier initialData={initialData} identity={brand?.identity} /></>;
  const token = await getCashierToken();
  if (!token) redirect("/cashier/login");
  return <StaffWorkspace key={cashierWorkspaceKey(token)} sessionKey={cashierWorkspaceKey(token)} initial={{ screen: "loyalty", data: initialData, identity: brand?.identity }} />;
}
