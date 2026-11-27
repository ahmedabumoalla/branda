export const VELVET_CAFE_ID = "1bce3dff-9a05-493e-bf62-2fc741da1cac";
export const VELVET_SLUG = "brand-c37bcf09ca0a";

export function isVelvetStore(slug: string | null | undefined): boolean {
  return slug === VELVET_SLUG;
}
