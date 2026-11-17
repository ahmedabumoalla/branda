import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { buildFinanceThermalReceiptHtml } from "@/lib/export/finance-thermal-receipt-html";
import { renderFinanceThermalReceiptPdf } from "@/lib/export/finance-thermal-receipt-pdf";
import type { FinanceCustomerReceipt } from "@/lib/finance/customer-receipt";
import type { FinanceReceiptSeller } from "@/lib/finance/brand-finance";
import { createAdminClient } from "@/lib/supabase/admin";
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
      const url = new URL(brand.logoUrl, "https://barndaksa.com");
      // Platform-hosted brand art may be stored as an absolute barndaksa.com URL instead of a root path
      const localAsset = url.origin === "https://barndaksa.com" && (brand.logoUrl.startsWith("/") || brand.logoUrl.startsWith("https://barndaksa.com/"));
      if (localAsset && !/\.(png|jpe?g|webp)$/i.test(url.pathname)) throw new Error("INVALID_RECEIPT_LOGO_PATH");
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
  const [resolvedFonts, logo, seller] = await Promise.all([fonts, receiptLogo(receipt), receiptSeller(receipt)]);
  return renderFinanceThermalReceiptPdf(buildFinanceThermalReceiptHtml(seller ? { ...receipt, receiptSeller: seller } : receipt, resolvedFonts, logo));
}

/** The queued projection omits the seller, so the WhatsApp copy reads the brand's current tax identity */
async function receiptSeller(receipt: FinanceCustomerReceipt): Promise<FinanceReceiptSeller | null> {
  if (receipt.receiptSeller || !receipt.cafeId) return null;
  try {
    const admin = createAdminClient();
    const [cafe, settings] = await Promise.all([
      admin.from("cafes").select("name").eq("id", receipt.cafeId).maybeSingle(),
      admin.from("cafe_settings").select("tax_number").eq("cafe_id", receipt.cafeId).maybeSingle(),
    ]);
    const name = typeof cafe.data?.name === "string" ? cafe.data.name.trim() : "";
    const vatNumber = typeof settings.data?.tax_number === "string" ? settings.data.tax_number.trim() : "";
    // Only a valid VAT registration turns the copy into a simplified tax invoice with the ZATCA QR
    return name && /^3[0-9]{13}3$/.test(vatNumber) ? { name, vatNumber } : null;
  } catch { console.warn("FINANCE_RECEIPT_SELLER_UNAVAILABLE"); return null; }
}
