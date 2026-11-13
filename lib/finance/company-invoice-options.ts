export type InvoiceDeposit = { kind: "amount" | "percent"; value: number; paid: boolean };
export type InvoiceDelivery = { confirmed: boolean; date: string };
export type InvoiceFile = { id: string; name: string; size: number };
export type ShippingMode = "auto" | "none" | "main" | "secondary";
export const COMPANY_FILE_BUCKET = "branda-company-invoice-files";
export const COMPANY_FILE_LIMIT = 8 * 1024 * 1024;

export function invoiceDepositAmount(total: number, deposit: InvoiceDeposit) {
  return Math.round(((deposit.kind === "percent" ? total * deposit.value / 100 : deposit.value) + Number.EPSILON) * 100) / 100;
}

export function invoiceShippingAddress(details: Record<string, string> | undefined, mode: ShippingMode) {
  if (mode === "none") return "";
  if (mode === "auto") mode = ["shippingStreet", "shippingCity", "shippingCountry"].every(key => details?.[key]?.trim()) ? "secondary" : "main";
  return ["buildingNumber", "street", "district", "city", "postalCode", "country"].map(key => details?.[mode === "secondary" ? "shipping" + key[0].toUpperCase() + key.slice(1) : key]).filter(Boolean).join(" ");
}

export function invoiceOptionsNote(shipping?: { address: string }, delivery?: InvoiceDelivery, attachments?: InvoiceFile[]) {
  return [shipping?.address && `عنوان الشحن: ${shipping.address}`, delivery?.confirmed && delivery.date && `تم التسليم: ${new Date(delivery.date).toLocaleString("sv-SE", { timeZone: "Asia/Riyadh" })}`, attachments?.length && `المرفقات: ${attachments.map(file => file.name).join("، ")}`].filter(Boolean).join("\n");
}
