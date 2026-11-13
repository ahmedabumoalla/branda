import type { CompanyLine } from "@/lib/finance/company-invoice";
import type { AdvancedInvoiceSettings } from "@/lib/finance/invoice-settings";

/** Effective preview only; callers keep the original saved line unchanged. */
export function invoicePolicyLine(line: CompanyLine, settings: AdvancedInvoiceSettings): CompanyLine {
  const policy = line.catalogSource === "inventory" ? line : settings.productPolicies.find(item => item.productId === line.productId);
  const rate = settings.taxMode === "none" ? 0 : settings.taxMode === "specific" ? settings.specificTaxRate : line.productId ? policy?.vatRate ?? 15 : line.vatRate ?? 15;
  const category = settings.taxMode === "none" ? "O" : rate === 15 ? "S" : settings.taxMode === "product" && line.productId ? policy?.taxCategory ?? "Z" : line.taxCategory && line.taxCategory !== "S" ? line.taxCategory : "Z";
  return { ...line, vatRate: rate, taxCategory: category, exemptionReason: line.exemptionReason || policy?.exemptionReason || settings.exemptionReason };
}
