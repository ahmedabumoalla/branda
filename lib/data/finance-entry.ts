import "server-only";
import { getOwnerCafeContext } from "@/lib/data/cafes";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";

/** Call only after the live finance snapshot has authorized this brand and subscription. */
export async function getFinanceEntryPath(slug: string, snapshot: Pick<FinanceSnapshot, "role" | "canManage" | "cafe">) {
  const base = `/finance/${encodeURIComponent(slug)}`;
  if (snapshot.role === "cashier") return `${base}/pos`;
  // Financial staff membership alone never grants dashboard access. Match its tenant too.
  const dashboardCafe = snapshot.canManage ? await getOwnerCafeContext() : null;
  return dashboardCafe?.id === snapshot.cafe.id ? "/dashboard/finance" : base;
}
