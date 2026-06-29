import type { ReactNode } from "react";
import { FinanceReportPage } from "@/components/branda-finance/finance-report-page";
import { FinanceReportTable } from "@/components/branda-finance/finance-report-table";
import { FinanceStatusBadge } from "@/components/branda-finance/finance-status-badge";
import { calculateDemoInvoice, financeAmount } from "@/lib/branda-finance/calculations";
import { getBrandaFinanceDemoData } from "@/lib/branda-finance/demo-data";

export type StandardReportKind =
  | "trial-balance"
  | "statement-account"
  | "general-ledger"
  | "cash-flow"
  | "bank-reconciliation"
  | "profit-loss"
  | "tax"
  | "sales"
  | "purchases"
  | "inventory"
  | "branches"
  | "products";

type ReportSection = {
  title: string;
  description?: string;
  headers: string[];
  rows: ReactNode[][];
  minWidth?: string;
};

type ReportConfig = {
  title: string;
  description: string;
  filters: string[];
  kpis: Array<{ label: string; value: string; hint?: string; tone?: "green" | "gold" | "red" | "brown" }>;
  sections: ReportSection[];
  notes?: string[];
};

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function lineSalesTotal(quantity: number, price: number, discount: number, taxRate: number) {
  const taxable = Math.max(0, quantity * price - discount);
  return taxable + taxable * (taxRate / 100);
}

