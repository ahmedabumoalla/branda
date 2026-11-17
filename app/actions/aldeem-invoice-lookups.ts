"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { actionResult } from "@/lib/platform/action-result";
import type { FinanceSnapshot, FinanceParty } from "@/lib/finance/brand-finance";
import { inventorySalesCatalogSchema, type InvoiceCatalogProduct } from "@/lib/finance/inventory-sales";

// Owner-only Aldeem workspace. Scoped RPCs enforce the same tenant/role boundary.
async function context() {
  const { cafe } = await getBrandFinanceContext("khayal-aldeem");
  if (cafe.slug !== "khayal-aldeem" || cafe.role !== "owner") throw new Error("هذه الصفحة متاحة لمالك العلامة فقط");
  return { cafe };
}
const term = z.string().trim().max(100);
export async function getAldeemInvoiceShell() {
  return actionResult(async (): Promise<FinanceSnapshot> => {
    const { cafe } = await context();
    return { cafe, role: cafe.role, userId: "", canManage: true, canAdminister: true,
      settings: { vat_rate: 0, tax_inclusive: true, currency: "SAR", closed_through: null },
      accounts: [], parties: [], products: [], items: [], warehouses: [], stock: [], documents: [], shifts: [], staff: [], journal: [], movements: [], trialBalance: [], truncated: false,
      summary: { sales: 0, purchases: 0, expenses: 0, profit: 0, receivables: 0, payables: 0, inventoryValue: 0 } };
  }, "تعذر التحقق من صلاحية الفواتير");
}

export async function searchAldeemInvoiceCustomers(query: string, ids: string[] = []) {
  return actionResult(async (): Promise<FinanceParty[]> => {
    const text = term.parse(query), selected = z.array(z.uuid()).max(100).parse(ids);
    const { cafe, client } = await getBrandFinanceContext("khayal-aldeem");
    const result = await client.rpc("aldeem_customer_lookup", { p_cafe_id: cafe.id, p_query: text, p_ids: selected });
    if (result.error) throw new Error("تعذر عرض قائمة العملاء أعد المحاولة");
    return result.data as FinanceParty[];
  }, "تعذر البحث عن العملاء");
}

export async function getAldeemInvoicePaymentOptions() {
  return actionResult(async () => {
    const { cafe, client } = await getBrandFinanceContext("khayal-aldeem");
    const result = await client.rpc("aldeem_invoice_payment_options", { p_cafe_id: cafe.id });
    if (result.error || !result.data?.settings) throw new Error("تعذر قراءة خيارات التحصيل والمستودع أعد المحاولة");
    return result.data as Pick<FinanceSnapshot, "accounts" | "warehouses" | "settings">;
  }, "تعذر تحميل خيارات الفاتورة");
}

export async function searchAldeemInvoiceProducts(query: string, ids: string[] = []) {
  return actionResult(async (): Promise<InvoiceCatalogProduct[]> => {
    const selected = z.array(z.uuid()).max(100).parse(ids);
    const text = term.parse(query);
    const { cafe, client } = await getBrandFinanceContext("khayal-aldeem");
    const result = await client.rpc("aldeem_invoice_catalog_lookup", { p_cafe_id: cafe.id, p_query: text, p_ids: selected });
    if (result.error) throw new Error("تعذر البحث عن الأصناف أعد المحاولة");
    const bundle = result.data as {
      menu: { id: string; name: string; price: number; available: boolean; image_storage_path: string | null; category_id: string | null }[];
      items: { id: string; name: string; sku: string; barcode: string; unit: string }[];
      metas: { item_id: string; kind: string; payload: Record<string, unknown>; category_id: string | null; unit_template_id: string | null }[];
      catalogs: { id: string; name: string; payload: Record<string, unknown>; active: boolean }[];
      categories: { id: string; name: string }[];
      branchPrices?: { itemId: string; price: number | null; unitFactor: number; stale: boolean }[];
    };
    const items = { data: bundle.items }, metas = { data: bundle.metas }, catalogs = { data: bundle.catalogs };
    const inventory = inventorySalesCatalogSchema.parse((metas.data ?? []).filter(meta => meta.kind === "product").map(meta => {
      const item = items.data.find(row => row.id === meta.item_id)!;
      const payload = meta.payload as Record<string, unknown>;
      const template = catalogs.data?.find(row => row.id === meta.unit_template_id && row.active);
      const units = (template?.payload as { units?: { name: string; factor: number }[] } | undefined)?.units ?? [{ name: item.unit, factor: 1 }];
      const unitName = String(payload.saleUnitName || item.unit);
      const factor = units.find(unit => unit.name === unitName)?.factor;
      if (!factor) throw new Error("راجع قالب وحدات الصنف");
      const vatRate = Number(payload.tax1 ?? 15) + Number(payload.tax2 ?? 0);
      if (![0, 15].includes(vatRate)) throw new Error("راجع ضريبة الصنف قبل إضافته");
      const branchPrice = bundle.branchPrices?.find(row => row.itemId === item.id && row.price !== null);
      const price = branchPrice && !branchPrice.stale ? Math.round(branchPrice.price! * factor / branchPrice.unitFactor * 100) / 100 : Number(payload.salePrice ?? 0);
      return { id: item.id, catalogSource: "inventory", name: item.name, sku: item.sku, barcode: item.barcode, description: String(payload.description ?? ""), kind: meta.kind === "product" ? "product" : "service", available: !branchPrice?.stale, imageUrl: null, stockTracked: meta.kind === "product", itemId: item.id, quantity: 0, category: catalogs.data?.find(row => row.id === meta.category_id)?.name ?? "", unitName, unitFactor: factor, saleUnitFactor: factor, units, price, minimumPrice: Number(payload.minimumPrice ?? 0), discount: Number(payload.discount ?? 0), discountKind: payload.discountType ?? "amount", vatRate, taxCategory: vatRate === 15 ? "S" : payload.taxCategory ?? "Z", exemptionReason: String(payload.exemptionReason ?? "") };
    }));
    // Inventory availability and authoritative prices are revalidated at issuance.
    return inventory;
  }, "تعذر البحث عن الأصناف");
}
