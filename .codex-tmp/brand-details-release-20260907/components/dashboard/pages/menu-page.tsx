"use client";

import { ChevronDown, Plus, Search, SlidersHorizontal, Upload } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteMenuCategoryAction,
  deleteMenuProductAction,
  saveMenuCategoriesAction,
  saveMenuProductAction,
} from "@/app/actions/menu";
import { CategoryManager } from "@/components/dashboard/menu/category-manager";
import { MenuProductCard } from "@/components/dashboard/menu/product-card";
import {
  BentoCard,
  DashboardPageShell,
  NeumoInput,
  PrimaryButton,
} from "@/components/ui/design-system";
import { getCategoryNameById, type MenuCategoryRecord } from "@/lib/mock/menu-categories";
import { AppToast, useAppToast } from "@/components/ui/app-toast";
import { type MenuProduct } from "@/lib/mock/menu";
import { getBusinessCopy } from "@/lib/platform/business-copy";

function ModalLoadingPlaceholder() {
  return (
    <div
      aria-label="Loading dialog"
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4"
    >
      <div className="w-full max-w-md animate-pulse rounded-[24px] border border-[#E7D7C6] bg-[#FCF8F3] p-5 shadow-xl">
        <div className="h-6 w-40 rounded-lg bg-[#E7D7C6]" />
        <div className="mt-5 h-12 w-full rounded-2xl bg-[#F0E3D6]" />
        <div className="mt-3 h-12 w-full rounded-2xl bg-[#F0E3D6]" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}

const MenuProductFormModal = dynamic(
  () =>
    import("@/components/dashboard/menu/product-modal").then(
      (module) => module.MenuProductFormModal
    ),
  { loading: ModalLoadingPlaceholder }
);

const MenuImportModal = dynamic(
  () =>
    import("@/components/dashboard/menu/menu-import-modal").then(
      (module) => module.MenuImportModal
    ),
  { loading: ModalLoadingPlaceholder }
);

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
  const [productModalRequested, setProductModalRequested] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importModalRequested, setImportModalRequested] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
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
      showToast({ type: "success", message: copy.kind === "events" ? "تم حفظ التذكرة أو الباقة" : "تم حفظ المنتج" });
      router.refresh();
    } catch {
      showToast({ type: "error", message: copy.kind === "events" ? "تعذر حفظ التذكرة أو الباقة" : "تعذر حفظ المنتج" });
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
      showToast({ type: "success", message: copy.kind === "events" ? "تم حفظ فئات التذاكر" : "تم حفظ تصنيفات المنيو" });
      return saved;
    } catch {
      showToast({ type: "error", message: "تعذر حفظ التصنيفات" });
      return categories;
    } finally {
      setSaving(false);
    }
  }

  async function handleCategoryDelete(categoryId: string) {
    setSaving(true);
    try {
      const result = await deleteMenuCategoryAction(categoryId);

      if (result.ok) {
        setCategories((current) => current.filter((category) => category.id !== categoryId));
        router.refresh();
        showToast({
          type: "success",
          message: copy.kind === "events" ? "تم حذف فئة التذاكر" : "تم حذف التصنيف",
        });
        return true;
      }

      if (result.reason === "has_products") {
        showToast({
          type: "error",
          message: `لا يمكن حذف التصنيف — ${result.linkedProducts} ${
            copy.kind === "events" ? "تذكرة أو باقة" : "منتج"
          } مرتبط به`,
        });
        return false;
      }

      showToast({
        type: "error",
        message: "تعذر حذف التصنيف. حدّث الصفحة وحاول مرة أخرى.",
      });
      return false;
    } catch (error) {
      console.error("Menu category deletion action failed", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      showToast({ type: "error", message: "تعذر حذف التصنيف. حاول مرة أخرى." });
      return false;
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
              onClick={() => {
                setImportModalRequested(true);
                setImportOpen(true);
              }}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-[#3A2117] shadow"
            >
              <Upload className="h-5 w-5" />
              {importLabel}
            </button>
            <PrimaryButton
            onClick={() => {
              setEditing(null);
              setProductModalRequested(true);
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
        <section className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="ملخص المنيو">
          {[
            [copy.kind === "events" ? "إجمالي التذاكر والباقات" : "إجمالي المنتجات", products.length],
            [copy.kind === "events" ? "تذاكر متاحة" : "متاح للبيع", availableCount],
            ["التصنيفات", categories.length],
            ["نتائج البحث", filtered.length],
          ].map(([label, value]) => (
            <div key={String(label)} className="min-w-0 rounded-2xl border border-[#E7D7C6] bg-white px-4 py-3 shadow-[4px_6px_16px_rgba(49,25,18,0.04)]">
              <p className="truncate text-[11px] font-black text-[#806A5E] sm:text-xs">{label}</p>
              <p className="mt-1 text-xl font-black text-[#3A2117]">{value}</p>
            </div>
          ))}
        </section>

        <section className="sticky top-2 z-20 mb-5 rounded-2xl border border-[#E7D7C6] bg-white/95 p-3 shadow-[8px_10px_24px_rgba(49,25,18,0.08)] backdrop-blur">
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
            <div className="relative min-w-0">
              <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7A6255]" />
              <NeumoInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`ابحث باسم ${copy.itemSingular} أو ${copy.itemPlural} أو تصنيف`}
                className="min-w-0 pr-12"
              />
            </div>
            <p className="whitespace-nowrap text-xs font-black text-[#806A5E]">
              {filtered.length} نتيجة
            </p>
            <button
              type="button"
              onClick={() => setCategoriesOpen((current) => !current)}
              aria-expanded={categoriesOpen}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F8F4EF] px-4 text-sm font-black text-[#3A2117] transition hover:bg-[#EFE8DF]"
            >
              <SlidersHorizontal className="h-4 w-4" />
              إدارة التصنيفات
              <ChevronDown className={`h-4 w-4 transition ${categoriesOpen ? "rotate-180" : ""}`} />
            </button>
          </div>

          <div className="mt-3 flex min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
            <button
              type="button"
              onClick={() => setCategoryFilter("الكل")}
              className={`min-h-9 shrink-0 rounded-full px-4 text-xs font-black ${
                categoryFilter === "الكل"
                  ? "bg-[#3A2117] text-[#F8F4EF]"
                  : "bg-[#F8F4EF] text-[#3A2117]"
              }`}
            >
              الكل
            </button>
            {sortedCategories.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setCategoryFilter(c.id)}
                className={`min-h-9 max-w-[14rem] shrink-0 truncate rounded-full px-4 text-xs font-black ${
                  categoryFilter === c.id
                    ? "bg-[#3A2117] text-[#F8F4EF]"
                    : "bg-[#F8F4EF] text-[#3A2117]"
                }`}
                title={c.name}
              >
                {c.name}
              </button>
            ))}
          </div>
        </section>

        {categoriesOpen ? (
          <div className="mb-6">
            <CategoryManager
              categories={categories}
              products={products}
              onChange={handleCategoriesChange}
              onDelete={handleCategoryDelete}
              businessCategory={businessCategory}
            />
          </div>
        ) : null}

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-[#3A2117]">المنتجات</h2>
              <p className="mt-1 text-xs font-bold text-[#806A5E]">
                {filtered.length} نتيجة
                {categoryFilter === "الكل"
                  ? " · كل التصنيفات"
                  : ` · ${sortedCategories.find((category) => category.id === categoryFilter)?.name ?? categoryFilter}`}
              </p>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D8C7B7] bg-white/60 px-4 py-12 text-center font-bold text-[#806A5E]">
              {copy.kind === "events" ? "لا توجد تذاكر أو باقات بعد" : "لا توجد منتجات بعد"}
            </div>
          ) : (
            <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                      setProductModalRequested(true);
                      setOpen(true);
                    }}
                    onToggleAvailability={() => {
                      void saveProduct({ ...product, available: !product.available });
                    }}
                    onDelete={() => {
                      void deleteMenuProductAction(product.id).then(() => {
                        setProducts((prev) => prev.filter((p) => p.id !== product.id));
                        showToast({ type: "success", message: copy.kind === "events" ? "تم حذف التذكرة أو الباقة" : "تم حذف المنتج" });
                      });
                    }}
                    businessCategory={businessCategory}
                  />
              ))}
            </div>
          )}
        </section>

        {productModalRequested ? (
          <MenuProductFormModal
            open={open}
            mode={editing ? "edit" : "add"}
            editingProduct={editing}
            productList={products}
            categories={categories}
            businessCategory={businessCategory}
            onCategoriesChange={handleCategoriesChange}
            onClose={() => setOpen(false)}
            onSave={saveProduct}
          />
        ) : null}
        {importModalRequested ? (
          <MenuImportModal
            open={importOpen}
            onClose={() => setImportOpen(false)}
            onImported={() => {
              setImportOpen(false);
              router.refresh();
            }}
          />
        ) : null}
      </DashboardPageShell>
      <AppToast toast={toast} />
    </div>
  );
}
