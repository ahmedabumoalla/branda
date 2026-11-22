/** User decision of 2026-11-22: ال كافيه (l-cafe-59cfdc54) is shown the same options as MIND during its trial
 * Hospital features stay with MIND alone through isHospitalStore. Add a brand here only on the user's word */
const mindPresentationSlugs: ReadonlySet<string> = new Set(["mind-hospital", "l-cafe-59cfdc54"]);

/** Brand-specific presentation only; financial records and server permissions stay intact. */
export function isMindSalesSimplified(slug: string) {
  return mindPresentationSlugs.has(slug.trim().toLowerCase());
}

const hiddenMindSalesViews = new Set([
  "create", "quotes", "quote-create", "credit-notes", "credit-create", "credit-note",
  "recurring", "recurring-create", "recurring-detail", "sales-settings",
]);

export function isSalesViewVisible(slug: string, view?: string | null) {
  return !isMindSalesSimplified(slug) || !hiddenMindSalesViews.has(view ?? "");
}
