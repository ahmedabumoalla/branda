"use server";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { readAssetSpreadsheet } from "@/lib/data/erp-assets-import";
import { invoiceFromRows } from "@/lib/finance/invoice-import";
import { extractInvoiceFile } from "@/lib/finance/invoice-import-ai";
import { actionResult } from "@/lib/platform/action-result";

export async function previewInvoiceImportAction(form: FormData, slug: string) {
  return actionResult(async () => {
    const { cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية استيراد الفواتير");
    const file = form.get("file"), mode = form.get("mode");
    if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024) throw new Error("اختر ملفًا بحجم لا يتجاوز ثلاثة ميجابايت");
    if (mode === "ai") return extractInvoiceFile(file);
    if (mode !== "sheet") throw new Error("طريقة الاستيراد غير صحيحة");
    try { return invoiceFromRows(await readAssetSpreadsheet(file, ",")); }
    catch (error) { if (error instanceof Error) throw new Error(error.message.replaceAll("مائة أصل", "مائة بند")); throw error; }
  }, "تعذر استيراد الملف راجع الصيغة وأعد المحاولة");
}
