export type LoyaltyBranch = {
  id: string; name: string; active: boolean; enabled: boolean; updatedAt: string;
  address: string; latitude: number | null; longitude: number | null; nearbyMessage: string;
  logo: string | null; banner: string | null; background: string; foreground: string; accent: string;
};

export type LoyaltyBranchCashier = { id: string; name: string; active: boolean; branchId: string | null };
export type LoyaltyBranchesDashboard = { slug: string; brandName?: string; branches: LoyaltyBranch[]; cashiers: LoyaltyBranchCashier[] };

export function branchEnrollmentPath(slug: string, branchId: string) {
  return `/loyalty/${encodeURIComponent(slug)}?branch=${encodeURIComponent(branchId)}`;
}
