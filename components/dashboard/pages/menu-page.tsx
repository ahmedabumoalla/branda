"use client";

import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CategoryManager } from "@/components/dashboard/menu/category-manager";
import { MenuProductCard } from "@/components/dashboard/menu/product-card";
import { MenuProductFormModal } from "@/components/dashboard/menu/product-modal";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  FilterBar,
  NeumoInput,
  PrimaryButton,
  StatPill,
} from "@/components/ui/design-system";
import {
  defaultMenuCategories,
  getCategoryNameById,
  loadMenuCategories,
  saveMenuCategories,
  type MenuCategoryRecord,
} from "@/lib/mock/menu-categories";
import { runCustomIdentityMigrationOnce, notifyMenuCategoriesUpdated } from "@/lib/cafe/theme-storage-sync";
import { saveMenuProductsToStorage, MENU_STORAGE_KEY } from "@/lib/cafe/menu-storage";
import { AppToast, useAppToast } from "@/components/ui/app-toast";
import { type MenuProduct } from "@/lib/mock/menu";

const STORAGE_KEY = MENU_STORAGE_KEY;

type Props = {
  initialProducts: MenuProduct[];
};

export function MenuPageClient({ initialProducts }: Props) {
  const [products, setProducts] = useState<MenuProduct[]>(initialProducts);
  const [categories, setCategories] = useState<MenuCategoryRecord[]>(defaultMenuCategories);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("الكل");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MenuProduct | null>(null);
  const { toast, showToast } = useAppToast();
  const [categoriesReady, setCategoriesReady] = useState(false);

  useEffect(() => {
    void runCustomIdentityMigrationOnce().then(() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setProducts(JSON.parse(saved));
      }
    });
    setCategories(loadMenuCategories());
    setCategoriesReady(true);
  }, []);

  useEffect(() => {
    if (!categoriesReady) return;
    saveMenuProductsToStorage(products);
  }, [products, categoriesReady]);

  useEffect(() => {
    if (!categoriesReady) return;
    saveMenuCategories(categories);
    notifyMenuCategoriesUpdated();
  }, [categories, categoriesReady]);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const categoryName = getCategoryNameById(categories, p.categoryId, p.category);
      const matchQuery =
        p.name.includes(query) ||
        p.description.includes(query) ||
        categoryName.includes(query) ||
        p.category.includes(query);

      const matchCategory =
        categoryFilter === "الكل" ||
        p.categoryId === categoryFilter ||
        (!p.categoryId && p.category === categoryFilter);

      return matchQuery && matchCategory;
    });
  }, [products, query, categoryFilter, categories]);

  const availableCount = products.filter((p) => p.available).length;

  function saveProduct(product: MenuProduct) {
    const categoryName = getCategoryNameById(categories, product.categoryId, product.category);
    const normalized = { ...product, category: categoryName };

    if (product.id) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? normalized : p)));
    } else {
      setProducts((prev) => [{ ...normalized, id: crypto.randomUUID() }, ...prev]);
    }
  }

  function handleCategoriesChange(next: MenuCategoryRecord[]) {
    setCategories(next);
    notifyMenuCategoriesUpdated();
    showToast({ type: "success", message: "تم حفظ تصنيفات المنيو" });
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
          <BentoCard variant="white">
            <StatPill label="التصنيفات" value={categories.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="نتائج البحث" value={filtered.length} hint="حسب الفلتر الحالي" />
          </BentoCard>
        </BentoGrid>

        <BentoGrid className="mb-6">
          <CategoryManager
            categories={categories}
            products={products}
            onChange={handleCategoriesChange}
          />
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
            <button
              onClick={() => setCategoryFilter("الكل")}
              className={`rounded-2xl px-5 py-3 text-sm font-black ${
                categoryFilter === "الكل"
                  ? "bg-[#3A2117] text-[#F8F4EF]"
                  : "bg-[#F8F4EF] text-[#3A2117]"
              }`}
            >
              الكل
            </button>
            {sortedCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryFilter(c.id)}
                className={`rounded-2xl px-5 py-3 text-sm font-black ${
                  categoryFilter === c.id
                    ? "bg-[#3A2117] text-[#F8F4EF]"
                    : "bg-[#F8F4EF] text-[#3A2117]"
                }`}
              >
                {c.name}
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
                  categoryLabel={getCategoryNameById(
                    categories,
                    product.categoryId,
                    product.category
                  )}
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
          categories={categories}
          onCategoriesChange={handleCategoriesChange}
          onClose={() => setOpen(false)}
          onSave={saveProduct}
        />
      </DashboardPageShell>
      <AppToast toast={toast} />
    </div>
  );
}
