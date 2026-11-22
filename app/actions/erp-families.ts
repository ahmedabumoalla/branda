"use server";
import { getBrandPhoneCountry } from "@/lib/data/brand-phone-country";
import { normalizeFinanceContactPhones } from "@/lib/finance/contact-phones";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { branchRpc } from "@/lib/data/erp-branches";
import { branchInput } from "@/lib/erp/branches";
import { familiesError, readFamilies } from "@/lib/data/erp-families";
import { purchasesContext, purchasesError } from "@/lib/data/erp-purchases";
import { actionResult } from "@/lib/platform/action-result";
import { invalidateFinanceViews } from "@/lib/performance/finance-route-invalidation";
import { showStockItemInMenu } from "@/app/actions/inventory-item-menu-visibility";
import { familyItemSchema, familyReceiptTotal, linkFamilyItemSchema, payFamilySchema, receiveFamilySchema, returnFamilySchema, saveFamilySchema } from "@/lib/erp/families";

type Context = Awaited<ReturnType<typeof getBrandFinanceContext>>;

/** Every step of one user action gets its own stable request id, so a retry resumes instead of repeating */
function stepId(base: string, step: string) {
  const hash = createHash("sha256").update(`${base}:${step}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(branchInput(input));
  if (!result.success) throw new Error(result.error.issues.find(issue => /[\u0600-\u06ff]/.test(issue.message))?.message ?? "راجع بيانات الأسرة والحقول المطلوبة");
  return result.data;
}
async function purchase(context: Context, action: string, payload: unknown, requestId: string, input: unknown) {
  const result = await branchRpc(context.client, context.cafe.id, "erp_purchases_write", { p_cafe_id: context.cafe.id, p_action: action, p_payload: payload, p_request_id: requestId }, input);
  purchasesError(result.error);
  return (result.data ?? {}) as { id?: string; financeId?: string };
}
async function family(context: Context, action: string, payload: unknown) {
  const { data, error } = await context.client.rpc("erp_family_execute", { p_cafe: context.cafe.id, p_action: action, p_payload: payload });
  familiesError(error);
  return data as { id: string; revision: number; existing?: boolean };
}
function refresh(slug: string) {
  revalidatePath("/dashboard/system/families", "layout");
  revalidatePath("/dashboard/system/purchases", "layout");
  revalidatePath("/dashboard/system/inventory", "layout");
  invalidateFinanceViews(slug);
}
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const emptyAddress = { building: "", street: "", additional: "", district: "", city: "", postal: "", short: "", country: "" };

export async function getFamilies(slug?: string) { return actionResult(() => readFamilies(slug), "تعذر تحميل الأسر المنتجة"); }

export async function saveFamily(input: unknown, slug?: string) {
  return actionResult(async () => {
    const value = parse(saveFamilySchema, input);
    const context = await purchasesContext(slug);
    const current = await readFamilies(context.cafe.slug);
    const existing = value.id ? current.families.find(row => row.id === value.id) : undefined;
    if (value.id && !existing) throw new Error("الأسرة غير موجودة أعد تحميل الصفحة");
    const supplierId = existing?.supplierId ?? value.supplierId;
    normalizeFinanceContactPhones(value.profile, await getBrandPhoneCountry(context.cafe.id));
    const phone = value.profile.phone;
    if (!existing && value.createSupplier) {
      await purchase(context, "supplier", { id: supplierId, revision: 0, name: value.name, phone, email: "", taxNumber: "", active: true, firstName: "", lastName: "", mobile: phone, commercialRegistration: "", number: "", currency: "SAR", address: { ...emptyAddress, city: value.profile.city }, contacts: [], addresses: [], note: "", openingBalance: 0, openingDate: today() }, stepId(value.requestId, "supplier"), input);
    } else if (existing && (existing.name !== value.name || existing.phone !== phone)) {
      // Keep the supplier account that carries the ledger of the family under the same name and phone
      const record = current.supplierRecords.find(row => row.id === supplierId);
      const base = { email: "", taxNumber: "", firstName: "", lastName: "", commercialRegistration: "", number: "", currency: "SAR", address: emptyAddress, contacts: [], addresses: [], note: "", openingBalance: 0, openingDate: today() };
      await purchase(context, "supplier", { ...base, ...(record?.payload ?? {}), id: supplierId, revision: record?.revision ?? 0, name: value.name, phone, mobile: phone, active: true }, stepId(value.requestId, "supplier"), input);
    }
    const saved = await family(context, "family", { id: value.id ?? "", revision: value.revision, supplierId, active: value.active, profile: value.profile });
    refresh(context.cafe.slug);
    return saved;
  }, "تعذر حفظ بيانات الأسرة");
}

export async function createFamilyItem(input: unknown, slug?: string) {
  return actionResult(async () => {
    const value = parse(familyItemSchema, input);
    const context = await getBrandFinanceContext(slug);
    const current = await readFamilies(context.cafe.slug);
    const owner = current.families.find(row => row.id === value.familyId);
    if (!owner) throw new Error("الأسرة غير موجودة أعد تحميل الصفحة");
    if (value.barcode && !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value.barcode)) throw new Error("الباركود يقبل الأرقام والحروف الإنجليزية");
    const { data, error } = await context.client.rpc("erp_purchase_product_create", {
      p_cafe: context.cafe.id, p_request: stepId(value.requestId, "product"), p_shift: null,
      p_input: { name: value.name, category: "الأسر المنتجة", brand: "", seller: owner.name, sellerKind: "family", flavor: value.flavor, barcode: value.barcode, unitId: "", trackStock: true, minQuantity: value.minQuantity, buyPrice: value.buyPrice, salePrice: value.salePrice, margin: Math.max(0, Math.round((value.salePrice - value.buyPrice) * 100) / 100), marginType: "amount", components: [], imagePath: null },
    });
    if (error) throw new Error(/[\u0600-\u06ff]/.test(error.message) ? error.message : "تعذر إضافة صنف الأسرة راجع الاسم والباركود");
    const itemId = (data as { item: { id: string } }).item.id;
    await family(context, "item", { familyId: value.familyId, itemId });
    // The cashier sells menu products: list the item there through the existing show in menu switch, deducting one unit per sale
    const listed = await showStockItemInMenu(context.cafe.slug, { itemId, price: value.salePrice, categoryId: "", quantity: 1 }, stepId(value.requestId, "menu"));
    refresh(context.cafe.slug);
    return { id: itemId, warning: listed.ok ? "" : `تم حفظ الصنف وربطه بالأسرة لكنه لم يظهر في الكاشير بعد ${listed.message} ويمكن إظهاره من بطاقة الصنف في المخزون بزر إظهار في المنيو` };
  }, "تعذر إضافة صنف الأسرة");
}

export async function linkFamilyItem(input: unknown, slug?: string) {
  return actionResult(async () => {
    const value = parse(linkFamilyItemSchema, input);
    const context = await getBrandFinanceContext(slug);
    const saved = await family(context, value.linked ? "item" : "unlink_item", { familyId: value.familyId, itemId: value.itemId });
    refresh(context.cafe.slug);
    return saved;
  }, "تعذر تعديل ربط الصنف بالأسرة");
}

export async function receiveFamilyGoods(input: unknown, slug?: string) {
  return actionResult(async () => {
    const value = parse(receiveFamilySchema, input);
    const context = await purchasesContext(slug);
    const current = await readFamilies(context.cafe.slug);
    const owner = current.families.find(row => row.id === value.familyId);
    if (!owner || !owner.active) throw new Error("الأسرة غير موجودة أو موقوفة");
    const already = current.consignments.find(row => row.purchaseId === value.purchaseId);
    if (already) return { id: already.id, financeId: already.financeId };
    const items = new Map(current.items.filter(item => item.familyId === owner.id).map(item => [item.itemId, item]));
    if (value.lines.some(line => !items.has(line.itemId))) throw new Error("كل أصناف الاستلام يجب أن تكون من أصناف هذه الأسرة");
    const total = familyReceiptTotal(value.lines);
    if (!(total > 0)) throw new Error("إجمالي الاستلام يجب أن يكون أكبر من صفر");
    const paid = value.mode === "cash" ? total : 0;
    await purchase(context, "save", {
      id: value.purchaseId, revision: 0, kind: "invoice", title: `استلام من الأسرة المنتجة ${owner.name}`.slice(0, 200), number: value.invoiceNumber, date: value.date, dueDate: null,
      supplierId: owner.supplierId, supplierIds: [], warehouseId: value.warehouseId, sourceId: null, currency: "SAR", exchangeRate: 1, taxInclusive: true,
      discount: 0, discountType: "amount", shipping: 0, adjustment: 0, adjustmentAccountId: null, paid, accountId: value.mode === "cash" ? value.accountId : null,
      received: true, note: value.note, terms: "", customValues: {}, customStatus: "",
      lines: value.lines.map(line => ({ id: line.id, itemId: line.itemId, description: items.get(line.itemId)!.name, unit: items.get(line.itemId)!.unit, quantity: line.quantity, price: line.price, discount: 0, discountType: "amount", taxRate: 0, costCenterId: null })),
    }, stepId(value.requestId, "save"), input);
    let posted: { financeId?: string };
    try {
      posted = await purchase(context, "post", { id: value.purchaseId, revision: 1, expectedTotal: total }, stepId(value.requestId, "post"), input);
    } catch (error) {
      // The draft never reached the ledger or the stock: remove it so the receipt can be entered again cleanly
      await purchase(context, "delete", { id: value.purchaseId, revision: 1 }, stepId(value.requestId, "discard"), input).catch(() => undefined);
      throw error;
    }
    const saved = await family(context, "consignment", { familyId: owner.id, purchaseId: value.purchaseId, branchId: value.branchId, mode: value.mode, returnBy: value.returnBy, note: value.note });
    refresh(context.cafe.slug);
    return { id: saved.id, financeId: posted.financeId };
  }, "تعذر تسجيل الاستلام");
}

export async function returnFamilyGoods(input: unknown, slug?: string) {
  return actionResult(async () => {
    const value = parse(returnFamilySchema, input);
    const context = await purchasesContext(slug);
    const current = await readFamilies(context.cafe.slug);
    if (!current.consignments.some(row => row.financeId === value.financeId)) throw new Error("الاستلام غير موجود أعد تحميل الصفحة");
    const saved = await purchase(context, "return", { invoiceId: value.financeId, accountId: value.accountId, expectedTotal: value.expectedTotal, lines: value.lines, note: value.note }, stepId(value.requestId, "return"), input);
    refresh(context.cafe.slug);
    return saved;
  }, "تعذر تسجيل الإرجاع");
}

export async function payFamily(input: unknown, slug?: string) {
  return actionResult(async () => {
    const value = parse(payFamilySchema, input);
    const context = await purchasesContext(slug);
    const current = await readFamilies(context.cafe.slug);
    const receipt = current.consignments.find(row => row.financeId === value.financeId);
    const owner = receipt && current.families.find(row => row.id === receipt.familyId);
    if (!receipt || !owner || owner.supplierId !== value.supplierId) throw new Error("الاستلام غير موجود أعد تحميل الصفحة");
    if (value.amount > receipt.outstanding + .001) throw new Error("المبلغ أكبر من المتبقي على هذا الاستلام");
    const saved = await purchase(context, "payment", { supplierId: value.supplierId, invoiceId: value.financeId, accountId: value.accountId, amount: value.amount, date: today(), note: value.note }, stepId(value.requestId, "payment"), input);
    refresh(context.cafe.slug);
    return saved;
  }, "تعذر تسجيل الدفعة");
}
