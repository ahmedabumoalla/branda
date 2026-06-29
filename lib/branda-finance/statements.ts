import type { ReactNode } from "react";
import { formatFinanceAmount } from "@/components/branda-finance/invoice-totals";
import { getBrandaFinanceRealWorkspaceData } from "@/lib/branda-finance/real-data";

export type FinanceStatementEntityType = "customer" | "supplier" | "product" | "service";

export type FinanceStatementSummary = {
  openingBalance: number;
  debit: number;
  credit: number;
  netMovement: number;
  closingBalance: number;
};

export type FinanceStatement = {
  entityType: FinanceStatementEntityType;
  entityId: string;
  title: string;
  description: string;
  summary: FinanceStatementSummary;
  headers: string[];
  rows: ReactNode[][];
  minWidth?: string;
};

function buildSummary(openingBalance: number, debit: number, credit: number): FinanceStatementSummary {
  const netMovement = debit - credit;
  return {
    openingBalance,
    debit,
    credit,
    netMovement,
    closingBalance: openingBalance + netMovement,
  };
}

export async function getStatementEntities() {
  const data = await getBrandaFinanceRealWorkspaceData();
  return [
    ...data.customers.map((customer) => ({ type: "customer" as const, id: customer.id, title: customer.name, detail: customer.paymentTerms })),
    ...data.suppliers.map((supplier) => ({ type: "supplier" as const, id: supplier.id, title: supplier.name, detail: supplier.vatNumber ?? "مورد" })),
    ...data.products.map((product) => ({ type: "product" as const, id: product.id, title: product.name, detail: product.sku })),
  ];
}

export async function getFinanceStatement(entityType: FinanceStatementEntityType, entityId: string): Promise<FinanceStatement | null> {
  const data = await getBrandaFinanceRealWorkspaceData();

  if (entityType === "customer") {
    const customer = data.customers.find((item) => item.id === entityId);
    if (!customer) return null;
    const invoices = data.salesInvoices.filter((invoice) => invoice.customerId === entityId);
    const debit = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
    const credit = invoices.reduce((sum, invoice) => sum + invoice.amountPaid, 0);
    let balance = 0;

    return {
      entityType,
      entityId,
      title: `كشف حساب ${customer.name}`,
      description: "حركة العميل حسب فواتير المبيعات والمدفوعات المحفوظة في Supabase.",
      summary: buildSummary(0, debit, credit),
      headers: ["التاريخ", "المرجع", "المستند", "الوصف", "مدين", "دائن", "الرصيد", "الفرع"],
      rows: invoices.map((invoice) => {
        balance += invoice.total - invoice.amountPaid;
        return [
          invoice.issueDate,
          invoice.invoiceNumber ?? invoice.id.slice(0, 8),
          "فاتورة مبيعات",
          customer.name,
          formatFinanceAmount(invoice.total),
          formatFinanceAmount(invoice.amountPaid),
          formatFinanceAmount(balance),
          invoice.branchName ?? "",
        ];
      }),
      minWidth: "980px",
    };
  }

  if (entityType === "supplier") {
    const supplier = data.suppliers.find((item) => item.id === entityId);
    if (!supplier) return null;
    return {
      entityType,
      entityId,
      title: `كشف حساب ${supplier.name}`,
      description: "لا توجد فواتير مشتريات ضمن migration الحالي، لذلك يظهر الكشف بدون حركات.",
      summary: buildSummary(0, 0, 0),
      headers: ["التاريخ", "المرجع", "المستند", "الوصف", "مدين", "دائن", "الرصيد"],
      rows: [],
      minWidth: "860px",
    };
  }

  const product = data.products.find((item) => item.id === entityId);
  if (!product) return null;
  const invoices = data.salesInvoices;
  const revenue = invoices.reduce((sum, invoice) => sum + invoice.total, 0);

  return {
    entityType,
    entityId,
    title: `كشف منتج ${product.name}`,
    description: "يعرض المنتج الحقيقي من القائمة. بنود الفواتير التفصيلية تحفظ في finance_sales_invoice_items، ولا يتم عرضها في هذا الكشف المختصر بعد.",
    summary: buildSummary(0, revenue, 0),
    headers: ["المنتج", "التصنيف", "SKU", "المخزون", "السعر"],
    rows: [[product.name, product.category, product.sku, product.stock, formatFinanceAmount(product.price)]],
    minWidth: "760px",
  };
}
