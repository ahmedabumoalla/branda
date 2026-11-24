export type BranchReportFilters = { from: string; to: string; branchId: string; search: string; page: number };

export type LoyaltyBranchReportSummary = {
  issuedCards: number; downloadedCards: number; appleInstalledCards: number; googleSaveLinks: number;
  stamps: number; redemptions: number; customers: number; staff: number;
  lastActivityAt: string | null; lastActivityKind: string | null;
};
export type LoyaltyBranchReportBranch = LoyaltyBranchReportSummary & {
  id: string | null; name: string; active: boolean; address: string; city: string; phone: string;
  workingHours: string; createdAt: string | null;
};
export type LoyaltyBranchReportCustomer = {
  id: string; cardId: string; name: string; phone: string | null; branchId: string | null; branchName: string;
  issuedAt: string; source: "cashier" | "registration" | "unknown";
  cashierId: string | null; cashierName: string | null;
  downloadedAt: string | null; appleInstalledAt: string | null; googleSaveLinkAt: string | null;
  stamps: number; redemptions: number; lastActivityAt: string | null; lastActivityKind: string | null;
};
export type LoyaltyBranchReportStaff = {
  id: string; name: string; active: boolean; branchId: string | null; branchName: string;
  issuedCards: number; stamps: number; redemptions: number; lastActivityAt: string | null; lastActivityKind: string | null;
};
export type LoyaltyBranchReportPage = {
  summary: LoyaltyBranchReportSummary; branches: LoyaltyBranchReportBranch[];
  customers: LoyaltyBranchReportCustomer[]; staff: LoyaltyBranchReportStaff[];
  total: number; page: number; pageSize: number; asOf: string;
};
export type LoyaltyBranchReportResult = { ok: true; data: LoyaltyBranchReportPage } | { ok: false; message: string };
export type LoyaltyBranchExportSnapshot = Pick<LoyaltyBranchReportPage, "summary" | "branches" | "customers" | "staff"> & {
  brandName: string; generatedAt: string; from: string; to: string;
};
