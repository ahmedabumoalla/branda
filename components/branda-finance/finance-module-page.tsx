import Link from "next/link";
import { FinanceActionCard } from "@/components/branda-finance/finance-action-card";
import { FinanceEmptyState } from "@/components/branda-finance/finance-empty-state";
import { FinancePageShell } from "@/components/branda-finance/finance-page-shell";
import { FinanceStatCard } from "@/components/branda-finance/finance-stat-card";
import { FinanceStatusBadge } from "@/components/branda-finance/finance-status-badge";
import { FinanceTable } from "@/components/branda-finance/finance-table";
import { FinanceTabs } from "@/components/branda-finance/finance-tabs";
import { calculateDemoInvoice, calculateJournalEntryPreview, financeAmount } from "@/lib/branda-finance/calculations";
import { getBrandaFinanceDemoData } from "@/lib/branda-finance/demo-data";
import { brandaFinanceWorkflowBoundaries } from "@/lib/branda-finance/workflows";

export type FinanceModuleKind =
  | "purchases"
  | "parties"
  | "catalog"
  | "accountant"
  | "banking"
  | "payroll"
  | "assets"
  | "costCenters"
  | "projects"
  | "branches"
  | "developer"
  | "integrations"
  | "templates"
  | "accountantService"
  | "help";

const moduleMeta: Record<FinanceModuleKind, { title: string; description: string; status: string }> = {
  purchases: { title: "المشتريات", description: "فواتير مشتريات وأوامر شراء ومردودات محلية مرتبطة بالموردين والمخزون.", status: "محلي فقط" },
  parties: { title: "العملاء والموردين", description: "أرصدة وكشوف حساب وأعمار ديون وربط مباشر بالفواتير والمشتريات.", status: "محلي فقط" },
  catalog: { title: "المنتجات والخدمات والمخزون", description: "قائمة منتجات وخدمات وتنبيهات مخزون وتكلفة وربحية.", status: "محلي فقط" },
  accountant: { title: "للمحاسب", description: "شجرة الحسابات، قيود اليومية، معاينة الترحيل والإغلاق المحاسبي.", status: "جاهز للربط" },
  banking: { title: "الحسابات البنكية والصناديق", description: "صناديق وبنوك وتحصيلات كاش وبطاقة وتسوية وإغلاق يومي.", status: "محلي فقط" },
  payroll: { title: "الرواتب والموظفين", description: "رواتب وسلف وعهد واستقطاعات وتجهيز ملف بنك للمعاينة.", status: "محلي فقط" },
  assets: { title: "الأصول الثابتة", description: "سجل أصول وإهلاك وصيانة واستبعاد للمعاينة.", status: "محلي فقط" },
  costCenters: { title: "مراكز التكلفة", description: "توزيع الإيرادات والمصروفات على مراكز التكلفة.", status: "محلي فقط" },
  projects: { title: "المشاريع", description: "إيرادات وتكاليف وهوامش مشاريع مع ربط الفواتير والمشتريات.", status: "محلي فقط" },
  branches: { title: "الفروع", description: "أداء مالي لكل فرع مع مبيعات وصندوق ومخزون وضريبة.", status: "محلي فقط" },
  developer: { title: "للمطورين", description: "جاهزية webhooks وواجهات API بدون مفاتيح أو اتصالات خارجية.", status: "معطل بوضوح" },
  integrations: { title: "التكاملات", description: "حالة ZATCA وmada والبنوك والطابعات والذكاء الاصطناعي بوضوح.", status: "معطل بوضوح" },
  templates: { title: "القوالب", description: "قوالب فاتورة وإيصال 80mm و58mm وعرض سعر وأمر شراء.", status: "محلي فقط" },
  accountantService: { title: "التعاقد مع محاسب", description: "طلب خدمة محاسب وقائمة مستندات مطلوبة بدون إرسال حقيقي.", status: "محلي فقط" },
  help: { title: "مركز المساعدة", description: "مقالات إعداد وتدفقات عمل وأسئلة شائعة لبرندة المالية.", status: "جاهز" },
};

