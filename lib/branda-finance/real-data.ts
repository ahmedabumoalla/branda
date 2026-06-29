import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import type {
  FinanceAccount,
  FinanceBranch,
  FinanceCashSessionSummary,
  FinanceCategory,
  FinanceCustomer,
  FinanceJournalEntrySummary,
  FinancePaymentMethod,
  FinancePaymentSummary,
  FinanceProduct,
  FinanceSalesInvoiceStatus,
  FinanceSalesInvoiceSummary,
  FinanceSupplier,
  FinanceTaxRate,
  FinanceWarehouse,
  FinanceWorkspaceData,
} from "@/lib/branda-finance/invoice-types";

type MenuCategoryRow = {
  id: string;
  name: string | null;
};

type MenuProductRow = {
  id: string;
  name: string | null;
  description: string | null;
  price: number | string | null;
  available: boolean | null;
  loyalty_points: number | string | null;
  category_id: string | null;
  legacy_category: string | null;
  image_url: string | null;
  image_gallery: unknown;
  media: unknown;
};

type BranchRow = {
  id: string;
  name: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
};

type FinanceCustomerRow = {
  id: string;
  customer_profile_id: string | null;
  name: string | null;
  country: string | null;
  vat_number: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  payment_terms: string | null;
  currency: string | null;
  status: string | null;
};

type FinanceSupplierRow = {
  id: string;
  name: string | null;
  vat_number: string | null;
  phone: string | null;
  email: string | null;
};

type FinanceWarehouseRow = {
  id: string;
  branch_id: string | null;
  name: string | null;
  city: string | null;
};

type FinanceAccountRow = {
  id: string;
  code: string | null;
  name: string | null;
};

type FinanceSalesInvoiceRow = {
  id: string;
  branch_id: string | null;
  customer_id: string | null;
  customer_profile_id: string | null;
  invoice_number: string | null;
  status: FinanceSalesInvoiceStatus | null;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number | string | null;
  discount_total: number | string | null;
  tax_total: number | string | null;
  total: number | string | null;
  amount_paid: number | string | null;
  amount_due: number | string | null;
  source: "branda_finance" | "cashier" | "import" | null;
  created_at: string | null;
};

type FinancePaymentRow = {
  id: string;
  invoice_id: string | null;
  customer_id: string | null;
  payment_method: "cash" | "card" | "transfer" | "credit" | "other" | null;
  amount: number | string | null;
  status: "recorded" | "void" | "refunded" | null;
  paid_at: string | null;
};

type FinanceCashSessionRow = {
  id: string;
  branch_id: string | null;
  status: "open" | "closed" | "reconciled" | null;
  opened_at: string | null;
  closed_at: string | null;
  opening_cash: number | string | null;
  closing_cash: number | string | null;
};

type FinanceJournalEntryRow = {
  id: string;
  branch_id: string | null;
  source_type: "manual" | "sales_invoice" | "payment" | "cash_session" | null;
  source_id: string | null;
  entry_date: string | null;
  status: "draft" | "posted" | "void" | null;
  memo: string | null;
  total_debit: number | string | null;
  total_credit: number | string | null;
};

const paymentMethods: FinancePaymentMethod[] = [
  { id: "cash", name: "كاش", ledgerHint: "يحفظ كدفعة نقدية" },
  { id: "card", name: "بطاقة", ledgerHint: "يحفظ كدفعة بطاقة" },
  { id: "mada", name: "مدى", ledgerHint: "يحفظ كدفعة بطاقة" },
  { id: "transfer", name: "تحويل", ledgerHint: "يحفظ كتحويل" },
  { id: "credit", name: "آجل", ledgerHint: "يبقي الرصيد مستحقًا" },
  { id: "unpaid", name: "غير مدفوعة", ledgerHint: "بدون دفعة" },
];

const taxRates: FinanceTaxRate[] = [
  { id: "vat-15", name: "VAT 15%", rate: 15 },
  { id: "vat-0", name: "VAT 0%", rate: 0 },
];

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function firstMediaUrl(row: MenuProductRow) {
  const mediaUrl = asArray<{ type?: string; url?: string | null }>(row.media).find(
    (item) => item.type === "image" && item.url,
  )?.url;
  const galleryUrl = asArray<{ imageDataUrl?: string | null; url?: string | null }>(row.image_gallery).find(
    (item) => item.imageDataUrl || item.url,
  );

  return row.image_url ?? mediaUrl ?? galleryUrl?.imageDataUrl ?? galleryUrl?.url ?? null;
}

function mapBranch(row: BranchRow): FinanceBranch {
  return {
    id: row.id,
    name: row.name ?? "فرع",
    displayName: row.name ?? "فرع",
    city: row.city ?? "",
    address: row.address ?? "",
    phone: row.phone ?? undefined,
  };
}

