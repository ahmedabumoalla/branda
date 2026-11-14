/** Hospital ordering is an explicitly provisioned tenant capability, not inferred from a name. */
export const MIND_HOSPITAL_SLUG = "mind-hospital";
export function isHospitalStore(slug: string | null | undefined) {
  return slug === MIND_HOSPITAL_SLUG;
}
