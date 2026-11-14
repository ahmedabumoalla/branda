/** Presentation profile only. Server permissions remain independently enforced. */
export const FAWASEL_SLUG = "brand-1c2b6f7e028f";

export function isFawaselStore(slug?: string | null) {
  return slug === FAWASEL_SLUG;
}
