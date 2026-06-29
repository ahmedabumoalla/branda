"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FinanceBackButton } from "@/components/branda-finance/finance-back-button";
import { formatFinanceAmount } from "@/components/branda-finance/invoice-totals";
import { LocalProductModal } from "@/components/branda-finance/local-product-modal";
import type { FinanceProduct, FinanceWorkspaceData } from "@/lib/branda-finance/invoice-types";

type PurchaseLine = {
  id: string;
  productId: string;
  quantity: number;
  cost: number;
  taxRate: number;
  warehouseId: string;
  inventoryAccountId: string;
  costAccountId: string;
  costCenterId: string;
};

type PurchaseInvoiceWorkspaceProps = {
  data: FinanceWorkspaceData;
};

const inputClass =
  "h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-bold text-[#2F241D] outline-none focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20";

function createLine(product: FinanceProduct, data: FinanceWorkspaceData): PurchaseLine {
  return {
    id: `purchase-line-${Date.now()}-${product.id}`,
    productId: product.id,
    quantity: 1,
    cost: product.cost ?? Math.round(product.price * 0.42),
    taxRate: product.vatRate,
    warehouseId: product.defaultWarehouseId ?? data.warehouses[0]?.id ?? "",
    inventoryAccountId: product.inventoryAccountId ?? data.accounts[0]?.id ?? "",
    costAccountId: product.costAccountId ?? data.accounts[0]?.id ?? "",
    costCenterId: product.costCenterId ?? "cc-main",
  };
}