function moduleStats(kind: FinanceModuleKind) {
  const data = getBrandaFinanceDemoData();
  const invoiceTotals = data.invoices.map(calculateDemoInvoice);
  const unpaid = invoiceTotals.reduce((sum, total) => sum + total.remainingBalance, 0);
  const purchases = data.purchaseInvoices.reduce((sum, invoice) => sum + invoice.subtotal + invoice.vat, 0);
  const cash = data.cashBoxes.reduce((sum, box) => sum + box.balance, 0);
  const bank = data.bankAccounts.reduce((sum, account) => sum + account.balance, 0);

  const shared = [
    { label: "مبيعات اليوم", value: financeAmount(invoiceTotals.reduce((sum, total) => sum + total.total, 0)), hint: "من بيانات المعاينة", tone: "green" as const },
    { label: "فواتير غير مدفوعة", value: financeAmount(unpaid), hint: "ذمم محلية", tone: "gold" as const },
    { label: "مشتريات الشهر", value: financeAmount(purchases), hint: "غير مرحلة", tone: "brown" as const },
    { label: "نقدية الصندوق", value: financeAmount(cash), hint: "إغلاق يومي محلي", tone: "green" as const },
  ];

  if (kind === "banking") return [...shared.slice(0, 2), { label: "رصيد البنك", value: financeAmount(bank), hint: "بدون ربط بنكي", tone: "brown" as const }, shared[3]];
  if (kind === "catalog") return [
    { label: "المنتجات", value: String(data.products.length), hint: "منتجات وخدمات", tone: "brown" as const },
    { label: "تنبيهات المخزون", value: String(data.products.filter((product) => product.stock <= 10).length), hint: "حد محلي", tone: "gold" as const },
    { label: "المستودعات", value: String(data.warehouses.length), hint: "فروع مرتبطة", tone: "green" as const },
    { label: "متوسط الهامش", value: "58%", hint: "تقدير محلي", tone: "brown" as const },
  ];
  return shared;
}

