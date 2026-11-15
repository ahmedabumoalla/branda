/** Brand-specific presentation only; financial records and server permissions stay intact. */
export function isMindSalesSimplified(slug: string) {
  return slug.trim().toLowerCase() === "mind-hospital";
}

const hiddenMindSalesViews = new Set([
  "create", "quotes", "quote-create", "credit-notes", "credit-create", "credit-note",
  "recurring", "recurring-create", "recurring-detail", "sales-settings",
]);

export function isSalesViewVisible(slug: string, view?: string | null) {
  return !isMindSalesSimplified(slug) || !hiddenMindSalesViews.has(view ?? "");
}
