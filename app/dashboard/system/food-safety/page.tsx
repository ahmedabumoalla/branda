import { getFoodSafety } from "@/app/actions/erp-food-safety";
import { FoodSafetyWorkspace } from "@/components/aldeem/food-safety";
import { AldeemLoadState } from "@/components/aldeem/load-state";

export const dynamic = "force-dynamic";
export default async function FoodSafetyPage() {
  const result = await getFoodSafety();
  return result.ok ? <FoodSafetyWorkspace initialSnapshot={result.data} /> : <AldeemLoadState title="سجل سلامة الغذاء" message={result.message} />;
}