function mapFinanceCustomer(row: FinanceCustomerRow): FinanceCustomer {
  return {
    id: row.id,
    name: row.name ?? "عميل",
    country: row.country ?? "SA",
    vatRegistered: Boolean(row.vat_number),
    vatNumber: row.vat_number ?? undefined,
    city: row.city ?? "",
    address: row.address ?? "",
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    currency: "SAR",
    paymentTerms: row.payment_terms ?? "غير محدد",
  };
}

function mapProduct(row: MenuProductRow, categoryName?: string, revenueAccountId = ""): FinanceProduct {
  const reference = row.id.slice(0, 8).toUpperCase();
  const price = toNumber(row.price);

  return {
    id: row.id,
    name: row.name ?? "منتج",
    details: row.description ?? "منتج من القائمة",
    category: categoryName ?? row.legacy_category ?? "غير مصنف",
    sku: reference,
    barcode: reference,
    imageUrl: firstMediaUrl(row),
    price,
    vatRate: 15,
    stock: row.available === false ? 0 : 1,
    accountId: revenueAccountId,
    revenueRecognition: revenueAccountId ? "عند إصدار الفاتورة" : "غير مربوط بحساب إيراد بعد",
    loyaltyPointsEarned: toNumber(row.loyalty_points),
    loyaltyEarnEligible: toNumber(row.loyalty_points) > 0,
  };
}

function mapInvoice(
  row: FinanceSalesInvoiceRow,
  customersById: Map<string, FinanceCustomer>,
  branchesById: Map<string, FinanceBranch>,
): FinanceSalesInvoiceSummary {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    branchId: row.branch_id,
    branchName: row.branch_id ? branchesById.get(row.branch_id)?.displayName ?? null : null,
    customerId: row.customer_id,
    customerName: row.customer_id ? customersById.get(row.customer_id)?.name ?? null : null,
    status: row.status ?? "draft",
    issueDate: row.issue_date ?? "",
    dueDate: row.due_date,
    subtotal: toNumber(row.subtotal),
    discountTotal: toNumber(row.discount_total),
    taxTotal: toNumber(row.tax_total),
    total: toNumber(row.total),
    amountPaid: toNumber(row.amount_paid),
    amountDue: toNumber(row.amount_due),
    source: row.source ?? "branda_finance",
    createdAt: row.created_at ?? "",
  };
}

function preferredRevenueAccount(accounts: FinanceAccount[]) {
  return accounts.find((account) => account.code.startsWith("4"))?.id ?? accounts[0]?.id ?? "";
}

