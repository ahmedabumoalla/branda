"use client";

import { Eye, EyeOff, Paperclip, Save, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AddBranchModal } from "@/components/branda-finance/add-branch-modal";
import { AddCustomerModal } from "@/components/branda-finance/add-customer-modal";
import { CustomFieldModal } from "@/components/branda-finance/custom-field-modal";
import { InvoiceForm } from "@/components/branda-finance/invoice-form";
import { InvoicePreview } from "@/components/branda-finance/invoice-preview";
import type {
  BrandaFinanceBranch,
  BrandaFinanceCustomer,
  BrandaFinanceCustomField,
  BrandaFinanceDataset,
  BrandaFinanceInvoiceLine,
  BrandaFinancePaymentMethod,
} from "@/lib/branda-finance/invoice-types";

type InvoiceWorkspaceProps = {
  dataset: BrandaFinanceDataset;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 15);
  return date.toISOString().slice(0, 10);
}

function lineId() {
  return `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function InvoiceWorkspace({ dataset }: InvoiceWorkspaceProps) {
  const firstProduct = dataset.products[0];
  const [previewVisible, setPreviewVisible] = useState(true);
  const [branches, setBranches] = useState(dataset.branches);
  const [customers, setCustomers] = useState(dataset.customers);
  const [customFields, setCustomFields] = useState(dataset.customFields);
  const [branchId, setBranchId] = useState(dataset.branches[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(dataset.customers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(dataset.warehouses[0]?.id ?? "");
  const [issueDate, setIssueDate] = useState(today());
  const [invoiceDueDate, setInvoiceDueDate] = useState(dueDate());
  const [taxMode, setTaxMode] = useState("exclusive");
  const [paymentMethod, setPaymentMethod] = useState<BrandaFinancePaymentMethod>("unpaid");
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [customFieldModalOpen, setCustomFieldModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("جاهز كمسودة محلية");
  const [lines, setLines] = useState<BrandaFinanceInvoiceLine[]>([
    {
      id: lineId(),
      productId: firstProduct?.id,
      description: firstProduct?.name ?? "خدمة تجريبية",
      quantity: 1,
      unitPrice: firstProduct?.price ?? 100,
      taxRateId: "vat-15",
      accountId: "sales-food",
      revenueRecognition: "on-invoice",
    },
  ]);

  const totals = useMemo(() => {
    const gross = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const subtotal = taxMode === "inclusive" ? gross / 1.15 : gross;
    const discount = 0;
    const vat = taxMode === "inclusive" ? gross - subtotal : subtotal * 0.15;
    return {
      subtotal,
      discount,
      vat,
      total: subtotal - discount + vat,
    };
  }, [lines, taxMode]);

  const selectedBranch = branches.find((branch) => branch.id === branchId);
  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  function changeLine(lineIdValue: string, patch: Partial<BrandaFinanceInvoiceLine>) {
    setLines((current) => current.map((line) => (line.id === lineIdValue ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((current) => [
      ...current,
      {
        id: lineId(),
        description: "",
        quantity: 1,
        unitPrice: 0,
        taxRateId: "vat-15",
        accountId: "sales-food",
        revenueRecognition: "on-invoice",
      },
    ]);
  }

  function removeLine(targetId: string) {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.id !== targetId) : current));
  }

  function addCustomer(customer: BrandaFinanceCustomer) {
    setCustomers((current) => [customer, ...current]);
    setCustomerId(customer.id);
    setStatusMessage("تمت إضافة العميل محليًا داخل المسودة");
  }

  function addBranch(branch: BrandaFinanceBranch) {
    setBranches((current) => [branch, ...current]);
    setBranchId(branch.id);
    setStatusMessage("تمت إضافة الفرع محليًا داخل المسودة");
  }

  function addCustomField(field: BrandaFinanceCustomField) {
    setCustomFields((current) => [field, ...current]);
    setStatusMessage("تمت إضافة الحقل المخصص محليًا");
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#F8F1E7] p-4 text-[#311912] lg:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[#E1CFB8] bg-white p-4 shadow-[0_14px_40px_rgba(49,25,18,0.07)]">
        <div>
          <p className="text-xs font-black text-[#B7791F]">مساحة إنشاء الفواتير</p>
          <h1 className="text-2xl font-black">Branda Finance</h1>
          <p className="mt-1 text-sm font-bold text-[#806A5E]">{statusMessage}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton icon={<ShieldCheck className="h-4 w-4" />} label="اعتماد" onClick={() => setStatusMessage("اعتماد تجريبي فقط، لا توجد آثار محاسبية فعلية")} dark />
          <ActionButton icon={<Save className="h-4 w-4" />} label="حفظ المسودة" onClick={() => setStatusMessage("تم حفظ المسودة في واجهة العرض فقط")} />
          <ActionButton
            icon={previewVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            label={previewVisible ? "إخفاء المعاينة" : "إظهار المعاينة"}
            onClick={() => setPreviewVisible((current) => !current)}
          />
          <ActionButton icon={<Paperclip className="h-4 w-4" />} label="مرفقات" onClick={() => setStatusMessage("المرفقات placeholder للنسخة التجريبية")} />
          <ActionButton icon={<X className="h-4 w-4" />} label="إغلاق" onClick={() => setStatusMessage("لم يتم الخروج، هذه مساحة demo آمنة")} />
        </div>
      </div>

      <div className={`grid gap-4 ${previewVisible ? "2xl:grid-cols-[minmax(420px,0.9fr)_minmax(620px,1.25fr)]" : "grid-cols-1"}`}>
        {previewVisible ? (
          <InvoicePreview
            branch={selectedBranch}
            customer={selectedCustomer}
            lines={lines}
            issueDate={issueDate}
            dueDate={invoiceDueDate}
            paymentMethod={paymentMethod}
            subtotal={totals.subtotal}
            discount={totals.discount}
            vat={totals.vat}
            total={totals.total}
          />
        ) : null}
        <InvoiceForm
          branches={branches}
          customers={customers}
          warehouses={dataset.warehouses}
          products={dataset.products}
          accounts={dataset.accounts}
          taxRates={dataset.taxRates}
          customFields={customFields}
          paymentMethods={dataset.paymentMethods}
          branchId={branchId}
          customerId={customerId}
          warehouseId={warehouseId}
          issueDate={issueDate}
          dueDate={invoiceDueDate}
          taxMode={taxMode}
          paymentMethod={paymentMethod}
          lines={lines}
          subtotal={totals.subtotal}
          discount={totals.discount}
          vat={totals.vat}
          total={totals.total}
          onBranchChange={setBranchId}
          onCustomerChange={setCustomerId}
          onWarehouseChange={setWarehouseId}
          onIssueDateChange={setIssueDate}
          onDueDateChange={setInvoiceDueDate}
          onTaxModeChange={setTaxMode}
          onPaymentMethodChange={setPaymentMethod}
          onOpenCustomerModal={() => setCustomerModalOpen(true)}
          onOpenBranchModal={() => setBranchModalOpen(true)}
          onOpenCustomFieldModal={() => setCustomFieldModalOpen(true)}
          onLineChange={changeLine}
          onAddLine={addLine}
          onRemoveLine={removeLine}
        />
      </div>

      <AddCustomerModal open={customerModalOpen} onClose={() => setCustomerModalOpen(false)} onSave={addCustomer} />
      <AddBranchModal open={branchModalOpen} onClose={() => setBranchModalOpen(false)} onSave={addBranch} />
      <CustomFieldModal open={customFieldModalOpen} onClose={() => setCustomFieldModalOpen(false)} onSave={addCustomField} />
    </div>
  );
}

function ActionButton({ icon, label, onClick, dark }: { icon: React.ReactNode; label: string; onClick: () => void; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${
        dark ? "bg-[#3A2117] text-white" : "bg-[#FCF8F3] text-[#6B3A25] hover:bg-[#F1E2CF]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
