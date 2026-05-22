"use client";

import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MenuProductCard } from "@/components/dashboard/menu/product-card";
import { MenuProductFormModal } from "@/components/dashboard/menu/product-modal";
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

  function saveProduct(product: MenuProduct) {
    if (product.id) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
    } else {
      setProducts((prev) => [{ ...product, id: crypto.randomUUID() }, ...prev]);
    }
  }

  return (
    <div className="min-h-screen px-6 py-8">
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-black text-[#8B5E3C]">لوحة برندة</p>
          <h1 className="mt-2 text-4xl font-black text-[#3A2117]">
            المنيو الرقمي
          </h1>
          <p className="mt-2 text-[#7A6255]">
            أي منتج تضيفه هنا يظهر في صفحة الكوفي للعميل.
          </p>
        </div>

        <button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#3A2117] px-6 py-4 font-black text-[#F8E8D2] shadow-lg"
        >
          <Plus className="h-5 w-5" />
          إضافة منتج
        </button>
      </header>

      <section className="mb-8 rounded-3xl border border-[#E5D8CD] bg-white/80 p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8A7062]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم المنتج أو التصنيف..."
              className="h-14 w-full rounded-2xl border border-[#E5D8CD] bg-white pr-12 pl-4 text-right font-bold outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {["الكل", ...MENU_CATEGORIES].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c as MenuCategory | "الكل")}
                className={`rounded-2xl px-5 py-3 text-sm font-black ${
                  category === c
                    ? "bg-[#3A2117] text-[#F8E8D2]"
                    : "bg-[#F8F4EF] text-[#3A2117]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </section>

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

      <MenuProductFormModal
        open={open}
        mode={editing ? "edit" : "add"}
        editingProduct={editing}
        productList={products}
        onClose={() => setOpen(false)}
        onSave={saveProduct}
      />
    </div>
  );
}