export function PurchaseInvoiceWorkspace({ data }: PurchaseInvoiceWorkspaceProps) {
  const [products, setProducts] = useState(data.products);
  const [supplierId, setSupplierId] = useState(data.suppliers[0]?.id ?? "");
  const [branchId, setBranchId] = useState(data.branches[0]?.id ?? "");
  const [modalOpen, setModalOpen] = useState(false);
  const [lines, setLines] = useState<PurchaseLine[]>(() => data.products.slice(0, 2).map((product) => createLine(product, data)));

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.cost, 0);
    const vat = lines.reduce((sum, line) => sum + line.quantity * line.cost * (line.taxRate / 100), 0);
    return { subtotal, vat, total: subtotal + vat };
  }, [lines]);

  function changeLine(id: string, patch: Partial<PurchaseLine>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function addLine(product = products[0]) {
    if (!product) return;
    setLines((current) => [...current, createLine(product, data)]);
  }

  function saveProduct(product: FinanceProduct) {
    setProducts((current) => [product, ...current]);
    setLines((current) => [...current, createLine(product, data)]);
  }

  return (
    <main dir="rtl" className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#F5EFE6] px-3 py-4 text-right text-[#2F241D] sm:px-4 lg:px-5">
      <div className="mx-auto flex w-full max-w-full min-w-0 flex-col gap-4 overflow-hidden">
        <header className="min-w-0 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3 shadow-[0_16px_38px_rgba(69,43,28,0.08)] sm:p-4">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <FinanceBackButton href="/dashboard/branda-finance" />
              <p className="mt-3 text-[11px] font-black text-[#9C6B2E]">برندا المالية</p>
              <h1 className="mt-1 text-xl font-black text-[#2F241D] sm:text-2xl">فاتورة مشتريات</h1>
              <p className="mt-1.5 text-[12px] font-bold leading-5 text-[#7D6654]">مساحة شراء محلية تربط المنتج بالمورد والمستودع والحسابات ومركز التكلفة بدون أي كتابة قاعدة بيانات.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setModalOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#CFE2D8] bg-[#EDF7F2] px-3 text-[12px] font-black text-[#2F5D50]">
                <Plus className="h-4 w-4" />
                إضافة منتج جديد
              </button>
              <button type="button" className="h-9 rounded-[8px] bg-[#2F5D50] px-3 text-[12px] font-black text-white">حفظ كمسودة محلية</button>
            </div>
          </div>
        </header>

        <section className="grid min-w-0 gap-3 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="المورد">
            <select className={inputClass} value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              {data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </Field>
          <Field label="الفرع">
            <select className={inputClass} value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              {data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.displayName || branch.name}</option>)}
            </select>
          </Field>
          <Field label="تاريخ الفاتورة"><input type="date" className={inputClass} defaultValue="2026-06-28" /></Field>
          <Field label="المرجع"><input className={inputClass} defaultValue="PINV-DEMO-001" /></Field>
        </section>

        <section className="min-w-0 overflow-hidden rounded-[8px] border border-[#E1D1BD] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFE3D2] bg-[#FFFDF8] p-3">
            <div>
              <h2 className="text-[14px] font-black text-[#2F241D]">بنود المشتريات والمنتجات</h2>
              <p className="mt-1 text-[11px] font-bold text-[#806A58]">التمرير الأفقي داخل البطاقة فقط عند ضيق الشاشة.</p>
            </div>
            <button type="button" onClick={() => addLine()} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#D6B677] bg-[#F8E8C9] px-3 text-[11px] font-black text-[#6B431C]">
              <Plus className="h-4 w-4" />
              إضافة بند
            </button>
          </div>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[1120px] table-fixed text-right text-[12px]">
              <colgroup>
                <col className="w-[260px]" />
                <col className="w-[90px]" />
                <col className="w-[110px]" />
                <col className="w-[120px]" />
                <col className="w-[160px]" />
                <col className="w-[170px]" />
                <col className="w-[170px]" />
                <col className="w-[120px]" />
                <col className="w-[60px]" />
              </colgroup>
              <thead className="bg-[#F4E8D8] text-[11px] font-black text-[#674C38]">
                <tr>
                  <th className="px-2.5 py-2.5">المنتج</th>
                  <th className="px-2.5 py-2.5">الكمية</th>
                  <th className="px-2.5 py-2.5">تكلفة الشراء</th>
                  <th className="px-2.5 py-2.5">الضريبة</th>
                  <th className="px-2.5 py-2.5">مستودع الاستلام</th>
                  <th className="px-2.5 py-2.5">حساب المخزون</th>
                  <th className="px-2.5 py-2.5">حساب تكلفة المبيعات</th>
                  <th className="px-2.5 py-2.5">الإجمالي</th>
                  <th className="px-2.5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE3D2]">
                {lines.map((line) => {
                  const product = products.find((item) => item.id === line.productId) ?? products[0];
                  const lineTotal = line.quantity * line.cost * (1 + line.taxRate / 100);
                  return (
                    <tr key={line.id} className="align-top hover:bg-[#FFF8EA]">
                      <td className="px-2.5 py-2.5">
                        <select className={inputClass} value={line.productId} onChange={(event) => {
                          const nextProduct = products.find((item) => item.id === event.target.value);
                          if (nextProduct) changeLine(line.id, { productId: nextProduct.id, cost: nextProduct.cost ?? Math.round(nextProduct.price * 0.42), taxRate: nextProduct.vatRate });
                        }}>
                          {products.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.sku}</option>)}
                        </select>
                        <p className="mt-1 truncate text-[10px] font-bold text-[#806A58]">{product?.category}</p>
                      </td>
                      <td className="px-2.5 py-2.5"><input type="number" min="1" className={inputClass} value={line.quantity} onChange={(event) => changeLine(line.id, { quantity: Math.max(1, Number(event.target.value) || 1) })} /></td>
                      <td className="px-2.5 py-2.5"><input type="number" min="0" className={inputClass} value={line.cost} onChange={(event) => changeLine(line.id, { cost: Math.max(0, Number(event.target.value) || 0) })} /></td>
                      <td className="px-2.5 py-2.5">
                        <select className={inputClass} value={line.taxRate} onChange={(event) => changeLine(line.id, { taxRate: Number(event.target.value) })}>
                          {data.taxRates.map((tax) => <option key={tax.id} value={tax.rate}>{tax.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2.5 py-2.5">
                        <select className={inputClass} value={line.warehouseId} onChange={(event) => changeLine(line.id, { warehouseId: event.target.value })}>
                          {data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2.5 py-2.5"><AccountSelect accounts={data.accounts} value={line.inventoryAccountId} onChange={(value) => changeLine(line.id, { inventoryAccountId: value })} /></td>
                      <td className="px-2.5 py-2.5"><AccountSelect accounts={data.accounts} value={line.costAccountId} onChange={(value) => changeLine(line.id, { costAccountId: value })} /></td>
                      <td className="px-2.5 py-2.5 font-black" dir="ltr">{formatFinanceAmount(lineTotal)}</td>
                      <td className="px-2.5 py-2.5">
                        <button type="button" onClick={() => setLines((current) => current.length > 1 ? current.filter((item) => item.id !== line.id) : current)} className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#E6CFC8] bg-[#FFF7F4] text-[#9B3327]">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
            <h2 className="text-[14px] font-black text-[#2F241D]">معاينة القيد المحاسبي</h2>
            <div className="mt-3 grid gap-2 text-[12px] font-bold text-[#4A3528]">
              <PreviewLine label="Dr المخزون / المصروف" value={totals.subtotal} />
              <PreviewLine label="Dr ضريبة مدخلات" value={totals.vat} />
              <PreviewLine label="Cr المورد" value={totals.total} />
            </div>
          </div>
          <div className="min-w-0 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3">
            <h2 className="text-[14px] font-black text-[#2F241D]">ملخص الفاتورة</h2>
            <div className="mt-3 space-y-2 text-[12px]">
              <PreviewLine label="الإجمالي قبل الضريبة" value={totals.subtotal} />
              <PreviewLine label="ضريبة المدخلات" value={totals.vat} />
              <PreviewLine label="الإجمالي" value={totals.total} strong />
            </div>
          </div>
        </section>
      </div>
      <LocalProductModal
        open={modalOpen}
        mode="purchase"
        categories={data.categories}
        accounts={data.accounts}
        warehouses={data.warehouses}
        taxRates={data.taxRates}
        suppliers={data.suppliers}
        onClose={() => setModalOpen(false)}
        onSave={saveProduct}
      />
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-black text-[#6D5544]">{label}</span>
      {children}
    </label>
  );
}

function AccountSelect({ accounts, value, onChange }: { accounts: { id: string; code: string; name: string }[]; value: string; onChange: (value: string) => void }) {
  return (
    <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
      {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
    </select>
  );
}

function PreviewLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center justify-between gap-3 ${strong ? "border-t border-[#E6D7C3] pt-2 text-[15px] font-black text-[#2F241D]" : ""}`}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 font-black" dir="ltr">{formatFinanceAmount(value)}</span>
    </div>
  );
}
