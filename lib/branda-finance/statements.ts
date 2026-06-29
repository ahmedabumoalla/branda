import type { ReactNode } from "react";
import { calculateDemoInvoice, financeAmount } from "@/lib/branda-finance/calculations";
import { getBrandaFinanceDemoData } from "@/lib/branda-finance/demo-data";

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

export function getStatementEntities() {
  const data = getBrandaFinanceDemoData();
  return [
    ...data.customers.map((customer) => ({ type: "customer" as const, id: customer.id, title: customer.name, detail: customer.paymentTerms })),
    ...data.suppliers.map((supplier) => ({ type: "supplier" as const, id: supplier.id, title: supplier.name, detail: supplier.vatNumber ?? "مورد" })),
    ...data.products.map((product) => ({ type: "product" as const, id: product.id, title: product.name, detail: product.sku })),
    ...data.services.map((service) => ({ type: "service" as const, id: service.id, title: service.name, detail: service.sku })),
  ];
}

export function getFinanceStatement(entityType: FinanceStatementEntityType, entityId: string): FinanceStatement | null {
  const data = getBrandaFinanceDemoData();
  const branchesById = new Map(data.branches.map((branch) => [branch.id, branch.displayName || branch.name]));
  const costCenter = data.costCenters[0]?.name ?? "تشغيل الفرع";

  if (entityType === "customer") {
    const customer = data.customers.find((item) => item.id === entityId);
    if (!customer) return null;
    const invoices = data.invoices.filter((invoice) => invoice.customerId === entityId);
    const totals = invoices.map((invoice) => ({ invoice, total: calculateDemoInvoice(invoice) }));
    const debit = totals.reduce((sum, item) => sum + item.total.total, 0);
    const credit = totals.reduce((sum, item) => sum + item.total.paidAmount, 0);
    let balance = 0;
    return {
      entityType,
      entityId,
      title: `كشف حساب ${customer.name}`,
      description: "حركة العميل حسب الفواتير والتحصيلات مع الرصيد الجاري.",
      summary: buildSummary(0, debit, credit),
      headers: ["التاريخ", "المرجع", "المستند", "الوصف", "مدين", "دائن", "الرصيد", "الفرع", "مركز التكلفة"],
      rows: totals.map(({ invoice, total }) => {
        balance += total.total - total.paidAmount;
        return [invoice.issueDate, invoice.number, "فاتورة مبيعات", customer.name, financeAmount(total.total), financeAmount(total.paidAmount), financeAmount(balance), branchesById.get(invoice.branchId) ?? "فرع", costCenter];
      }),
      minWidth: "1060px",
    };
  }

  if (entityType === "supplier") {
    const supplier = data.suppliers.find((item) => item.id === entityId);
    if (!supplier) return null;
    const invoices = data.purchaseInvoices.filter((invoice) => invoice.supplierId === entityId);
    const debit = invoices.reduce((sum, invoice) => sum + (invoice.status.includes("مسددة") ? invoice.subtotal + invoice.vat : 0), 0);
    const credit = invoices.reduce((sum, invoice) => sum + invoice.subtotal + invoice.vat, 0);
    let balance = 0;
    return {
      entityType,
      entityId,
      title: `كشف حساب ${supplier.name}`,
      description: "حركة المورد حسب فواتير الشراء والمدفوعات المحلية.",
      summary: buildSummary(0, debit, credit),
      headers: ["التاريخ", "المرجع", "المستند", "الوصف", "مدين", "دائن", "الرصيد", "الفرع", "مركز التكلفة"],
      rows: invoices.map((invoice) => {
        const amount = invoice.subtotal + invoice.vat;
        balance += amount;
        return [invoice.issueDate, invoice.number, "فاتورة مشتريات", supplier.name, financeAmount(0), financeAmount(amount), financeAmount(balance), "المشتريات", costCenter];
      }),
      minWidth: "1060px",
    };
  }

  const product = data.products.find((item) => item.id === entityId);
  if (!product) return null;
  const movements = data.stockMovements.filter((movement) => movement.productId === entityId);
  const salesLines = data.invoices.flatMap((invoice) =>
    invoice.items.filter((item) => item.productId === entityId).map((item) => ({ invoice, item })),
  );
  const revenue = salesLines.reduce((sum, line) => sum + line.item.quantity * line.item.price, 0);
  const cost = revenue * 0.42;
  let stockBalance = product.stock;
  const quantityIn = movements.filter((movement) => movement.quantity > 0).reduce((sum, movement) => sum + movement.quantity, 0);
  const quantityOut = Math.abs(movements.filter((movement) => movement.quantity < 0).reduce((sum, movement) => sum + movement.quantity, 0));

  return {
    entityType,
    entityId,
    title: `${entityType === "service" ? "كشف خدمة" : "كشف منتج"} ${product.name}`,
    description: "حركة كمية وقيمة للمنتج أو الخدمة مع الإيراد والتكلفة والهامش.",
    summary: buildSummary(product.stock * (product.cost ?? product.price * 0.42), revenue, cost),
    headers: ["التاريخ", "المرجع", "المستند", "الوصف", "كمية داخلة", "كمية خارجة", "رصيد المخزون", "الإيراد", "التكلفة", "الهامش", "الفرع", "مركز التكلفة"],
    rows: movements.map((movement) => {
      stockBalance += movement.quantity;
      const lineRevenue = movement.quantity < 0 ? Math.abs(movement.quantity) * product.price : 0;
      const lineCost = lineRevenue * 0.42;
      return [
        movement.date,
        movement.id,
        movement.type,
        product.name,
        movement.quantity > 0 ? movement.quantity : 0,
        movement.quantity < 0 ? Math.abs(movement.quantity) : 0,
        stockBalance,
        financeAmount(lineRevenue),
        financeAmount(lineCost),
        financeAmount(lineRevenue - lineCost),
        data.warehouses.find((warehouse) => warehouse.id === movement.warehouseId)?.name ?? "مستودع",
        costCenter,
      ];
    }).concat([[new Date().toISOString().slice(0, 10), "SUMMARY", "ملخص", product.name, quantityIn, quantityOut, stockBalance, financeAmount(revenue), financeAmount(cost), financeAmount(revenue - cost), "كل الفروع", costCenter]]),
    minWidth: "1320px",
  };
}

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
