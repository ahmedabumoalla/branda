import { ARAB_COUNTRIES } from "@/lib/auth/brand-phone";

export function brandCountryName(country: string | undefined) {
  return ARAB_COUNTRIES.find(item => item.code === (country ?? "SA"))?.name ?? "دولة غير معروفة";
}
