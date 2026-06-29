"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceProduct,
  FinanceSupplier,
  FinanceTaxRate,
  FinanceWarehouse,
} from "@/lib/branda-finance/invoice-types";

type LocalProductModalMode = "sales" | "purchase";

type LocalProductModalProps = {
  open: boolean;
  mode: LocalProductModalMode;
  categories: FinanceCategory[];
  accounts: FinanceAccount[];
  warehouses: FinanceWarehouse[];
  taxRates: FinanceTaxRate[];
  suppliers?: FinanceSupplier[];
  onClose: () => void;
  onSave: (product: FinanceProduct) => void;
};

const fieldClass =
  "h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-bold text-[#2F241D] outline-none focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20";

export function LocalProductModal({
  open,
  mode,
  categories,
  accounts,
  warehouses,
  taxRates,
  suppliers = [],
  onClose,
  onSave,
}: LocalProductModalProps) {
  const [name, setName] = useState("");
  const [englishName, setEnglishName] = useState("");
  const [category, setCategory] = useState(categories[0]?.name ?? "");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [price, setPrice] = useState(24);
  const [cost, setCost] = useState(10);
  const [vatRate, setVatRate] = useState(taxRates[0]?.rate ?? 15);
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [costAccountId, setCostAccountId] = useState(accounts[0]?.id ?? "");
  const [inventoryAccountId, setInventoryAccountId] = useState(accounts[0]?.id ?? "");
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [purchaseUnit, setPurchaseUnit] = useState("حبة");
  const [costCenterId, setCostCenterId] = useState("cc-main");
  const [pointsEarned, setPointsEarned] = useState(3);
  const [pointsRequired, setPointsRequired] = useState(120);
  const [earnEligible, setEarnEligible] = useState(true);
  const [redeemEligible, setRedeemEligible] = useState(true);

  if (!open) return null;

  function save() {
    const safeName = name.trim() || (mode === "sales" ? "منتج بيع جديد" : "منتج شراء جديد");
    const product: FinanceProduct = {
      id: `local-product-${Date.now()}`,
      name: safeName,
      englishName: englishName.trim() || "New local product",
      details: "منتج ديمو محلي تمت إضافته من واجهة الفاتورة بدون كتابة في قاعدة البيانات.",
      category: category || categories[0]?.name || "عام",
      sku: sku.trim() || `LOCAL-${Date.now().toString().slice(-5)}`,
      barcode: barcode.trim() || `8800${Date.now().toString().slice(-6)}`,
      price: Math.max(0, price),
      cost: Math.max(0, cost),
      vatRate,
      stock: 20,
      accountId: accountId || accounts[0]?.id || "sales-food",
      costAccountId,
      inventoryAccountId,
      defaultSupplierId: supplierId,
      purchaseUnit,
      defaultWarehouseId: warehouseId,
      costCenterId,
      loyaltyPointsEarned: Math.max(0, pointsEarned),
      loyaltyPointsRequired: Math.max(0, pointsRequired),
      loyaltyEarnEligible: earnEligible,
      loyaltyRedeemEligible: redeemEligible,
      revenueRecognition: "عند إصدار الفاتورة",
    };
    onSave(product);
    onClose();
  }

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-stretch justify-center overflow-hidden bg-[#2F241D]/45 p-0 text-right text-[#2F241D] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-[min(96vw,980px)] min-w-0 flex-col overflow-hidden bg-[#FFFDF8] shadow-[0_24px_70px_rgba(47,36,29,0.24)] sm:max-h-[92vh] sm:rounded-[8px] sm:border sm:border-[#D8C3A2]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#E8D8C2] px-3 py-3 sm:px-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black text-[#9C6B2E]">إضافة محلية فقط</p>
            <h2 className="truncate text-lg font-black text-[#2F241D]">إضافة منتج جديد</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#E6CFC8] bg-[#FFF7F4] text-[#9B3327]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="اسم المنتج عربي"><input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field label="اسم المنتج إنجليزي"><input className={fieldClass} value={englishName} onChange={(event) => setEnglishName(event.target.value)} /></Field>
            <Field label="التصنيف">
              <select className={fieldClass} value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="SKU"><input className={fieldClass} value={sku} onChange={(event) => setSku(event.target.value)} /></Field>
            <Field label="الباركود"><input className={fieldClass} value={barcode} onChange={(event) => setBarcode(event.target.value)} /></Field>
            <Field label="سعر البيع"><input type="number" className={fieldClass} value={price} onChange={(event) => setPrice(Number(event.target.value) || 0)} /></Field>
            <Field label={mode === "purchase" ? "تكلفة الشراء" : "التكلفة"}><input type="number" className={fieldClass} value={cost} onChange={(event) => setCost(Number(event.target.value) || 0)} /></Field>
            <Field label="الضريبة">
              <select className={fieldClass} value={vatRate} onChange={(event) => setVatRate(Number(event.target.value))}>
                {taxRates.map((tax) => <option key={tax.id} value={tax.rate}>{tax.name}</option>)}
              </select>
            </Field>
            <Field label={mode === "purchase" ? "مستودع الاستلام" : "المستودع"}>
              <select className={fieldClass} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </Field>
            <Field label="الحساب المحاسبي">
              <select className={fieldClass} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
              </select>
            </Field>
            <Field label="مركز التكلفة">
              <select className={fieldClass} value={costCenterId} onChange={(event) => setCostCenterId(event.target.value)}>
                <option value="cc-main">تشغيل الفرع الرئيسي</option>
                <option value="cc-marketing">تسويق العروض</option>
                <option value="cc-delivery">تجهيز التوصيل</option>
              </select>
            </Field>
            {mode === "purchase" ? (
              <>
                <Field label="المورد الافتراضي">
                  <select className={fieldClass} value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </Field>
                <Field label="وحدة الشراء"><input className={fieldClass} value={purchaseUnit} onChange={(event) => setPurchaseUnit(event.target.value)} /></Field>
                <Field label="حساب المخزون">
                  <select className={fieldClass} value={inventoryAccountId} onChange={(event) => setInventoryAccountId(event.target.value)}>
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
                  </select>
                </Field>
                <Field label="حساب تكلفة المبيعات">
                  <select className={fieldClass} value={costAccountId} onChange={(event) => setCostAccountId(event.target.value)}>
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
                  </select>
                </Field>
              </>
            ) : (
              <>
                <Field label="نقاط الولاء المكتسبة"><input type="number" className={fieldClass} value={pointsEarned} onChange={(event) => setPointsEarned(Number(event.target.value) || 0)} /></Field>
                <Field label="نقاط الاستبدال المطلوبة"><input type="number" className={fieldClass} value={pointsRequired} onChange={(event) => setPointsRequired(Number(event.target.value) || 0)} /></Field>
                <label className="flex min-h-9 items-center gap-2 rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-black text-[#5B3926]">
                  <input type="checkbox" checked={earnEligible} onChange={(event) => setEarnEligible(event.target.checked)} />
                  مؤهل لكسب النقاط
                </label>
                <label className="flex min-h-9 items-center gap-2 rounded-[8px] border border-[#E1D1BD] bg-white px-2 text-[12px] font-black text-[#5B3926]">
                  <input type="checkbox" checked={redeemEligible} onChange={(event) => setRedeemEligible(event.target.checked)} />
                  مؤهل للاستبدال بالنقاط
                </label>
              </>
            )}
          </div>
          <p className="mt-3 rounded-[8px] border border-[#D6B677] bg-[#FFF8EA] p-3 text-[12px] font-bold leading-6 text-[#6B431C]">
            الحفظ هنا يضيف المنتج إلى واجهة المعاينة فقط، ويجعله قابلاً للاختيار فوراً داخل الفاتورة الحالية بدون أي كتابة في قاعدة البيانات.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[#E8D8C2] p-3">
          <button type="button" onClick={onClose} className="h-9 rounded-[8px] border border-[#D8C7B2] bg-white px-4 text-[12px] font-black text-[#5B3926]">إلغاء</button>
          <button type="button" onClick={save} className="h-9 rounded-[8px] bg-[#2F5D50] px-4 text-[12px] font-black text-white">حفظ محلي</button>
        </div>
      </div>
    </div>
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