function buildReport(kind: StandardReportKind): ReportConfig {
  const data = getBrandaFinanceDemoData();
  const invoiceTotals = data.invoices.map((invoice) => ({ invoice, totals: calculateDemoInvoice(invoice) }));
  const salesTotal = sum(invoiceTotals.map((entry) => entry.totals.total));
  const receivable = sum(invoiceTotals.map((entry) => entry.totals.remainingBalance));
  const salesVat = sum(invoiceTotals.map((entry) => entry.totals.vat));
  const purchaseTotal = sum(data.purchaseInvoices.map((invoice) => invoice.subtotal + invoice.vat));
  const purchaseVat = sum(data.purchaseInvoices.map((invoice) => invoice.vat));
  const cashTotal = sum(data.cashBoxes.map((box) => box.balance));
  const bankTotal = sum(data.bankAccounts.map((account) => account.balance));
  const inventoryValue = sum(data.products.map((product) => product.stock * product.price * 0.42));
  const operatingExpenses = sum(data.costCenters.map((center) => center.actual)) * 0.18;
  const estimatedCost = salesTotal * 0.42;
  const grossProfit = salesTotal - estimatedCost;
  const netProfit = grossProfit - operatingExpenses;
  const branchSales = data.branches.map((branch, index) => ({
    branch,
    sales: Math.max(0, salesTotal * (index === 0 ? 0.64 : 0.36)),
    cash: data.cashBoxes[index]?.balance ?? 0,
    warehouse: data.warehouses[index]?.name ?? data.warehouses[0]?.name ?? "المستودع",
  }));
  const productSales = data.products.map((product) => {
    const quantity = sum(
      data.invoices.flatMap((invoice) => invoice.items.filter((item) => item.productId === product.id).map((item) => item.quantity)),
    );
    const revenue = sum(
      data.invoices.flatMap((invoice) =>
        invoice.items
          .filter((item) => item.productId === product.id)
          .map((item) => lineSalesTotal(item.quantity, item.price, item.discount, item.taxRate)),
      ),
    );
    return { product, quantity, revenue, margin: revenue > 0 ? revenue * 0.58 : product.price * product.stock * 0.08 };
  });

  const commonFilters = ["الفترة: يونيو 2026", "العملة: SAR", "مصدر البيانات: ديمو محلي"];

  if (kind === "trial-balance") {
    const debitBase = cashTotal + bankTotal + receivable + inventoryValue + operatingExpenses + estimatedCost;
    const creditBase = salesTotal + salesVat + purchaseTotal;
    const equity = Math.max(0, debitBase - creditBase);
    const rows = [
      ["1001", "الصندوق", "أصول متداولة", financeAmount(cashTotal), financeAmount(0)],
      ["1002", "الحساب البنكي", "أصول متداولة", financeAmount(bankTotal), financeAmount(0)],
      ["1103", "الذمم المدينة", "أصول متداولة", financeAmount(receivable), financeAmount(0)],
      ["1301", "المخزون", "أصول", financeAmount(inventoryValue), financeAmount(0)],
      ["2101", "الذمم الدائنة", "التزامات", financeAmount(0), financeAmount(purchaseTotal)],
      ["2205", "ضريبة القيمة المضافة", "التزامات", financeAmount(0), financeAmount(salesVat)],
      ["3101", "رأس المال المحلي", "حقوق ملكية", financeAmount(0), financeAmount(equity)],
      ["4101", "إيرادات المبيعات", "إيرادات", financeAmount(0), financeAmount(salesTotal)],
      ["5101", "تكلفة البضاعة المباعة", "مصروفات", financeAmount(estimatedCost), financeAmount(0)],
      ["6101", "مصروفات تشغيلية", "مصروفات", financeAmount(operatingExpenses), financeAmount(0)],
    ];

    return {
      title: "ميزان المراجعة",
      description: "عرض أرصدة الحسابات المدينة والدائنة داخل إطار واسع ومنظم بدون تمدد خارج صفحة لوحة التحكم.",
      filters: [...commonFilters, "النطاق: كل الفروع"],
      kpis: [
        { label: "إجمالي المدين", value: financeAmount(debitBase), hint: "متوازن مع الدائن", tone: "green" },
        { label: "إجمالي الدائن", value: financeAmount(creditBase + equity), hint: "بعد حقوق الملكية", tone: "green" },
        { label: "عدد الحسابات", value: String(rows.length), hint: "حسابات ديمو", tone: "brown" },
        { label: "فرق الميزان", value: financeAmount(0), hint: "لا يوجد فرق", tone: "gold" },
      ],
      sections: [{ title: "أرصدة الحسابات", headers: ["الكود", "الحساب", "التصنيف", "مدين", "دائن"], rows }],
      notes: ["كل الأرقام محلية للعرض فقط ولا يوجد ترحيل محاسبي أو كتابة قاعدة بيانات."],
    };
  }

  if (kind === "statement-account") {
    const customer = data.customers[0];
    const rows = invoiceTotals.map(({ invoice, totals }) => [
      invoice.issueDate,
      invoice.number,
      data.customers.find((item) => item.id === invoice.customerId)?.name ?? customer?.name ?? "عميل",
      financeAmount(totals.total),
      financeAmount(totals.paidAmount),
      financeAmount(totals.remainingBalance),
    ]);

    return {
      title: "كشف الحساب",
      description: "حركة حساب عميل أو مورد مع الرصيد الافتتاحي والحركات والرصيد الختامي داخل جدول محصور.",
      filters: [...commonFilters, `الحساب: ${customer?.name ?? "عميل للمعاينة"}`],
      kpis: [
        { label: "الرصيد الافتتاحي", value: financeAmount(0), tone: "brown" },
        { label: "الحركات المدينة", value: financeAmount(salesTotal), tone: "green" },
        { label: "التحصيل", value: financeAmount(salesTotal - receivable), tone: "gold" },
        { label: "الرصيد الختامي", value: financeAmount(receivable), tone: "red" },
      ],
      sections: [{ title: "حركات الحساب", headers: ["التاريخ", "المستند", "الطرف", "مدين", "دائن", "الرصيد"], rows }],
      notes: ["يمكن استخدام نفس التصميم لكشف عميل أو مورد حسب مسار التقرير المطلوب."],
    };
  }

  if (kind === "general-ledger") {
    const rows = data.journalEntries.flatMap((entry) =>
      entry.lines.map((line) => [entry.date, entry.source, line.accountCode, line.accountName, financeAmount(line.debit), financeAmount(line.credit), entry.memo]),
    );

    return {
      title: "دفتر الأستاذ العام",
      description: "تفاصيل القيود المحاسبية حسب الحساب والمصدر مع أعمدة ثابتة قابلة للتمرير داخل البطاقة.",
      filters: [...commonFilters, "الحساب: كل الحسابات"],
      kpis: [
        { label: "عدد القيود", value: String(data.journalEntries.length), tone: "brown" },
        { label: "إجمالي المدين", value: financeAmount(sum(data.journalEntries.flatMap((entry) => entry.lines.map((line) => line.debit)))), tone: "green" },
        { label: "إجمالي الدائن", value: financeAmount(sum(data.journalEntries.flatMap((entry) => entry.lines.map((line) => line.credit)))), tone: "green" },
        { label: "المصادر", value: String(new Set(data.journalEntries.map((entry) => entry.source)).size), hint: "فواتير ديمو", tone: "gold" },
      ],
      sections: [{ title: "حركات دفتر الأستاذ", headers: ["التاريخ", "المصدر", "الكود", "الحساب", "مدين", "دائن", "البيان"], rows, minWidth: "980px" }],
      notes: ["التقرير يعرض قيود معاينة فقط ولا ينفذ ترحيلاً حقيقياً."],
    };
  }

  if (kind === "cash-flow") {
    const rows = [
      ["تشغيلي", "تحصيل مبيعات", financeAmount(salesTotal - receivable), "داخل"],
      ["تشغيلي", "مدفوعات موردين", financeAmount(-purchaseTotal), "خارج"],
      ["تشغيلي", "مصروفات تشغيلية", financeAmount(-operatingExpenses), "خارج"],
      ["ضريبي", "ضريبة مخرجات", financeAmount(salesVat), "داخل"],
      ["ضريبي", "ضريبة مدخلات", financeAmount(-purchaseVat), "خارج"],
      ["النقد المتاح", "الصندوق والبنك", financeAmount(cashTotal + bankTotal), "رصيد"],
    ];

    return {
      title: "التدفق النقدي",
      description: "مصادر واستخدامات النقد حسب النشاط مع إبقاء التفاصيل داخل مساحة التقرير.",
      filters: [...commonFilters, "الطريقة: مباشرة"],
      kpis: [
        { label: "النقد المتاح", value: financeAmount(cashTotal + bankTotal), tone: "green" },
        { label: "تحصيل المبيعات", value: financeAmount(salesTotal - receivable), tone: "gold" },
        { label: "المدفوعات", value: financeAmount(purchaseTotal + operatingExpenses), tone: "brown" },
        { label: "صافي الفترة", value: financeAmount(salesTotal - receivable - purchaseTotal - operatingExpenses), tone: "green" },
      ],
      sections: [{ title: "بنود التدفق النقدي", headers: ["النشاط", "البند", "القيمة", "الاتجاه"], rows }],
    };
  }

  if (kind === "bank-reconciliation") {
    const bookBalances = data.bankAccounts.map((account, index) => account.balance - (index + 1) * 850);
    const rows = data.bankAccounts.map((account, index) => {
      const bookBalance = bookBalances[index] ?? account.balance;
      return [account.name, account.iban, financeAmount(account.balance), financeAmount(bookBalance), financeAmount(account.balance - bookBalance), account.status];
    });

    return {
      title: "تسوية مصرفية",
      description: "مقارنة رصيد البنك مع رصيد الدفتر وإظهار الفروقات المقترحة محلياً.",
      filters: [...commonFilters, "البنك: كل الحسابات"],
      kpis: [
        { label: "رصيد البنك", value: financeAmount(bankTotal), tone: "green" },
        { label: "رصيد الدفتر", value: financeAmount(sum(bookBalances)), hint: "عرض فقط", tone: "brown" },
        { label: "حركات غير مطابقة", value: "2", tone: "gold" },
        { label: "حالة الربط", value: "معطل", hint: "لا يوجد Open Banking", tone: "red" },
      ],
      sections: [{ title: "مطابقة الحسابات البنكية", headers: ["الحساب", "IBAN", "رصيد البنك", "رصيد الدفتر", "الفرق", "الحالة"], rows, minWidth: "920px" }],
      notes: ["لا يوجد ربط بنكي حقيقي أو استيراد كشوفات. كل الفروقات محلية للعرض."],
    };
  }

  if (kind === "profit-loss") {
    const rows = [
      ["الإيرادات", "مبيعات الفواتير", financeAmount(salesTotal), "100%"],
      ["تكلفة المبيعات", "تكلفة تقديرية للبضاعة", financeAmount(-estimatedCost), "42%"],
      ["مجمل الربح", "بعد تكلفة المبيعات", financeAmount(grossProfit), `${Math.round((grossProfit / salesTotal) * 100)}%`],
      ["مصروفات تشغيلية", "مراكز التكلفة", financeAmount(-operatingExpenses), "تشغيلي"],
      ["صافي الربح", "قبل الإقفال", financeAmount(netProfit), `${Math.round((netProfit / salesTotal) * 100)}%`],
    ];

    return {
      title: "الأرباح والخسائر",
      description: "قائمة دخل تشغيلية مختصرة توضح الإيرادات والتكاليف والمصروفات وصافي الربح.",
      filters: [...commonFilters, "المقارنة: فترة حالية"],
      kpis: [
        { label: "الإيرادات", value: financeAmount(salesTotal), tone: "green" },
        { label: "مجمل الربح", value: financeAmount(grossProfit), tone: "gold" },
        { label: "المصروفات", value: financeAmount(operatingExpenses), tone: "brown" },
        { label: "صافي الربح", value: financeAmount(netProfit), tone: netProfit >= 0 ? "green" : "red" },
      ],
      sections: [{ title: "قائمة الأرباح والخسائر", headers: ["البند", "الوصف", "القيمة", "النسبة"], rows }],
    };
  }

  if (kind === "tax") {
    const rows = [
      ["مبيعات خاضعة", financeAmount(salesTotal - salesVat), "15%", financeAmount(salesVat)],
      ["مشتريات خاضعة", financeAmount(purchaseTotal - purchaseVat), "15%", financeAmount(purchaseVat)],
      ["صافي الضريبة", "مستحق محلي", "-", financeAmount(salesVat - purchaseVat)],
    ];

    return {
      title: "تقرير الضريبة",
      description: "ملخص ضريبة القيمة المضافة للمخرجات والمدخلات بدون إرسال أو تكامل خارجي.",
      filters: [...commonFilters, "VAT: 15%"],
      kpis: [
        { label: "ضريبة المخرجات", value: financeAmount(salesVat), tone: "green" },
        { label: "ضريبة المدخلات", value: financeAmount(purchaseVat), tone: "gold" },
        { label: "الصافي المستحق", value: financeAmount(salesVat - purchaseVat), tone: salesVat >= purchaseVat ? "red" : "green" },
        { label: "ZATCA", value: "غير مفعل", hint: "ديمو فقط", tone: "brown" },
      ],
      sections: [{ title: "ملخص الضريبة", headers: ["البند", "الوعاء", "النسبة", "الضريبة"], rows }],
      notes: ["لا يوجد اعتماد زاتكا أو إرسال إقرار ضريبي من هذه الصفحة."],
    };
  }

  if (kind === "sales") {
    return {
      title: "تقرير المبيعات",
      description: "تحليل المبيعات حسب الفاتورة والعميل والفرع والمنتج.",
      filters: [...commonFilters, "الحالة: كل الفواتير"],
      kpis: [
        { label: "إجمالي المبيعات", value: financeAmount(salesTotal), tone: "green" },
        { label: "عدد الفواتير", value: String(data.invoices.length), tone: "brown" },
        { label: "المدفوع", value: financeAmount(salesTotal - receivable), tone: "gold" },
        { label: "غير المدفوع", value: financeAmount(receivable), tone: "red" },
      ],
      sections: [
        {
          title: "فواتير المبيعات",
          headers: ["الفاتورة", "العميل", "الفرع", "التاريخ", "الحالة", "الإجمالي"],
          rows: invoiceTotals.map(({ invoice, totals }) => [
            invoice.number,
            data.customers.find((customer) => customer.id === invoice.customerId)?.name ?? "عميل",
            data.branches.find((branch) => branch.id === invoice.branchId)?.displayName ?? "فرع",
            invoice.issueDate,
            invoice.status,
            financeAmount(totals.total),
          ]),
          minWidth: "940px",
        },
        {
          title: "المبيعات حسب المنتج",
          headers: ["المنتج", "التصنيف", "الكمية", "الإيراد", "الهامش"],
          rows: productSales.filter((item) => item.quantity > 0).map((item) => [item.product.name, item.product.category, item.quantity, financeAmount(item.revenue), financeAmount(item.margin)]),
        },
      ],
    };
  }

  if (kind === "purchases") {
    return {
      title: "تقرير المشتريات",
      description: "تحليل فواتير الموردين والمخزون والضريبة المدخلة.",
      filters: [...commonFilters, "الحالة: كل الموردين"],
      kpis: [
        { label: "إجمالي المشتريات", value: financeAmount(purchaseTotal), tone: "brown" },
        { label: "ضريبة المدخلات", value: financeAmount(purchaseVat), tone: "gold" },
        { label: "عدد الفواتير", value: String(data.purchaseInvoices.length), tone: "green" },
        { label: "الموردون", value: String(data.suppliers.length), tone: "brown" },
      ],
      sections: [
        {
          title: "فواتير المشتريات",
          headers: ["الفاتورة", "المورد", "المستودع", "التاريخ", "الحالة", "الإجمالي"],
          rows: data.purchaseInvoices.map((invoice) => [
            invoice.number,
            data.suppliers.find((supplier) => supplier.id === invoice.supplierId)?.name ?? "مورد",
            data.warehouses.find((warehouse) => warehouse.id === invoice.warehouseId)?.name ?? "مستودع",
            invoice.issueDate,
            invoice.status,
            financeAmount(invoice.subtotal + invoice.vat),
          ]),
          minWidth: "920px",
        },
      ],
    };
  }

  if (kind === "inventory") {
    return {
      title: "تقرير المخزون",
      description: "أرصدة المنتجات وحركة المستودعات والتنبيهات ضمن جداول محصورة.",
      filters: [...commonFilters, "المستودع: كل المستودعات"],
      kpis: [
        { label: "قيمة المخزون", value: financeAmount(inventoryValue), tone: "green" },
        { label: "المنتجات", value: String(data.products.length), tone: "brown" },
        { label: "تنبيهات منخفضة", value: String(data.products.filter((product) => product.stock <= 10).length), tone: "red" },
        { label: "الحركات", value: String(data.stockMovements.length), tone: "gold" },
      ],
      sections: [
        {
          title: "أرصدة المنتجات",
          headers: ["المنتج", "التصنيف", "SKU", "المخزون", "السعر", "قيمة تقديرية"],
          rows: data.products.map((product) => [product.name, product.category, product.sku, product.stock, financeAmount(product.price), financeAmount(product.stock * product.price * 0.42)]),
          minWidth: "920px",
        },
        {
          title: "حركة المخزون",
          headers: ["التاريخ", "المنتج", "المستودع", "النوع", "الكمية"],
          rows: data.stockMovements.map((movement) => [
            movement.date,
            data.products.find((product) => product.id === movement.productId)?.name ?? "منتج",
            data.warehouses.find((warehouse) => warehouse.id === movement.warehouseId)?.name ?? "مستودع",
            movement.type,
            movement.quantity,
          ]),
        },
      ],
    };
  }

  if (kind === "branches") {
    return {
      title: "تقرير الفروع",
      description: "أداء مالي مختصر لكل فرع مع المبيعات والصندوق والمستودع المرتبط.",
      filters: [...commonFilters, "الفروع: الكل"],
      kpis: [
        { label: "عدد الفروع", value: String(data.branches.length), tone: "brown" },
        { label: "مبيعات الفروع", value: financeAmount(salesTotal), tone: "green" },
        { label: "نقدية الصناديق", value: financeAmount(cashTotal), tone: "gold" },
        { label: "المستودعات", value: String(data.warehouses.length), tone: "brown" },
      ],
      sections: [
        {
          title: "أداء الفروع",
          headers: ["الفرع", "المدينة", "المبيعات", "الصندوق", "المستودع", "هامش تقديري"],
          rows: branchSales.map((item) => [item.branch.displayName || item.branch.name, item.branch.city, financeAmount(item.sales), financeAmount(item.cash), item.warehouse, financeAmount(item.sales * 0.34)]),
          minWidth: "900px",
        },
      ],
    };
  }

  return {
    title: "تقرير المنتجات",
    description: "ربحية المنتجات وحركتها ومخزونها في جدول واسع داخل مساحة آمنة.",
    filters: [...commonFilters, "التصنيف: الكل"],
    kpis: [
      { label: "عدد المنتجات", value: String(data.products.length), tone: "brown" },
      { label: "إيراد المنتجات", value: financeAmount(sum(productSales.map((item) => item.revenue))), tone: "green" },
      { label: "الهامش التقديري", value: financeAmount(sum(productSales.map((item) => item.margin))), tone: "gold" },
      { label: "منخفض المخزون", value: String(data.products.filter((product) => product.stock <= 10).length), tone: "red" },
    ],
    sections: [
      {
        title: "أداء المنتجات",
        headers: ["المنتج", "التصنيف", "SKU", "المخزون", "الكمية المباعة", "الإيراد", "الهامش"],
        rows: productSales.map((item) => [item.product.name, item.product.category, item.product.sku, item.product.stock, item.quantity, financeAmount(item.revenue), financeAmount(item.margin)]),
        minWidth: "980px",
      },
    ],
  };
}

export function FinanceStandardReport({ kind }: { kind: StandardReportKind }) {
  const report = buildReport(kind);

  return (
    <FinanceReportPage title={report.title} description={report.description} kpis={report.kpis} filters={report.filters}>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {report.sections.map((section) => (
            <FinanceReportTable key={section.title} {...section} />
          ))}
        </div>
        <aside className="min-w-0 space-y-3">
          <div className="rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
            <h2 className="text-[13px] font-black text-[#2F241D]">حالة التقرير</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <FinanceStatusBadge tone="green">جاهز للعرض</FinanceStatusBadge>
              <FinanceStatusBadge tone="gold">بيانات ديمو</FinanceStatusBadge>
              <FinanceStatusBadge tone="red">بدون تكاملات حقيقية</FinanceStatusBadge>
            </div>
          </div>
          {report.notes?.length ? (
            <div className="rounded-[8px] border border-[#E8D8C2] bg-[#FFFDF8] p-3 text-[12px] font-bold leading-6 text-[#6B431C]">
              {report.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </FinanceReportPage>
  );
}