function moduleRows(kind: FinanceModuleKind) {
  const data = getBrandaFinanceDemoData();

  if (kind === "purchases") {
    return {
      headers: ["الفاتورة", "المورد", "المستودع", "الحالة", "الإجمالي"],
      rows: data.purchaseInvoices.map((invoice) => [
        invoice.number,
        data.suppliers.find((supplier) => supplier.id === invoice.supplierId)?.name ?? "مورد",
        data.warehouses.find((warehouse) => warehouse.id === invoice.warehouseId)?.name ?? "مستودع",
        invoice.status,
        financeAmount(invoice.subtotal + invoice.vat),
      ]),
    };
  }

  if (kind === "parties") {
    return {
      headers: ["الطرف", "النوع", "الشروط / الرقم الضريبي", "الرصيد", "رابط"],
      rows: [
        ...data.customers.map((customer) => [customer.name, "عميل", customer.vatNumber ?? customer.paymentTerms, financeAmount(3200), <Link key={customer.id} href={`/dashboard/branda-finance/statements/customer/${customer.id}`}>كشف الحساب</Link>]),
        ...data.suppliers.map((supplier) => [supplier.name, "مورد", supplier.vatNumber ?? "غير مسجل", financeAmount(5800), <Link key={supplier.id} href={`/dashboard/branda-finance/statements/supplier/${supplier.id}`}>كشف الحساب</Link>]),
      ],
    };
  }

  if (kind === "catalog") {
    return {
      headers: ["المنتج / الخدمة", "التصنيف", "SKU", "المخزون", "السعر", "رابط"],
      rows: data.products.map((product) => [product.name, product.category, product.sku, product.stock, financeAmount(product.price), <Link key={product.id} href={`/dashboard/branda-finance/statements/product/${product.id}`}>كشف المنتج</Link>]),
    };
  }

  if (kind === "accountant") {
    const invoice = data.invoices[0];
    return {
      headers: ["الحساب", "الاسم", "مدين", "دائن", "المصدر"],
      rows: calculateJournalEntryPreview(invoice).map((line) => [line.accountCode, line.accountName, financeAmount(line.debit), financeAmount(line.credit), invoice.number]),
    };
  }

  if (kind === "banking") {
    return {
      headers: ["الحساب", "النوع", "الرصيد", "الحالة", "ملاحظة"],
      rows: [
        ...data.cashBoxes.map((box) => [box.name, "صندوق", financeAmount(box.balance), "محلي", `آخر إغلاق ${box.lastClosedAt}`]),
        ...data.bankAccounts.map((account) => [account.name, "بنك", financeAmount(account.balance), account.status, account.iban]),
      ],
    };
  }

  if (kind === "payroll") {
    return {
      headers: ["الموظف", "الدور", "الراتب", "العهدة", "الحالة"],
      rows: data.employees.map((employee) => [employee.name, employee.role, financeAmount(employee.monthlySalary), financeAmount(employee.custodyBalance), "مسودة رواتب"]),
    };
  }

  if (kind === "costCenters") {
    return {
      headers: ["مركز التكلفة", "المسؤول", "الموازنة", "الفعلي", "المتبقي"],
      rows: data.costCenters.map((center) => [center.name, center.owner, financeAmount(center.budget), financeAmount(center.actual), financeAmount(center.budget - center.actual)]),
    };
  }

  if (kind === "projects") {
    return {
      headers: ["المشروع", "الحالة", "الإيراد", "التكلفة", "الهامش"],
      rows: data.projects.map((project) => [project.name, project.status, financeAmount(project.revenue), financeAmount(project.cost), financeAmount(project.revenue - project.cost)]),
    };
  }

  if (kind === "branches") {
    return {
      headers: ["الفرع", "المدينة", "المبيعات", "الصندوق", "المخزون"],
      rows: data.branches.map((branch, index) => [branch.displayName || branch.name || "الرئيسي", branch.city, financeAmount(42000 - index * 8200), financeAmount(data.cashBoxes[index]?.balance ?? 0), data.warehouses[index]?.name ?? "المستودع الرئيسي"]),
    };
  }

  if (kind === "integrations") {
    return {
      headers: ["التكامل", "الحالة", "الملاحظة"],
      rows: data.integrations.map((integration) => [integration.name, integration.status, integration.note]),
    };
  }

  if (kind === "templates") {
    return {
      headers: ["القالب", "النوع", "الحالة", "المعاينة"],
      rows: data.templates.map((template) => [template.name, template.type, template.status, "معاينة محلية بدون طباعة"]),
    };
  }

  if (kind === "developer") {
    return {
      headers: ["الحدث", "الحالة", "الحد الجاهز"],
      rows: [
        ["invoice.created", "جاهز للتصميم", "يحتاج endpoint لاحقا"],
        ["payment.collected", "جاهز للتصميم", "لا توجد مفاتيح API"],
        ["stock.adjusted", "جاهز للتصميم", "يرتبط بالمخزون لاحقا"],
      ],
    };
  }

  if (kind === "assets") {
    return {
      headers: ["الأصل", "القيمة", "الإهلاك الشهري", "الحالة"],
      rows: [
        ["آلة قهوة رئيسية", financeAmount(42000), financeAmount(1750), "نشط"],
        ["ثلاجة عرض", financeAmount(18000), financeAmount(620), "نشط"],
        ["معدات تغليف", financeAmount(9200), financeAmount(310), "صيانة قريبة"],
      ],
    };
  }

  if (kind === "accountantService") {
    return {
      headers: ["المستند", "الحالة", "الغرض"],
      rows: [
        ["السجل التجاري", "مطلوب لاحقا", "فتح ملف محاسبي"],
        ["شهادة ضريبة القيمة المضافة", "مطلوب لاحقا", "إعداد التقارير الضريبية"],
        ["كشف حساب بنكي", "اختياري لاحقا", "تسوية الحركات"],
      ],
    };
  }

  return {
    headers: ["الموضوع", "الحالة", "التفصيل"],
    rows: [
      ["إعداد الفواتير", "جاهز", "إنشاء ومعاينة محلية"],
      ["ربط المبيعات", "جاهز", "الكاشير مرتبط بالفاتورة"],
      ["الترحيل المحاسبي", "لاحقا", "يتطلب قاعدة بيانات وصلاحيات"],
    ],
  };
}

