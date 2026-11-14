/** Presentation profile only. Server permissions remain independently enforced. */
export const FAWASEL_SLUG = "brand-1c2b6f7e028f";

// Original catalog photographs reviewed together for matching gray backgrounds.
export const FAWASEL_CAMPAIGN_PRODUCT_IDS = [
  "d58841db-13bc-58dd-a45e-6016eb0132d3",
  "eff699ba-25f6-5174-a8f6-84319de1f91c",
] as const;

export function isFawaselStore(slug?: string | null) {
  return slug === FAWASEL_SLUG;
}
