"use client";

import { Languages, ScanLine, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CashierCartPanel, type CashierCartItem } from "@/components/branda-finance/cashier-cart-panel";
import { EntitySelect } from "@/components/branda-finance/entity-select";
import { LoyaltyScanModal } from "@/components/branda-finance/loyalty-scan-modal";
import { ProductGrid } from "@/components/branda-finance/product-grid";
import type {
  BrandaFinanceDataset,
  BrandaFinancePaymentMethod,
  BrandaFinanceProduct,
} from "@/lib/branda-finance/invoice-types";

type CashierSalesWorkspaceProps = {
  dataset: BrandaFinanceDataset;
};

export function CashierSalesWorkspace({ dataset }: CashierSalesWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [branchId, setBranchId] = useState(dataset.branches[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(dataset.warehouses[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(dataset.customers[1]?.id ?? dataset.customers[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<BrandaFinancePaymentMethod | "">("");
  const [cart, setCart] = useState<CashierCartItem[]>([]);
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const [loyaltyCode, setLoyaltyCode] = useState("");
  const [translationMessage, setTranslationMessage] = useState("");

  const categories = useMemo(() => ["all", ...Array.from(new Set(dataset.products.map((product) => product.category)))], [dataset.products]);
  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return dataset.products.filter((product) => {
      const categoryMatch = category === "all" || product.category === category;
      const haystack = [product.name, product.englishName, product.sku, product.barcode, product.category].filter(Boolean).join(" ").toLowerCase();
      return categoryMatch && (!normalized || haystack.includes(normalized));
    });
  }, [category, dataset.products, query]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const vat = subtotal * 0.15;
    return { subtotal, vat, total: subtotal + vat };
  }, [cart]);

  const selectedBranch = dataset.branches.find((branch) => branch.id === branchId);
  const selectedWarehouse = dataset.warehouses.find((warehouse) => warehouse.id === warehouseId);
  const selectedCustomer = dataset.customers.find((customer) => customer.id === customerId);

  function addProduct(product: BrandaFinanceProduct) {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) => (item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...current, { product, quantity: 1 }];
    });
  }

  function setQuantity(productId: string, quantity: number) {
    setCart((current) => current.map((item) => (item.product.id === productId ? { ...item, quantity: Math.max(1, quantity) } : item)));
  }

  function showTranslationPreview() {
    const missing = dataset.products.some((product) => !product.englishName);
    setTranslationMessage(
      missing
        ? "الترجمة الذكية ستعمل لاحقًا عند ربط مزود الترجمة"
        : "كل المنتجات الحالية تحتوي اسمًا إنجليزيًا جاهزًا للعرض"
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#F8F1E7] p-4 text-[#311912] lg:p-6">
      <div className="mb-4 grid gap-3 rounded-[24px] border border-[#E1CFB8] bg-white p-4 shadow-[0_14px_40px_rgba(49,25,18,0.07)] xl:grid-cols-[220px_220px_1fr_auto_auto]">
        <EntitySelect
          label="الفرع"
          value={branchId}
          options={dataset.branches.map((branch) => ({ id: branch.id, label: branch.displayName, meta: branch.city }))}
          onChange={setBranchId}
        />
        <EntitySelect
          label="المستودع"
          value={warehouseId}
          options={dataset.warehouses.map((warehouse) => ({ id: warehouse.id, label: warehouse.name, meta: warehouse.city }))}
          onChange={setWarehouseId}
        />
        <label className="grid gap-2 text-sm font-black text-[#3A2117]">
          <span>بحث ذكي</span>
          <span className="flex h-11 items-center gap-2 rounded-2xl border border-[#E7D7C6] bg-[#FCF8F3] px-3">
            <Search className="h-4 w-4 text-[#806A5E]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="اسم عربي، إنجليزي، SKU، باركود، تصنيف"
              className="h-full flex-1 bg-transparent font-bold outline-none"
            />
          </span>
        </label>
        <button type="button" onClick={showTranslationPreview} className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#FCF8F3] px-4 font-black text-[#6B3A25]">
          <Languages className="h-4 w-4" />
          ترجمة ذكية
        </button>
        <button type="button" onClick={() => setLoyaltyOpen(true)} className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#3A2117] px-4 font-black text-white">
          <ScanLine className="h-4 w-4" />
          قراءة باركود الولاء
        </button>
      </div>

      {translationMessage ? (
        <p className="mb-4 rounded-2xl border border-[#E7D7C6] bg-white px-4 py-3 text-sm font-black text-[#6B3A25]">{translationMessage}</p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={`rounded-full px-4 py-2 text-sm font-black ${
              category === item ? "bg-[#3A2117] text-white" : "border border-[#E7D7C6] bg-white text-[#6B3A25]"
            }`}
          >
            {item === "all" ? "كل التصنيفات" : item}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_390px]">
        <main>
          <ProductGrid products={filteredProducts} onAdd={addProduct} />
        </main>
        <CashierCartPanel
          items={cart}
          customer={selectedCustomer}
          branch={selectedBranch}
          warehouse={selectedWarehouse}
          paymentMethod={paymentMethod}
          loyaltyCode={loyaltyCode}
          subtotal={totals.subtotal}
          vat={totals.vat}
          total={totals.total}
          onSetPaymentMethod={setPaymentMethod}
          onIncrement={(productId) => setQuantity(productId, (cart.find((item) => item.product.id === productId)?.quantity ?? 0) + 1)}
          onDecrement={(productId) => setQuantity(productId, (cart.find((item) => item.product.id === productId)?.quantity ?? 1) - 1)}
          onSetQuantity={setQuantity}
          onRemove={(productId) => setCart((current) => current.filter((item) => item.product.id !== productId))}
          onOpenLoyalty={() => setLoyaltyOpen(true)}
        />
      </div>

      <LoyaltyScanModal
        open={loyaltyOpen}
        onClose={() => setLoyaltyOpen(false)}
        onApply={(code) => {
          setLoyaltyCode(code.trim());
          setLoyaltyOpen(false);
        }}
      />
    </div>
  );
}
