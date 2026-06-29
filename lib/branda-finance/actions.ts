"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";

const paymentMethodSchema = z.enum(["unpaid", "cash", "card", "mada", "transfer", "credit", "loyalty_points"]);

const salesInvoiceItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1),
  quantity: z.number().positive(),
  price: z.number().min(0),
  discount: z.number().min(0).default(0),
  taxRate: z.number().min(0).default(15),
  accountId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
});

const salesInvoiceInputSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  issueDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  discount: z.number().min(0).default(0),
  amountPaid: z.number().min(0).default(0),
  paymentMethod: paymentMethodSchema.default("unpaid"),
  source: z.enum(["branda_finance", "cashier", "import"]).default("branda_finance"),
  notes: z.string().optional().nullable(),
  items: z.array(salesInvoiceItemSchema).min(1),
});

export type SaveSalesInvoiceInput = z.infer<typeof salesInvoiceInputSchema>;

export type SaveSalesInvoiceActionResult =
  | {
      success: true;
      invoiceId: string;
      invoiceNumber: string | null;
      message: string;
    }
  | {
      success: false;
      message: string;
    };

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculatePayloadTotals(input: SaveSalesInvoiceInput) {
  const subtotal = roundMoney(input.items.reduce((sum, item) => sum + item.quantity * item.price, 0));
  const itemDiscount = roundMoney(
    input.items.reduce((sum, item) => sum + Math.min(item.discount, item.quantity * item.price), 0),
  );
  const invoiceDiscount = roundMoney(Math.min(input.discount, Math.max(0, subtotal - itemDiscount)));
  const discountRatioBase = Math.max(0, subtotal - itemDiscount);
  const taxBaseAfterInvoiceDiscount = Math.max(0, discountRatioBase - invoiceDiscount);
  const rawTax = input.items.reduce((sum, item) => {
    const lineSubtotal = item.quantity * item.price;
    const lineDiscount = Math.min(item.discount, lineSubtotal);
    return sum + Math.max(0, lineSubtotal - lineDiscount) * (item.taxRate / 100);
  }, 0);
  const taxTotal = roundMoney(discountRatioBase > 0 ? rawTax * (taxBaseAfterInvoiceDiscount / discountRatioBase) : 0);
  const total = roundMoney(taxBaseAfterInvoiceDiscount + taxTotal);
  const amountPaid = roundMoney(Math.min(input.amountPaid, total));

  return {
    subtotal,
    discountTotal: roundMoney(itemDiscount + invoiceDiscount),
    taxTotal,
    total,
    amountPaid,
    amountDue: roundMoney(Math.max(0, total - amountPaid)),
  };
}

function statusForInvoice(input: SaveSalesInvoiceInput, mode: "draft" | "approved") {
  if (mode === "draft") return "draft";
  const totals = calculatePayloadTotals(input);
  if (totals.amountPaid >= totals.total && totals.total > 0) return "paid";
  if (totals.amountPaid > 0) return "partially_paid";
  return "unpaid";
}

function normalizePaymentMethod(method: z.infer<typeof paymentMethodSchema>) {
  if (method === "mada") return "card";
  if (method === "loyalty_points") return "other";
  if (method === "unpaid") return "other";
  return method;
}

async function nextInvoiceNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cafeId: string,
  branchId: string | null,
  issueDate: string,
) {
  const fiscalYear = new Date(issueDate).getFullYear();
  if (!Number.isFinite(fiscalYear)) return null;

  const baseQuery = supabase
    .from("finance_invoice_sequences")
    .select("id, prefix, next_number")
    .eq("cafe_id", cafeId)
    .eq("fiscal_year", fiscalYear);
  const { data: existing, error: existingError } = branchId
    ? await baseQuery.eq("branch_id", branchId).maybeSingle()
    : await baseQuery.is("branch_id", null).maybeSingle();

  if (existingError) return null;

  if (!existing) {
    const { data: created, error: createError } = await supabase
      .from("finance_invoice_sequences")
      .insert({
        cafe_id: cafeId,
        branch_id: branchId,
        fiscal_year: fiscalYear,
        prefix: "INV",
        next_number: 2,
      })
      .select("prefix")
      .single();

    if (createError) return null;
    return `${created.prefix}-${fiscalYear}-000001`;
  }

  const nextNumber = Number(existing.next_number ?? 1);
  const { error: updateError } = await supabase
    .from("finance_invoice_sequences")
    .update({ next_number: nextNumber + 1 })
    .eq("id", existing.id);

  if (updateError) return null;
  return `${existing.prefix}-${fiscalYear}-${String(nextNumber).padStart(6, "0")}`;
}

async function writeAuditEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cafeId: string,
  invoiceId: string,
  action: "create" | "approve",
  payload: Record<string, unknown>,
) {
  await supabase
    .from("finance_audit_events")
    .insert({
      cafe_id: cafeId,
      entity_table: "finance_sales_invoices",
      entity_id: invoiceId,
      action,
      payload,
    });
}

