export type MenuImportSourceType = "pdf" | "url";
export type MenuImportJobStatus = "pending" | "processing" | "ready" | "failed" | "imported";
export type MenuImportItemStatus = "ready" | "needs_review" | "skipped" | "imported";

export type ExtractedMenuItem = {
  id?: string;
  categoryName?: string | null;
  productName: string;
  description?: string | null;
  price?: number | null;
  calories?: number | null;
  prepTimeMinutes?: number | null;
  chefName?: string | null;
  imageUrl?: string | null;
  imageStoragePath?: string | null;
  galleryUrls?: string[];
  galleryStoragePaths?: string[];
  metadata?: Record<string, unknown> | null;
  status: Exclude<MenuImportItemStatus, "imported">;
};

export type MenuImportReport = {
  extractedCount: number;
  needsReviewCount: number;
  withoutPriceCount: number;
  withoutImageCount: number;
  imageDownloadFailures: string[];
  missingFields: string[];
  unreadableUrls: string[];
  notes: string[];
};

export type MenuImportAnalysis = {
  items: ExtractedMenuItem[];
  report: MenuImportReport;
  rawSummary: Record<string, unknown>;
};

export type MenuImportReviewItem = {
  id: string;
  categoryName: string;
  productName: string;
  description: string;
  price: number | null;
  calories: number | null;
  prepTimeMinutes: number | null;
  chefName: string;
  imageUrl: string;
  imageStoragePath: string;
  galleryUrls: string[];
  galleryStoragePaths: string[];
  metadata: Record<string, unknown>;
  status: MenuImportItemStatus;
};

export type MenuImportReviewJob = {
  id: string;
  sourceType: MenuImportSourceType;
  sourceUrl: string | null;
  sourceFilePath: string | null;
  status: MenuImportJobStatus;
  errorMessage: string | null;
  rawSummary: Record<string, unknown> | null;
  createdAt: string;
  items: MenuImportReviewItem[];
};

export type MenuImportEditableItem = {
  id: string;
  categoryName: string;
  productName: string;
  description: string;
  price: number | null;
  calories: number | null;
  prepTimeMinutes: number | null;
  chefName: string;
  imageUrl: string;
  imageStoragePath: string;
  status: Exclude<MenuImportItemStatus, "imported">;
};