function moduleActions(kind: FinanceModuleKind) {
  const common = [
    { title: "إنشاء فاتورة مبيعات", href: "/dashboard/branda-finance/invoicing/create", description: "افتح نموذج الفاتورة الاحترافي" },
    { title: "فتح شاشة المبيعات", href: "/dashboard/branda-finance/sales", description: "بيع محلي من المنتجات" },
    { title: "التقارير المالية", href: "/dashboard/branda-finance/reports", description: "اقرأ المؤشرات والتقارير" },
    { title: "الكشوف الموحدة", href: "/dashboard/branda-finance/statements", description: "عميل ومورد ومنتج وخدمة" },
  ];
  if (kind === "purchases") return [{ title: "العملاء والموردين", href: "/dashboard/branda-finance/parties", description: "افتح ملف الموردين" }, { title: "المنتجات والمخزون", href: "/dashboard/branda-finance/catalog", description: "راجع أثر الشراء" }, ...common.slice(2)];
  if (kind === "catalog") return [{ title: "بيع منتج", href: "/dashboard/branda-finance/sales", description: "أضف المنتج إلى السلة" }, { title: "فاتورة مشتريات", href: "/dashboard/branda-finance/purchases", description: "زود المخزون محليا" }, ...common.slice(2)];
  return common;
}

export function FinanceModulePage({ kind }: { kind: FinanceModuleKind }) {
  const meta = moduleMeta[kind];
  const table = moduleRows(kind);

  return (
    <FinancePageShell
      title={meta.title}
      description={meta.description}
      status={meta.status}
      actions={[
        { label: "مركز المالية", href: "/dashboard/branda-finance" },
        { label: "إنشاء فاتورة", href: "/dashboard/branda-finance/invoicing/create", primary: true },
      ]}
    >
      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {moduleStats(kind).map((stat) => (
          <FinanceStatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          <FinanceTabs tabs={kind === "parties" ? ["العملاء", "الموردون", "الأعمار", "كشف الحساب"] : ["نظرة عامة", "المراجعة", "جاهز للربط"]} />
          <FinanceTable headers={table.headers} rows={table.rows} />
        </div>
        <aside className="min-w-0 space-y-3">
          <div className="rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
            <h2 className="text-[13px] font-black text-[#2F241D]">روابط العمل</h2>
            <div className="mt-2 grid gap-2">
              {moduleActions(kind).map((action) => (
                <FinanceActionCard key={action.href + action.title} {...action} />
              ))}
            </div>
          </div>
          <FinanceEmptyState
            title="جاهز للربط بقاعدة البيانات"
            detail={brandaFinanceWorkflowBoundaries.join(" ")}
          />
          <div className="rounded-[8px] border border-[#E8D8C2] bg-[#FFFDF8] p-3">
            <h2 className="text-[13px] font-black text-[#2F241D]">حالة المعاينة</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <FinanceStatusBadge tone="gold">محلي فقط</FinanceStatusBadge>
              <FinanceStatusBadge tone="red">لا تكاملات حقيقية</FinanceStatusBadge>
              <FinanceStatusBadge tone="green">لا كتابة DB</FinanceStatusBadge>
            </div>
          </div>
        </aside>
      </section>
    </FinancePageShell>
  );
}
