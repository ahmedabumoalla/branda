import { InvoiceItemsTable } from "@/components/branda-finance/invoice-items-table";
import { InvoiceTotals } from "@/components/branda-finance/invoice-totals";
import { EntitySelect } from "@/components/branda-finance/entity-select";
import type {
  BrandaFinanceAccount,
  BrandaFinanceBranch,
  BrandaFinanceCustomField,
  BrandaFinanceCustomer,
  BrandaFinanceInvoiceLine,
  BrandaFinancePaymentMethod,
  BrandaFinanceProduct,
  BrandaFinanceTaxRate,
  BrandaFinanceWarehouse,
} from "@/lib/branda-finance/invoice-types";

type InvoiceFormProps = {
  branches: BrandaFinanceBranch[];
  customers: BrandaFinanceCustomer[];
  warehouses: BrandaFinanceWarehouse[];
  products: BrandaFinanceProduct[];
  accounts: BrandaFinanceAccount[];
  taxRates: BrandaFinanceTaxRate[];
  customFields: BrandaFinanceCustomField[];
  paymentMethods: { id: BrandaFinancePaymentMethod; label: string }[];
  branchId: string;
  customerId: string;
  warehouseId: string;
  issueDate: string;
  dueDate: string;
  taxMode: string;
  paymentMethod: BrandaFinancePaymentMethod;
  lines: BrandaFinanceInvoiceLine[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  onBranchChange: (value: string) => void;
  onCustomerChange: (value: string) => void;
  onWarehouseChange: (value: string) => void;
  onIssueDateChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onTaxModeChange: (value: string) => void;
  onPaymentMethodChange: (value: BrandaFinancePaymentMethod) => void;
  onOpenCustomerModal: () => void;
  onOpenBranchModal: () => void;
  onOpenCustomFieldModal: () => void;
  onLineChange: (lineId: string, patch: Partial<BrandaFinanceInvoiceLine>) => void;
  onAddLine: () => void;
  onRemoveLine: (lineId: string) => void;
};

export function InvoiceForm(props: InvoiceFormProps) {
  return (
    <section className="rounded-[24px] border border-[#E1CFB8] bg-[#FCF8F3] p-5 shadow-[0_20px_60px_rgba(49,25,18,0.08)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black text-[#B7791F]">Branda Finance</p>
          <h2 className="text-2xl font-black text-[#311912]">إنشاء فاتورة</h2>
          <p className="mt-1 text-sm font-bold text-[#806A5E]">مسودة تفاعلية محلية بدون اعتماد محاسبي فعلي.</p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#3A2117]">
          INV-000101
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <EntitySelect
          label="جهة الإصدار / الفرع"
          value={props.branchId}
          options={props.branches.map((branch) => ({ id: branch.id, label: branch.displayName, meta: branch.city }))}
          onChange={props.onBranchChange}
          actionLabel="إضافة فرع"
          onAction={props.onOpenBranchModal}
        />
        <EntitySelect
          label="العميل"
          value={props.customerId}
          options={props.customers.map((customer) => ({ id: customer.id, label: customer.name, meta: customer.phone }))}
          onChange={props.onCustomerChange}
          actionLabel="إضافة عميل"
          onAction={props.onOpenCustomerModal}
        />
        <EntitySelect
          label="المستودع"
          value={props.warehouseId}
          options={props.warehouses.map((warehouse) => ({ id: warehouse.id, label: warehouse.name, meta: warehouse.city }))}
          onChange={props.onWarehouseChange}
        />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-5">
        <Field label="تاريخ الإصدار" type="date" value={props.issueDate} onChange={props.onIssueDateChange} />
        <Field label="تاريخ الاستحقاق" type="date" value={props.dueDate} onChange={props.onDueDateChange} />
        <Field label="العملة" value="SAR" onChange={() => undefined} disabled />
        <label className="grid gap-2 text-sm font-black text-[#3A2117] xl:col-span-2">
          <span>وضع الضريبة</span>
          <select value={props.taxMode} onChange={(event) => props.onTaxModeChange(event.target.value)} className="h-11 rounded-2xl border border-[#E7D7C6] bg-white px-3 font-bold outline-none">
            <option value="exclusive">السعر غير شامل الضريبة</option>
            <option value="inclusive">السعر شامل الضريبة</option>
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-2xl border border-[#E7D7C6] bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-black text-[#311912]">الحقول المخصصة</h3>
          <button type="button" onClick={props.onOpenCustomFieldModal} className="rounded-full bg-[#3A2117] px-4 py-2 text-xs font-black text-white">
            إضافة حقل مخصص
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {props.customFields.map((field) => (
            <Field key={field.id} label={field.name} value={field.value ?? ""} onChange={() => undefined} placeholder={field.fieldType === "date" ? "yyyy-mm-dd" : ""} />
          ))}
        </div>
      </div>

      <div className="mt-5">
        <InvoiceItemsTable
          lines={props.lines}
          products={props.products}
          accounts={props.accounts}
          taxRates={props.taxRates}
          onChangeLine={props.onLineChange}
          onAddLine={props.onAddLine}
          onRemoveLine={props.onRemoveLine}
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-[#E7D7C6] bg-white p-4">
          <h3 className="mb-3 font-black text-[#311912]">طريقة الدفع</h3>
          <div className="grid gap-2 sm:grid-cols-5">
            {props.paymentMethods.map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => props.onPaymentMethodChange(method.id)}
                className={`rounded-2xl px-3 py-3 text-sm font-black transition ${
                  props.paymentMethod === method.id ? "bg-[#3A2117] text-white" : "bg-[#FCF8F3] text-[#6B3A25]"
                }`}
              >
                {method.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs font-bold text-[#806A5E]">سيتم لاحقًا ربط الاختيار بقيود Branda Finance والدرج النقدي ومزود البطاقة.</p>
        </div>
        <InvoiceTotals subtotal={props.subtotal} discount={props.discount} vat={props.vat} total={props.total} />
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-black text-[#3A2117]">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-2xl border border-[#E7D7C6] bg-white px-3 font-bold outline-none disabled:bg-[#F7EFE5] disabled:text-[#806A5E]"
      />
    </label>
  );
}
