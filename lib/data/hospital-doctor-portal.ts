import "server-only";
import { getSessionUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandPhoneCountryBySlug } from "@/lib/data/brand-phone-country";
import { normalizeBrandPhone } from "@/lib/auth/brand-phone";
import { hospitalDoctorStatementSchema, type HospitalDoctorPortalState } from "@/lib/commerce/hospital-doctor-portal";

/** The client never supplies a doctor id or phone; the database rechecks this verified Auth identity. */
export async function readHospitalDoctorPortal(slug: string): Promise<HospitalDoctorPortalState> {
  if (slug !== "mind-hospital") return { state: "missing" };
  try {
  const user = await getSessionUser();
  if (!user) return { state: "login" };
  const country = await getBrandPhoneCountryBySlug(slug);
  const phone = normalizeBrandPhone(user.phone ?? "", country);
  if (!user.phone_confirmed_at || !phone) return { state: "verify-phone" };
  const { data, error } = await createAdminClient().rpc("hospital_doctor_statement", { p_slug: slug, p_user: user.id });
  if (error) {
    if (/HOSPITAL_DOCTOR_NOT_FOUND/.test(error.message ?? "")) return { state: "unlinked" };
    return { state: "unavailable" };
  }
  const parsed = hospitalDoctorStatementSchema.safeParse(data);
  if (!parsed.success || parsed.data.brand.slug !== slug || normalizeBrandPhone(parsed.data.doctor.phone, country) !== phone) return { state: "unavailable" };
  return { state: "ready", data: parsed.data };
  } catch {
    return { state: "unavailable" };
  }
}
