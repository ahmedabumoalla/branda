"use client";

import { Plus, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteMenuProductAction,
  saveMenuCategoriesAction,
  saveMenuProductAction,
} from "@/app/actions/menu";
import { CategoryManager } from "@/components/dashboard/menu/category-manager";
import { MenuImportModal } from "@/components/dashboard/menu/menu-import-modal";
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
import { getCategoryNameById, type MenuCategoryRecord } from "@/lib/mock/menu-categories";
import { AppToast, useAppToast } from "@/components/ui/app-toast";
import { type MenuProduct } from "@/lib/mock/menu";
import { getBusinessCopy } from "@/lib/platform/business-copy";

type Props = {
  initialProducts: MenuProduct[];
  initialCategories: MenuCategoryRecord[];
  businessCategory?: string;
  configError?: string;
};

export function MenuPageClient({ initialProducts, initialCategories, businessCategory, configError }: Props) {
  const copy = getBusinessCopy(businessCategory);
  const [products, setProducts] = useState<MenuProduct[]>(initialProducts);
  const [categories, setCategories] = useState<MenuCategoryRecord[]>(initialCategories);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("الكل");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<MenuProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { toast, showToast } = useAppToast();
  const menuTitle = copy.kind === "events" ? "التذاكر والباقات" : "المنيو الرقمي";
  const importLabel = copy.kind === "events" ? "استيراد التذاكر" : "استيراد المنيو";
  const addLabel = copy.kind === "events" ? "إضافة تذكرة أو باقة" : "إضافة منتج";

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

  async function saveProduct(product: MenuProduct) {
    setSaving(true);
    try {
      const categoryName = getCategoryNameById(categories, product.categoryId, product.category);
      const normalized = { ...product, category: categoryName };
      const id = await saveMenuProductAction(normalized);
      const saved = { ...normalized, id: id || normalized.id };

      if (product.id) {
        setProducts((prev) => prev.map((p) => (p.id === product.id ? saved : p)));
      } else {
        setProducts((prev) => [saved, ...prev]);
      }
      showToast({ type: "success", message: "تم حفظ المنتج" });
      router.refresh();
    } catch {
      showToast({ type: "error", message: "تعذر حفظ المنتج" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCategoriesChange(next: MenuCategoryRecord[]) {
    setSaving(true);
    try {
      const saved = await saveMenuCategoriesAction(next);
      setCategories(saved);
      router.refresh();
      showToast({ type: "success", message: "تم حفظ تصنيفات المنيو" });
      return saved;
    } catch {
      showToast({ type: "error", message: "تعذر حفظ التصنيفات" });
      return categories;
    } finally {
      setSaving(false);
    }
  }

  if (configError) {
    return (
      <DashboardPageShell title={menuTitle} subtitle={configError}>
        <BentoCard variant="white" span="4">
          <p className="font-bold text-[#806A5E]">{configError}</p>
        </BentoCard>
      </DashboardPageShell>
    );
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title={menuTitle}
        subtitle={copy.kind === "events" ? "أي تذكرة أو باقة تضيفها هنا تظهر في صفحة الفعالية للعميل" : "أي منتج تضيفه هنا يظهر في الفرع الإلكتروني للعميل"}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#3A2117] shadow"
            >
              <Upload className="h-5 w-5" />
              {importLabel}
            </button>
            <PrimaryButton
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            disabled={saving}
            className="inline-flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            {addLabel}
            </PrimaryButton>
          </div>
        }
      >
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label={copy.kind === "events" ? "إجمالي التذاكر والباقات" : "إجمالي المنتجات"} value={products.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label={copy.kind === "events" ? "متاح للحجز" : "متاح للبيع"} value={availableCount} />
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
              placeholder={`ابحث باسم ${copy.itemSingular} أو منتج أو تصنيف`}
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
            {filtered.length === 0 ? (
              <p className="py-12 text-center font-bold text-[#806A5E]">لا توجد منتجات بعد</p>
            ) : (
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
                      void saveProduct({ ...product, available: !product.available });
                    }}
                    onDelete={() => {
                      void deleteMenuProductAction(product.id).then(() => {
                        setProducts((prev) => prev.filter((p) => p.id !== product.id));
                        showToast({ type: "success", message: "تم حذف المنتج" });
                      });
                    }}
                  />
                ))}
              </section>
            )}
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
        <MenuImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            router.refresh();
          }}
        />
      </DashboardPageShell>
      <AppToast toast={toast} />
    </div>
  );
}
