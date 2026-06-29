"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Eye, FileCheck2, Paperclip, Save, ShoppingCart, X } from "lucide-react";
import { AddBranchModal } from "@/components/branda-finance/add-branch-modal";
import { AddCustomerModal } from "@/components/branda-finance/add-customer-modal";
import { CustomFieldModal } from "@/components/branda-finance/custom-field-modal";
import { FinanceBackButton } from "@/components/branda-finance/finance-back-button";
import { InvoiceForm } from "@/components/branda-finance/invoice-form";
import { InvoicePreviewModal } from "@/components/branda-finance/invoice-preview-modal";
import { calculateInvoiceTotals } from "@/components/branda-finance/invoice-totals";
import { BRANDA_FINANCE_REAL_PERSISTENCE_DISABLED_MESSAGE } from "@/lib/branda-finance/db-readiness";
import type {
  FinanceBranch,
  FinanceCustomField,
  FinanceCustomer,
  FinanceInvoiceItem,
  FinancePaymentMethod,
  FinanceWorkspaceData,
} from "@/lib/branda-finance/invoice-types";

type InvoiceWorkspaceProps = {
  data: FinanceWorkspaceData;
  realPersistenceReady?: boolean;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNowIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function createItemFromProduct(data: FinanceWorkspaceData, productIndex = 0): FinanceInvoiceItem {
  const product = data.products[productIndex] ?? data.products[0];

  return {
    id: `item-${Date.now()}-${productIndex}`,
    productId: product?.id,
    description: product?.name ?? "بند فاتورة",
    quantity: 1,
    price: product?.price ?? 0,
    discount: 0,
    taxRate: product?.vatRate ?? 15,
    accountId: product?.accountId ?? data.accounts[0]?.id ?? "",
    warehouseId: data.warehouses[0]?.id,
    revenueRecognition: product?.revenueRecognition ?? "عند إصدار الفاتورة",
  };
}

export function InvoiceWorkspace({ data, realPersistenceReady = false }: InvoiceWorkspaceProps) {
  const [branches, setBranches] = useState(data.branches);
  const [customers, setCustomers] = useState(data.customers);
  const [customFields, setCustomFields] = useState(data.customFields);
  const [products] = useState(data.products);
  const [selectedBranchId, setSelectedBranchId] = useState(data.branches[0]?.id ?? "");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(data.warehouses[0]?.id ?? "");
  const [selectedCustomerId, setSelectedCustomerId] = useState(data.customers[0]?.id ?? "");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<FinancePaymentMethod["id"]>("unpaid");
  const [issueDate, setIssueDate] = useState(todayIso);
  const [dueDate, setDueDate] = useState(() => daysFromNowIso(15));
  const [taxMode, setTaxMode] = useState("غير شامل الضريبة");
  const [invoiceStatus, setInvoiceStatus] = useState("مسودة");
  const [discount, setDiscount] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [customFieldModalOpen, setCustomFieldModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState(BRANDA_FINANCE_REAL_PERSISTENCE_DISABLED_MESSAGE);
  const [items, setItems] = useState<FinanceInvoiceItem[]>([]);

  const totals = useMemo(() => calculateInvoiceTotals(items, discount, amountPaid), [amountPaid, discount, items]);
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? branches[0];
  const selectedWarehouse = data.warehouses.find((warehouse) => warehouse.id === selectedWarehouseId) ?? data.warehouses[0];
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? customers[0];
  const selectedPaymentMethod =
    data.paymentMethods.find((method) => method.id === selectedPaymentMethodId) ?? data.paymentMethods[0];

  function changeItem(id: string, patch: Partial<FinanceInvoiceItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addItem() {
    if (!data.products.length) {
      setStatusMessage("لا توجد بيانات مرتبطة بعد");
      return;
    }

    setItems((current) => [
      ...current,
      { ...createItemFromProduct(data, current.length), id: `item-${Date.now()}-${current.length}` },
    ]);
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function changePaymentMethod(id: FinancePaymentMethod["id"]) {
    setSelectedPaymentMethodId(id);
    setAmountPaid(id === "cash" || id === "card" || id === "transfer" ? totals.total : 0);
    setInvoiceStatus(id === "credit" || id === "unpaid" ? "غير مدفوعة" : "جاهزة للاعتماد");
  }

  function saveCustomer(customer: FinanceCustomer) {
    setCustomers((current) => [customer, ...current]);
    setSelectedCustomerId(customer.id);
    setStatusMessage("تمت إضافة العميل محليًا داخل الواجهة");
  }

  function saveBranch(branch: FinanceBranch) {
    setBranches((current) => [branch, ...current]);
    setSelectedBranchId(branch.id);
    setStatusMessage("تمت إضافة الفرع محليًا داخل الواجهة");
  }

  function saveCustomField(field: FinanceCustomField) {
    setCustomFields((current) => [field, ...current]);
    setStatusMessage("تمت إضافة الحقل المخصص محليًا داخل الواجهة");
  }

  return (
    <main dir="rtl" className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#F5EFE6] px-3 py-4 text-right text-[#2F241D] sm:px-4 lg:px-5">
      <div className="mx-auto flex w-full max-w-full min-w-0 flex-col gap-4 overflow-hidden">
        <div className="min-w-0 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3 shadow-[0_16px_38px_rgba(69,43,28,0.08)] sm:p-4">
          <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="mb-2">
                <FinanceBackButton href="/dashboard/branda-finance/invoicing" />
              </div>
              <p className="text-xs font-black text-[#9C6B2E]">برندا المالية</p>
              <h1 className="mt-1 text-2xl font-black text-[#2F241D] sm:text-3xl">إنشاء فاتورة مبيعات</h1>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                <span className="rounded-[8px] border border-[#D8BD89] bg-[#F8E8C9] px-2.5 py-1 text-[11px] font-black text-[#6B431C]">
                  رقم الفاتورة يصدر بعد التفعيل
                </span>
                <span className="rounded-[8px] border border-[#CFE2D8] bg-[#EDF7F2] px-2.5 py-1 text-[11px] font-black text-[#2F5D50]">
                  {invoiceStatus}
                </span>
              </div>
              <p className="mt-1.5 max-w-full truncate text-[12px] font-bold text-[#7D6654]">{statusMessage}</p>
            </div>
            <div className="flex min-w-0 flex-wrap gap-1.5 xl:justify-end">
              <button
                type="button"
                disabled={!realPersistenceReady}
                onClick={() => {
                  if (!realPersistenceReady) {
                    setStatusMessage(BRANDA_FINANCE_REAL_PERSISTENCE_DISABLED_MESSAGE);
                    return;
                  }
                  setInvoiceStatus("جاهزة للاعتماد");
                  setStatusMessage("تم اعتماد الفاتورة داخل الواجهة بدون كتابة دائمة");
                }}
                className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-[8px] bg-[#2F5D50] px-3 text-[12px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileCheck2 className="h-4 w-4" />
                اعتماد الفاتورة
              </button>
              <button
                type="button"
                disabled={!realPersistenceReady}
                onClick={() => {
                  if (!realPersistenceReady) {
                    setStatusMessage(BRANDA_FINANCE_REAL_PERSISTENCE_DISABLED_MESSAGE);
                    return;
                  }
                  setInvoiceStatus("مسودة");
                  setStatusMessage("تم حفظ المسودة داخل الواجهة بدون كتابة دائمة");
                }}
                className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-[8px] border border-[#D6B677] bg-[#F8E8C9] px-3 text-[12px] font-black text-[#6B431C] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                حفظ كمسودة
              </button>
              <Link
                href="/dashboard/branda-finance/sales"
                className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-[8px] border border-[#CFE2D8] bg-[#EDF7F2] px-3 text-[12px] font-black text-[#2F5D50]"
              >
                <ShoppingCart className="h-4 w-4" />
                فتح شاشة المبيعات
              </Link>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-[8px] border border-[#D8C7B2] bg-white px-3 text-[12px] font-black text-[#5B3926]"
              >
                <Eye className="h-4 w-4" />
                معاينة الفاتورة
              </button>
              <button
                type="button"
                onClick={() => setStatusMessage("المرفقات محلية ولا يتم رفع أي ملفات الآن")}
                className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-[8px] border border-[#D8C7B2] bg-white px-3 text-[12px] font-black text-[#5B3926]"
              >
                <Paperclip className="h-4 w-4" />
                مرفقات
              </button>
              <button
                type="button"
                onClick={() => setStatusMessage("تم إغلاق مساحة العمل بدون انتقال أو حفظ دائم")}
                className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-[8px] border border-[#E6CFC8] bg-[#FFF7F4] px-3 text-[12px] font-black text-[#9B3327]"
              >
                <X className="h-4 w-4" />
                إغلاق
              </button>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-4 overflow-hidden">
          <div className="rounded-[8px] border border-[#D6B677] bg-[#FFF8EA] p-3 text-[12px] font-bold leading-6 text-[#6B431C]">
            {BRANDA_FINANCE_REAL_PERSISTENCE_DISABLED_MESSAGE}. يتم عرض المنتجات والفروع والعملاء الحقيقيين المتاحين فقط، وأي نقص في الجداول يظهر كحالة فارغة بدل بيانات محلية مصطنعة.
          </div>
          {!data.products.length ? (
            <div className="rounded-[8px] border border-dashed border-[#D8C3A2] bg-[#FFFDF8] p-4 text-center text-sm font-black text-[#7D6654]">
              لا توجد بيانات مرتبطة بعد
            </div>
          ) : null}
          <InvoiceForm
            data={{ ...data, products }}
            branches={branches}
            warehouses={data.warehouses}
            customers={customers}
            customFields={customFields}
            items={items}
            totals={totals}
            selectedBranchId={selectedBranchId}
            selectedWarehouseId={selectedWarehouseId}
            selectedCustomerId={selectedCustomerId}
            selectedPaymentMethodId={selectedPaymentMethodId}
            issueDate={issueDate}
            dueDate={dueDate}
            taxMode={taxMode}
            invoiceStatus={invoiceStatus}
            discount={discount}
            amountPaid={amountPaid}
            onBranchChange={setSelectedBranchId}
            onWarehouseChange={setSelectedWarehouseId}
            onCustomerChange={setSelectedCustomerId}
            onPaymentMethodChange={changePaymentMethod}
            onIssueDateChange={setIssueDate}
            onDueDateChange={setDueDate}
            onTaxModeChange={setTaxMode}
            onInvoiceStatusChange={setInvoiceStatus}
            onDiscountChange={setDiscount}
            onAmountPaidChange={setAmountPaid}
            onOpenCustomerModal={() => setCustomerModalOpen(true)}
            onOpenBranchModal={() => setBranchModalOpen(true)}
            onOpenCustomFieldModal={() => setCustomFieldModalOpen(true)}
            onOpenProductModal={undefined}
            onChangeItem={changeItem}
            onAddItem={addItem}
            onRemoveItem={removeItem}
          />
        </div>
      </div>

      <AddCustomerModal open={customerModalOpen} onClose={() => setCustomerModalOpen(false)} onSave={saveCustomer} />
      <AddBranchModal open={branchModalOpen} onClose={() => setBranchModalOpen(false)} onSave={saveBranch} />
      <CustomFieldModal open={customFieldModalOpen} onClose={() => setCustomFieldModalOpen(false)} onSave={saveCustomField} />
      {selectedBranch && selectedWarehouse && selectedCustomer && selectedPaymentMethod ? (
        <InvoicePreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          branch={selectedBranch}
          warehouse={selectedWarehouse}
          customer={selectedCustomer}
          items={items}
          totals={totals}
          issueDate={issueDate}
          dueDate={dueDate}
          paymentMethod={selectedPaymentMethod}
          invoiceStatus={invoiceStatus}
        />
      ) : null}
    </main>
  );
}
