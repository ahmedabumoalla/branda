export const ALDEEM_SLUG = "khayal-aldeem";
export function isAldeemCafe(cafe: { slug?: string | null } | null | undefined) {
  return cafe?.slug === ALDEEM_SLUG;
}
