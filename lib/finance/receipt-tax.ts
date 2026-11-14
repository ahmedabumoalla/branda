import qrcode from "qrcode-generator";
import type { FinanceDocument, FinanceReceiptSeller } from "./brand-finance";

/** ZATCA phase-one TLV tags 1–5, UTF-8 byte lengths, then Base64. */
export function getFinanceReceiptTaxStatus(document: FinanceDocument): "ready" | "missing_identity" | "invalid_document" | "not_applicable" {
  if (!["sale", "refund"].includes(document.kind)) return "not_applicable";
  const seller = document.receipt_seller;
  if (!seller?.name.trim() || !/^3[0-9]{13}3$/.test(seller.vatNumber) || new TextEncoder().encode(seller.name).length > 255) return "missing_identity";
  if (!Number.isFinite(document.total) || !Number.isFinite(document.tax) || document.total < 0 || document.tax < 0 || document.tax > document.total || !Number.isFinite(new Date(document.local_created_at || document.created_at).getTime())) return "invalid_document";
  return "ready";
}

export function financeReceiptQr(document: FinanceDocument, ordinaryFallback = false): { payload: string; path: string; size: number; seller: FinanceReceiptSeller | null; kind: "tax" | "reference" } | null {
  const status = getFinanceReceiptTaxStatus(document);
  if (status !== "ready" && (!ordinaryFallback || status === "not_applicable" || !document.id)) return null;
  const seller = status === "ready" ? document.receipt_seller! : null;
  let payload: string;
  if (seller) {
    const values = [seller.name, seller.vatNumber, new Date(document.local_created_at || document.created_at).toISOString(), document.total.toFixed(2), document.tax.toFixed(2)];
    const bytes = values.flatMap((value, index) => {
      const encoded = new TextEncoder().encode(value);
      return [index + 1, encoded.length, ...encoded];
    });
    payload = btoa(String.fromCharCode(...bytes));
  } else {
    payload = JSON.stringify({ type: "receipt", id: document.id, reference: document.local_reference || document.display_number || String(document.number) });
  }
  const qr = qrcode(0, "M"); qr.addData(payload, "Byte"); qr.make();
  const count = qr.getModuleCount(), quiet = 4;
  const path: string[] = [];
  for (let row = 0; row < count; row++) for (let column = 0; column < count; column++) {
    if (qr.isDark(row, column)) path.push(`M${column + quiet} ${row + quiet}h1v1h-1z`);
  }
  return { payload, path: path.join(""), size: count + quiet * 2, seller, kind: seller ? "tax" : "reference" };
}
