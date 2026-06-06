import { redirect } from "next/navigation";
import { CashierConsoleClient } from "@/components/cashier/cashier-console-client";
import { getCashierConsole } from "@/lib/data/cashier";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function CashierPage() {
  const data = await getCashierConsole();

  if (!data) {
    redirect("/login");
  }

  return <CashierConsoleClient initialData={data} />;
}
