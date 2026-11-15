/** Same ordered address fields used by the database's canonical invoice seller. */
export function systemInvoiceAddress(general: Record<string, unknown> | null | undefined): string {
  if (!general) return "";
  const parts = ["building", "street", "secondary", "district", "city", "postal", "shortAddress"]
    .map(key => typeof general[key] === "string" ? general[key].trim() : "")
    .filter(Boolean);
  if (!parts.length) return "";
  if (general.country === "SA") parts.push("المملكة العربية السعودية");
  return parts.join("، ");
}
