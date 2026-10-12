import { redirect } from "next/navigation";

// All card settings now use the approved, entitlement-gated brand experience
export default function LoyaltyCardDesignerRoute() {
  redirect("/dashboard/loyalty");
}
