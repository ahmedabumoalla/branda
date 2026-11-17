import { LoyaltyBranches } from "@/components/loyalty/loyalty-branches";
import { getOwnerLoyaltyBranches } from "@/lib/data/loyalty-branches";
export const dynamic = "force-dynamic";
export default async function LoyaltyBranchesPage() {
  try { return <LoyaltyBranches initial={await getOwnerLoyaltyBranches()} />; }
  catch { return <LoyaltyBranches initial={{ slug: "", branches: [], cashiers: [] }} error="تعذر تحميل فروع الولاء تأكد من صلاحية الحساب وأعد المحاولة" />; }
}
