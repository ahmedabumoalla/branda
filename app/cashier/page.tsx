import { redirect } from "next/navigation";
import { CashierConsoleClient } from "@/components/cashier/cashier-console-client";
import { getCashierConsole, getCashierToken } from "@/lib/data/cashier";
import { RastCashier } from "@/components/rast-loyalty/rast-cashier";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function CashierPage() {
  const data = await getCashierConsole();

  if (!data) {
    if (await getCashierToken()) {
      redirect("/cashier/session/clear?reason=invalid");
    }
    redirect("/cashier/login");
  }

  return data.cafe.slug === "rast" ? <RastCashier initialData={data} /> : <CashierConsoleClient initialData={data} />;
}
