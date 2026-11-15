import { OwnerLoyaltyPage } from "@/components/loyalty/owner-loyalty-page";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { redirect } from "next/navigation";

export default async function LoyaltyCustomersPage() {
  if ((await requireOwnerCafeContext()).slug === "mind-hospital") redirect("/dashboard/system/customers/loyalty");
  return <OwnerLoyaltyPage requestedView="customers" />;
}
