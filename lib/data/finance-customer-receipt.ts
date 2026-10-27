import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { buildFinanceThermalReceiptHtml } from "@/lib/export/finance-thermal-receipt-html";
import { renderFinanceThermalReceiptPdf } from "@/lib/export/finance-thermal-receipt-pdf";
import type { FinanceCustomerReceipt } from "@/lib/finance/customer-receipt";
import { getFinanceReceiptBrandForCafe } from "./finance-receipt-brand";

async function receiptLogo(receipt: FinanceCustomerReceipt): Promise<string | null> {
  if (!receipt.cafeId) return null;
  try {
    const brand = await getFinanceReceiptBrandForCafe({ id: receipt.cafeId, name: receipt.brandName });
    if (!brand.logoUrl) return null;
    let bytes: Uint8Array;
    if (brand.logoUrl.startsWith("data:")) {
      bytes = Buffer.from(brand.logoUrl.split(",")[1], "base64");
    } else {
      const localAsset = brand.logoUrl.startsWith("/");
      if (localAsset && !/\.(png|jpe?g|webp)$/i.test(brand.logoUrl)) throw new Error("INVALID_RECEIPT_LOGO_PATH");
      const url = new URL(brand.logoUrl, "https://barndaksa.com");
      const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
      if (!(localAsset && url.origin === "https://barndaksa.com") && (url.origin !== storage.origin || !url.pathname.startsWith("/storage/v1/object/"))) throw new Error("INVALID_RECEIPT_LOGO_ORIGIN");
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000), cache: "no-store" });
      if (!response.ok || Number(response.headers.get("content-length")) > 3_000_000) throw new Error("RECEIPT_LOGO_UNAVAILABLE");
      const chunks: Uint8Array[] = []; let length = 0;
      const reader = response.body!.getReader();
      try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 3_000_000) throw new Error("RECEIPT_LOGO_TOO_LARGE"); chunks.push(part.value); } }
      finally { await reader.cancel(); }
      bytes = Buffer.concat(chunks);
    }
    if (bytes.length > 3_000_000) throw new Error("RECEIPT_LOGO_TOO_LARGE");
    const png = await sharp(bytes, { limitInputPixels: 16_000_000 }).resize({ width: 600, height: 400, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch { console.warn("FINANCE_RECEIPT_LOGO_UNAVAILABLE"); return null; }
}

let fonts: Promise<{ regular: string; bold: string }> | undefined;
export async function createFinanceCustomerReceiptPdf(receipt: FinanceCustomerReceipt) {
  // Cache font assets only; customer invoice contents are never cached or made public.
  fonts ??= Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/tajawal-regular.ttf"), "base64"),
    readFile(path.join(process.cwd(), "public/fonts/tajawal-bold.ttf"), "base64"),
  ]).then(([regular,bold])=>({regular,bold})).catch(error=>{fonts=undefined;throw error;});
  const [resolvedFonts, logo] = await Promise.all([fonts, receiptLogo(receipt)]);
  return renderFinanceThermalReceiptPdf(buildFinanceThermalReceiptHtml(receipt, resolvedFonts, logo));
}
