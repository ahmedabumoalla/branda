import { ARAB_COUNTRIES } from "@/lib/auth/brand-phone";

export function BrandCountryOptions() {
  return <><option value="">كل الدول</option>{ARAB_COUNTRIES.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</>;
}