export async function getBrandaFinanceRealWorkspaceData(): Promise<FinanceWorkspaceData> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const [
    categoriesResult,
    productsResult,
    branchesResult,
    customersResult,
    suppliersResult,
    warehousesResult,
    accountsResult,
    invoicesResult,
    paymentsResult,
    cashSessionsResult,
    journalEntriesResult,
    invoiceSequencesResult,
    journalEntryLinesResult,
    auditEventsResult,
  ] = await Promise.all([
    supabase.from("menu_categories").select("id, name").eq("cafe_id", cafe.id).is("deleted_at", null).order("sort_order"),
    supabase
      .from("menu_products")
      .select("id, name, description, price, available, loyalty_points, category_id, legacy_category, image_url, image_gallery, media")
      .eq("cafe_id", cafe.id)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase.from("branches").select("id, name, city, address, phone").eq("cafe_id", cafe.id).is("deleted_at", null).order("sort_order"),
    supabase.from("finance_customers").select("*").eq("cafe_id", cafe.id).order("created_at", { ascending: false }),
    supabase.from("finance_suppliers").select("id, name, vat_number, phone, email").eq("cafe_id", cafe.id).order("created_at", { ascending: false }),
    supabase.from("finance_warehouses").select("id, branch_id, name, city").eq("cafe_id", cafe.id).order("created_at", { ascending: false }),
    supabase.from("finance_accounts").select("id, code, name").eq("cafe_id", cafe.id).eq("is_active", true).order("code"),
    supabase
      .from("finance_sales_invoices")
      .select("*")
      .eq("cafe_id", cafe.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("finance_payments").select("id, invoice_id, customer_id, payment_method, amount, status, paid_at").eq("cafe_id", cafe.id).order("paid_at", { ascending: false }).limit(100),
    supabase.from("finance_cash_sessions").select("id, branch_id, status, opened_at, closed_at, opening_cash, closing_cash").eq("cafe_id", cafe.id).order("opened_at", { ascending: false }).limit(20),
    supabase.from("finance_journal_entries").select("id, branch_id, source_type, source_id, entry_date, status, memo, total_debit, total_credit").eq("cafe_id", cafe.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("finance_invoice_sequences").select("id", { count: "exact", head: true }).eq("cafe_id", cafe.id),
    supabase.from("finance_journal_entry_lines").select("id", { count: "exact", head: true }).eq("cafe_id", cafe.id),
    supabase.from("finance_audit_events").select("id", { count: "exact", head: true }).eq("cafe_id", cafe.id),
  ]);

  const firstError = [
    categoriesResult.error,
    productsResult.error,
    branchesResult.error,
    customersResult.error,
    suppliersResult.error,
    warehousesResult.error,
    accountsResult.error,
    invoicesResult.error,
    paymentsResult.error,
    cashSessionsResult.error,
    journalEntriesResult.error,
    invoiceSequencesResult.error,
    journalEntryLinesResult.error,
    auditEventsResult.error,
  ].find(Boolean);

  if (firstError) throw firstError;

  const categoryRows = (categoriesResult.data ?? []) as MenuCategoryRow[];
  const categoryMap = new Map(categoryRows.map((category) => [category.id, category.name ?? "غير مصنف"]));
  const categories: FinanceCategory[] = categoryRows.map((category) => ({
    id: category.id,
    name: category.name ?? "غير مصنف",
  }));

  const branches = ((branchesResult.data ?? []) as BranchRow[]).map(mapBranch);
  const branchesById = new Map(branches.map((branch) => [branch.id, branch]));
  const customers = ((customersResult.data ?? []) as FinanceCustomerRow[]).map(mapFinanceCustomer);
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const accounts = ((accountsResult.data ?? []) as FinanceAccountRow[]).map((row) => ({
    id: row.id,
    code: row.code ?? "",
    name: row.name ?? "حساب",
  }));
  const revenueAccountId = preferredRevenueAccount(accounts);

  return {
    branches,
    warehouses: ((warehousesResult.data ?? []) as FinanceWarehouseRow[]).map((row) => ({
      id: row.id,
      name: row.name ?? "مستودع",
      branchId: row.branch_id ?? undefined,
      city: row.city ?? "",
    })),
    customers,
    suppliers: ((suppliersResult.data ?? []) as FinanceSupplierRow[]).map((row) => ({
      id: row.id,
      name: row.name ?? "مورد",
      vatNumber: row.vat_number ?? undefined,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
    })),
    products: ((productsResult.data ?? []) as MenuProductRow[]).map((product) =>
      mapProduct(product, product.category_id ? categoryMap.get(product.category_id) : undefined, revenueAccountId),
    ),
    categories,
    accounts,
    salesInvoices: ((invoicesResult.data ?? []) as FinanceSalesInvoiceRow[]).map((invoice) =>
      mapInvoice(invoice, customersById, branchesById),
    ),
    payments: ((paymentsResult.data ?? []) as FinancePaymentRow[]).map((row): FinancePaymentSummary => ({
      id: row.id,
      invoiceId: row.invoice_id,
      customerId: row.customer_id,
      paymentMethod: row.payment_method ?? "other",
      amount: toNumber(row.amount),
      status: row.status ?? "recorded",
      paidAt: row.paid_at ?? "",
    })),
    cashSessions: ((cashSessionsResult.data ?? []) as FinanceCashSessionRow[]).map((row): FinanceCashSessionSummary => ({
      id: row.id,
      branchId: row.branch_id,
      status: row.status ?? "open",
      openedAt: row.opened_at ?? "",
      closedAt: row.closed_at,
      openingCash: toNumber(row.opening_cash),
      closingCash: row.closing_cash == null ? null : toNumber(row.closing_cash),
    })),
    journalEntries: ((journalEntriesResult.data ?? []) as FinanceJournalEntryRow[]).map((row): FinanceJournalEntrySummary => ({
      id: row.id,
      branchId: row.branch_id,
      sourceType: row.source_type ?? "manual",
      sourceId: row.source_id,
      entryDate: row.entry_date ?? "",
      status: row.status ?? "draft",
      memo: row.memo,
      totalDebit: toNumber(row.total_debit),
      totalCredit: toNumber(row.total_credit),
    })),
    invoiceSequenceCount: invoiceSequencesResult.count ?? 0,
    journalEntryLineCount: journalEntryLinesResult.count ?? 0,
    auditEventCount: auditEventsResult.count ?? 0,
    taxRates,
    paymentMethods,
    customFields: [],
    dataSourceNotes: [
      "العملاء والموردون والمستودعات والحسابات والفواتير والمدفوعات تقرأ الآن من جداول Branda Finance في Supabase.",
      "المنتجات والتصنيفات تقرأ من قائمة العلامة لأنها مصدر المنتجات التشغيلي الحالي.",
      "عند عدم وجود سجلات في الجداول المالية تظهر الواجهات بحالة فارغة بدون بيانات تجريبية.",
    ],
  };
}
