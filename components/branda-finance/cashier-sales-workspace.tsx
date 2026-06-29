"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileText, Languages, ScanLine, Search, ShieldCheck, Utensils } from "lucide-react";
import { CashierCartPanel, type CartItem } from "@/components/branda-finance/cashier-cart-panel";
import { EntitySelect } from "@/components/branda-finance/entity-select";
import { FinanceBackButton } from "@/components/branda-finance/finance-back-button";
import { LoyaltyScanModal } from "@/components/branda-finance/loyalty-scan-modal";
import { ProductGrid } from "@/components/branda-finance/product-grid";
import type { FinancePaymentMethod, FinanceProduct, FinanceWorkspaceData } from "@/lib/branda-finance/invoice-types";

type CashierSalesWorkspaceProps = {
  data: FinanceWorkspaceData;
  loyaltyEnabled?: boolean;
  realInvoicePersistenceReady?: boolean;
};

function searchProduct(product: FinanceProduct, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [product.name, product.englishName, product.sku, product.barcode, product.category, product.details]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

export function CashierSalesWorkspace({
  data,
  loyaltyEnabled = false,
  realInvoicePersistenceReady = false,
}: CashierSalesWorkspaceProps) {
  const [selectedBranchId, setSelectedBranchId] = useState(data.branches[0]?.id ?? "");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(data.warehouses[0]?.id ?? "");
  const [selectedCustomerId, setSelectedCustomerId] = useState(data.customers[0]?.id ?? "");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<FinancePaymentMethod["id"] | "">("");
  const [translationPreview, setTranslationPreview] = useState(false);
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const [loyaltyCode, setLoyaltyCode] = useState("");
  const [invoicePreviewReady, setInvoicePreviewReady] = useState(false);

  const selectedBranch = data.branches.find((branch) => branch.id === selectedBranchId) ?? data.branches[0];
  const selectedWarehouse = data.warehouses.find((warehouse) => warehouse.id === selectedWarehouseId) ?? data.warehouses[0];
  const selectedCustomer = data.customers.find((customer) => customer.id === selectedCustomerId) ?? data.customers[0];
  const cashierPaymentMethods = data.paymentMethods.filter((method) =>
    ["cash", "card", "mada", "transfer", "credit", ...(loyaltyEnabled ? ["loyalty_points"] : [])].includes(method.id),
  );

  const filteredProducts = useMemo(
    () =>
      data.products.filter((product) => {
        const categoryMatch = selectedCategory === "all" || product.category === selectedCategory;
        return categoryMatch && searchProduct(product, query);
      }),
    [data.products, query, selectedCategory],
  );

  function addToCart(product: FinanceProduct) {
    setInvoicePreviewReady(false);
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [...current, { product, quantity: 1, note: "" }];
    });
  }

  function changeQuantity(productId: string, quantity: number) {
    setInvoicePreviewReady(false);
    setCart((current) => current.map((item) => (item.product.id === productId ? { ...item, quantity } : item)));
  }

  function changeNote(productId: string, note: string) {
    setCart((current) => current.map((item) => (item.product.id === productId ? { ...item, note } : item)));
  }

  function increase(productId: string) {
    setInvoicePreviewReady(false);
    setCart((current) => current.map((item) => (item.product.id === productId ? { ...item, quantity: item.quantity + 1 } : item)));
  }

  function decrease(productId: string) {
    setInvoicePreviewReady(false);
    setCart((current) =>
      current.map((item) => (item.product.id === productId ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item)),
    );
  }

  function remove(productId: string) {
    setInvoicePreviewReady(false);
    setCart((current) => current.filter((item) => item.product.id !== productId));
  }

  return (
    <main dir="rtl" className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#F5EFE6] px-3 py-4 text-right text-[#2F241D] sm:px-4 lg:px-5">
      <div className="mx-auto grid w-full max-w-full min-w-0 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-4 overflow-hidden">
          <header className="min-w-0 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3 shadow-[0_16px_38px_rgba(69,43,28,0.08)] sm:p-4">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="mb-2">
                    <FinanceBackButton href="/dashboard/branda-finance" />
                  </div>
                  <p className="text-xs font-black text-[#9C6B2E]">برندا المالية</p>
                  <h1 className="mt-1 text-xl font-black text-[#2F241D] sm:text-2xl">المبيعات</h1>
                </div>
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  <div className="inline-flex h-9 w-fit items-center gap-1.5 rounded-[8px] border border-[#CFE2D8] bg-[#EDF7F2] px-2.5 text-[11px] font-black text-[#2F5D50]">
                    <ShieldCheck className="h-4 w-4" />
                    جلسة كاشير محلية بدون حفظ
                  </div>
                  <Link
                    href="/dashboard/branda-finance/invoicing/create?source=cashier"
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-[#5B3926] px-3 text-[12px] font-black text-white"
                  >
                    <FileText className="h-4 w-4" />
                    إنشاء فاتورة مبيعات
                  </Link>
                  <Link
                    href="/dashboard/branda-finance/hall-orders"
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-[#D6B677] bg-[#F8E8C9] px-3 text-[12px] font-black text-[#6B431C]"
                  >
                    <Utensils className="h-4 w-4" />
                    طلبات الصالة
                  </Link>
                </div>
              </div>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[160px_160px_180px_minmax(220px,1fr)]">
                <EntitySelect
                  label="الفرع"
                  value={selectedBranchId}
                  options={data.branches.map((branch) => ({ id: branch.id, label: branch.displayName || branch.name, meta: branch.city }))}
                  onChange={setSelectedBranchId}
                />
                <EntitySelect
                  label="المستودع"
                  value={selectedWarehouseId}
                  options={data.warehouses.map((warehouse) => ({ id: warehouse.id, label: warehouse.name, meta: warehouse.city }))}
                  onChange={setSelectedWarehouseId}
                />
                <EntitySelect
                  label="العميل"
                  value={selectedCustomerId}
                  options={data.customers.map((customer) => ({ id: customer.id, label: customer.name, meta: customer.paymentTerms }))}
                  onChange={setSelectedCustomerId}
                />
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-black text-[#6D5544]">بحث ذكي</span>
                  <span className="relative block">
                    <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9C8068]" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="اسم عربي، إنجليزي، SKU، باركود، تصنيف"
                      className="h-9 w-full min-w-0 rounded-[8px] border border-[#E1D1BD] bg-white px-9 text-[12px] font-bold text-[#2F241D] outline-none focus:border-[#B88334] focus:ring-2 focus:ring-[#D9A33F]/20"
                    />
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setTranslationPreview((value) => !value)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-[#D6B677] bg-[#F8E8C9] px-3 text-[12px] font-black text-[#6B431C]"
                >
                  <Languages className="h-4 w-4" />
                  ترجمة ذكية
                </button>
                {loyaltyEnabled ? (
                  <button
                    type="button"
                    onClick={() => setLoyaltyOpen(true)}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] border border-[#CFE2D8] bg-[#EDF7F2] px-3 text-[12px] font-black text-[#2F5D50]"
                  >
                    <ScanLine className="h-4 w-4" />
                    قراءة باركود الولاء
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <div className="min-w-0 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3 shadow-[0_16px_38px_rgba(69,43,28,0.08)]">
            <div className="flex min-w-0 flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`h-8 rounded-[8px] px-3 text-[12px] font-black ${
                  selectedCategory === "all" ? "bg-[#5B3926] text-white" : "border border-[#E1D1BD] bg-white text-[#5B3926]"
                }`}
              >
                الكل
              </button>
              {data.categories.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  onClick={() => setSelectedCategory(category.name)}
                  className={`h-8 rounded-[8px] px-3 text-[12px] font-black ${
                    selectedCategory === category.name ? "bg-[#5B3926] text-white" : "border border-[#E1D1BD] bg-white text-[#5B3926]"
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          {translationPreview ? (
            <div className="rounded-[8px] border border-[#D6B677] bg-[#FFF8EA] p-3 text-[12px] font-bold leading-6 text-[#6B431C]">
              الترجمة الذكية ستعمل لاحقًا عند ربط مزود الترجمة. المنتجات التي تملك اسمًا إنجليزيًا تعرضه الآن مباشرة بدون أي اتصال خارجي.
            </div>
          ) : null}

          <ProductGrid
            products={filteredProducts}
            showTranslationPreview={translationPreview}
            emptyMessage={data.products.length ? "لا توجد منتجات مطابقة للبحث الحالي." : "لا توجد منتجات مربوطة بهذه العلامة بعد"}
            onAdd={addToCart}
          />
        </section>

        {selectedCustomer && selectedBranch ? (
          <CashierCartPanel
            items={cart}
            customer={selectedCustomer}
            branch={selectedBranch}
            warehouse={selectedWarehouse}
            paymentMethod={paymentMethod}
            paymentMethods={cashierPaymentMethods}
            loyaltyCode={loyaltyCode}
            loyaltyEnabled={loyaltyEnabled}
            invoicePreviewReady={invoicePreviewReady}
            realInvoicePersistenceReady={realInvoicePersistenceReady}
            onPaymentMethodChange={setPaymentMethod}
            onIncrease={increase}
            onDecrease={decrease}
            onQuantityChange={changeQuantity}
            onNoteChange={changeNote}
            onRemove={remove}
            onCreateInvoicePreview={() => setInvoicePreviewReady(true)}
            onOpenLoyalty={() => setLoyaltyOpen(true)}
          />
        ) : null}
      </div>

      {loyaltyEnabled ? (
        <LoyaltyScanModal open={loyaltyOpen} onClose={() => setLoyaltyOpen(false)} onApply={setLoyaltyCode} />
      ) : null}
    </main>
  );
}
