import { redirect } from "next/navigation";
import { PagerConsole } from "@/components/pager/pager-console";
import { getPagerPage, getStaffPagerContext } from "@/lib/data/pager";
import { getCashierToken } from "@/lib/data/cashier";
import { CashierServiceUnavailable } from "@/components/cashier/cashier-unavailable";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata = { title: "نداء برندة", robots: { index: false, follow: false } };

export default async function PagerPage() {
  if (!(await getCashierToken())) redirect("/cashier/login?next=pager");
  const context = await getStaffPagerContext().catch(() => null);
  if (!context) return <CashierServiceUnavailable />;
  const initialPage = await getPagerPage({ status: "active" }, "staff");
  return <PagerConsole context={context} initialPage={initialPage} />;
}
