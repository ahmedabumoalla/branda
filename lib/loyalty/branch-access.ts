// These brands retain their already configured branch workflow and entitlement.
export function usesExistingBranchWorkflow(slug: string | null | undefined) {
  return slug === "brand-9a8c97305195" || slug === "brand-3c0437f1733a";
}
