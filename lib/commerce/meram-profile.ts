export const MERAM_CAFE_ID = "98fd33d5-522d-46e7-adeb-34b04a665f4f";
export const MERAM_SLUG = "brand-5fbb1397e4c4";

export function isMeramStore(slug: string | null | undefined): boolean {
  return slug === MERAM_SLUG;
}
