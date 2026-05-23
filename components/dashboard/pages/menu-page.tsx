"use client";

import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MenuProductCard } from "@/components/dashboard/menu/product-card";
import { MenuProductFormModal } from "@/components/dashboard/menu/product-modal";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  FilterBar,
  NeumoInput,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { MENU_CATEGORIES, type MenuCategory, type MenuProduct } from "@/lib/mock/menu";

const STORAGE_KEY = "branda_qatrah_menu";

type Props = {
  initialProducts: MenuProduct[];
};

export function MenuPageClient({ initialProducts }: Props) {
  const [products, setProducts] = useState<MenuProduct[]>(initialProducts);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MenuCategory | "الكل">("الكل");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MenuProduct | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setProducts(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchQuery =
        p.name.includes(query) ||
        p.description.includes(query) ||
        p.category.includes(query);

      const matchCategory = category === "الكل" || p.category === category;

      return matchQuery && matchCategory;
    });
  }, [products, query, category]);

  const availableCount = products.filter((p) => p.available).length;

  function saveProduct(product: MenuProduct) {
    if (product.id) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
    } else {
      setProducts((prev) => [{ ...product, id: crypto.randomUUID() }, ...prev]);
    }
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="المنيو الرقمي"
        subtitle="أي منتج تضيفه هنا يظهر في صفحة الكوفي للعميل."
        action={
          <PrimaryButton
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="inline-flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            إضافة منتج
          </PrimaryButton>
        }
      >
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="إجمالي المنتجات" value={products.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="متاح للبيع" value={availableCount} />
          </BentoCard>
          <BentoCard variant="white" span="2">
            <StatPill label="نتائج البحث" value={filtered.length} hint="حسب الفلتر الحالي" />
          </BentoCard>
        </BentoGrid>

        <FilterBar>
          <div className="relative flex-1">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7A6255]" />
            <NeumoInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم المنتج أو التصنيف..."
              className="pr-12"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {["الكل", ...MENU_CATEGORIES].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c as MenuCategory | "الكل")}
                className={`rounded-2xl px-5 py-3 text-sm font-black ${
                  category === c
                    ? "bg-[#3A2117] text-[#F8F4EF]"
                    : "bg-[#F8F4EF] text-[#3A2117]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </FilterBar>

        <BentoGrid>
          <BentoCard variant="white" span="4">
            <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((product) => (
                <MenuProductCard
                  key={product.id}
                  product={product}
                  freeProductLabel={
                    product.promo?.freeProductId
                      ? products.find((p) => p.id === product.promo?.freeProductId)?.name
                      : undefined
                  }
                  onEdit={() => {
                    setEditing(product);
                    setOpen(true);
                  }}
                  onToggleAvailability={() => {
                    setProducts((prev) =>
                      prev.map((p) =>
                        p.id === product.id ? { ...p, available: !p.available } : p
                      )
                    );
                  }}
                  onDelete={() => {
                    setProducts((prev) => prev.filter((p) => p.id !== product.id));
                  }}
                />
              ))}
            </section>
          </BentoCard>
        </BentoGrid>

        <MenuProductFormModal
          open={open}
          mode={editing ? "edit" : "add"}
          editingProduct={editing}
          productList={products}
          onClose={() => setOpen(false)}
          onSave={saveProduct}
        />
      </DashboardPageShell>
    </div>
  );
}