async function saveSalesInvoice(input: SaveSalesInvoiceInput, mode: "draft" | "approved") {
  const parsed = salesInvoiceInputSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const totals = calculatePayloadTotals(parsed);
  const branchId = parsed.branchId ?? null;
  const customerId = parsed.customerId ?? null;
  const invoiceNumber = mode === "approved" ? await nextInvoiceNumber(supabase, cafe.id, branchId, parsed.issueDate) : null;
  const status = statusForInvoice(parsed, mode);

  const { data: invoice, error: invoiceError } = await supabase
    .from("finance_sales_invoices")
    .insert({
      cafe_id: cafe.id,
      branch_id: branchId,
      customer_id: customerId,
      invoice_number: invoiceNumber,
      status,
      issue_date: parsed.issueDate,
      due_date: parsed.dueDate || null,
      currency: "SAR",
      subtotal: totals.subtotal,
      discount_total: totals.discountTotal,
      tax_total: totals.taxTotal,
      total: totals.total,
      amount_paid: totals.amountPaid,
      amount_due: totals.amountDue,
      notes: parsed.notes || null,
      source: parsed.source,
    })
    .select("id, invoice_number")
    .single();

  if (invoiceError) throw invoiceError;

  const itemRows = parsed.items.map((item) => {
    const lineSubtotal = item.quantity * item.price;
    const lineDiscount = roundMoney(Math.min(item.discount, lineSubtotal));
    const taxable = Math.max(0, lineSubtotal - lineDiscount);
    const taxTotal = roundMoney(taxable * (item.taxRate / 100));

    return {
      cafe_id: cafe.id,
      invoice_id: invoice.id,
      menu_product_id: item.productId || null,
      warehouse_id: item.warehouseId || null,
      account_id: item.accountId || null,
      product_name: item.description,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.price,
      discount_total: lineDiscount,
      tax_rate: item.taxRate,
      tax_total: taxTotal,
      line_total: roundMoney(taxable + taxTotal),
    };
  });

  const { error: itemsError } = await supabase.from("finance_sales_invoice_items").insert(itemRows);
  if (itemsError) throw itemsError;

  if (totals.amountPaid > 0 && !["unpaid", "credit"].includes(parsed.paymentMethod)) {
    const { error: paymentError } = await supabase.from("finance_payments").insert({
      cafe_id: cafe.id,
      branch_id: branchId,
      invoice_id: invoice.id,
      customer_id: customerId,
      payment_method: normalizePaymentMethod(parsed.paymentMethod),
      amount: totals.amountPaid,
      currency: "SAR",
      status: "recorded",
    });

    if (paymentError) throw paymentError;
  }

  await writeAuditEvent(supabase, cafe.id, invoice.id, mode === "approved" ? "approve" : "create", {
    status,
    source: parsed.source,
    total: totals.total,
  });

  revalidatePath("/dashboard/branda-finance/sales");
  revalidatePath("/dashboard/branda-finance/invoicing");
  revalidatePath("/dashboard/branda-finance/invoicing/create");

  return {
    success: true,
    invoiceId: invoice.id as string,
    invoiceNumber: (invoice.invoice_number as string | null) ?? invoiceNumber,
    message: mode === "draft" ? "تم حفظ مسودة الفاتورة في قاعدة البيانات" : "تم حفظ فاتورة المبيعات في قاعدة البيانات",
  } satisfies SaveSalesInvoiceActionResult;
}

export async function saveSalesInvoiceDraftAction(input: SaveSalesInvoiceInput): Promise<SaveSalesInvoiceActionResult> {
  try {
    return await saveSalesInvoice(input, "draft");
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "تعذر حفظ مسودة الفاتورة",
    };
  }
}

export async function approveSalesInvoiceAction(input: SaveSalesInvoiceInput): Promise<SaveSalesInvoiceActionResult> {
  try {
    return await saveSalesInvoice(input, "approved");
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "تعذر حفظ فاتورة المبيعات",
    };
  }
}

export async function createCashierInvoiceAction(input: SaveSalesInvoiceInput): Promise<SaveSalesInvoiceActionResult> {
  try {
    return await saveSalesInvoice({ ...input, source: "cashier" }, "approved");
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "تعذر إنشاء فاتورة الكاشير",
    };
  }
}

export async function recordFinancePaymentAction(input: {
  invoiceId: string;
  customerId?: string | null;
  branchId?: string | null;
  amount: number;
  paymentMethod: "cash" | "card" | "mada" | "transfer" | "credit" | "loyalty_points";
}): Promise<SaveSalesInvoiceActionResult> {
  try {
    const cafe = await requireOwnerCafeContext();
    const supabase = await createClient();
    const parsed = z
      .object({
        invoiceId: z.string().uuid(),
        customerId: z.string().uuid().optional().nullable(),
        branchId: z.string().uuid().optional().nullable(),
        amount: z.number().positive(),
        paymentMethod: paymentMethodSchema.exclude(["unpaid"]),
      })
      .parse(input);

    const { error } = await supabase.from("finance_payments").insert({
      cafe_id: cafe.id,
      branch_id: parsed.branchId ?? null,
      invoice_id: parsed.invoiceId,
      customer_id: parsed.customerId ?? null,
      payment_method: normalizePaymentMethod(parsed.paymentMethod),
      amount: roundMoney(parsed.amount),
      currency: "SAR",
      status: "recorded",
    });

    if (error) throw error;

    revalidatePath("/dashboard/branda-finance/sales");
    revalidatePath("/dashboard/branda-finance/invoicing");

    return {
      success: true,
      invoiceId: parsed.invoiceId,
      invoiceNumber: null,
      message: "تم تسجيل الدفعة في قاعدة البيانات",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "تعذر تسجيل الدفعة",
    };
  }
}
