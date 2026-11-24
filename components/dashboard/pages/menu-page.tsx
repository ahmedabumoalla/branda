"use client";

import { ChevronDown, ExternalLink, LoaderCircle, Plus, Search, SlidersHorizontal, Upload } from "lucide-react";
import dynamic from "next/dynamic";
import { InventoryCatalogTabs } from "@/components/erp/inventory/catalog-tabs";
import catalogSkin from "@/components/erp/inventory/catalog-skin.module.css";
import { prewarmMenuIngredients } from "@/components/erp/inventory/menu-ingredients-cache";
import { useRouter } from "@/components/erp/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type SyntheticEvent } from "react";
import {
  fetchOwnerMenuAction,
  deleteMenuCategoryAction,
  deleteMenuProductAction,
  saveMenuCategoriesAction,
  saveMenuProductAction,
} from "@/app/actions/menu";
import { CategoryManager } from "@/components/dashboard/menu/category-manager";
import { MenuProductCard } from "@/components/dashboard/menu/product-card";
import { MenuBranchSwitcher } from "@/components/dashboard/menu/branch-switcher";
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
import { captureProductPosition } from "@/lib/menu/product-position";
import { notifyMenuChanged } from "@/lib/menu/menu-change";
import { createProductCopy } from "@/lib/menu/product-copy";
import { currencyByCode } from "@/lib/currency/account-currency";
import { readCommerceDetails } from "@/lib/commerce/product-details";
import { withMenuProductPriceMode } from "@/lib/menu/product-price-mode";
import styles from "@/components/dashboard/menu/menu-dashboard.module.css";

import { AwladSections } from "@/components/menu/awlad-sections";
import { awladCategorySection, awladProductSection, awladSectionHref } from "@/lib/menu/awlad-al-izz";
import type { AwladSection } from "@/lib/menu/awlad-al-izz-catalog";
import { saveDraftProduct, deleteDraftProduct, saveDraftCategories, deleteDraftCategory } from "@/app/actions/awlad-draft";

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

// Shared loader so the dialog code can be fetched ahead of the first click.
const loadMenuInventoryIngredients = () => import("@/components/erp/inventory/menu-ingredients");
const MenuInventoryIngredients = dynamic(
  () => loadMenuInventoryIngredients().then(module => module.MenuInventoryIngredients),
  { loading: ModalLoadingPlaceholder }
);

type Props = {
  awlad?: boolean;
  localDraft?: boolean;
  initialProducts: MenuProduct[];
  initialCategories: MenuCategoryRecord[];
  businessCategory?: string;
  cafeSlug?: string;
  currencyCode?: string;
  currencyLabel?: string;
  branchId?: string | null;
  branchName?: string;
  branchSlug?: string;
  branches?: { id: string; name: string; slug: string }[];
  configError?: string;
  inventoryCatalog?: boolean;
  initialProductId?: string;
};

export function MenuPageClient({ awlad = false, localDraft = false, initialProducts, initialCategories, businessCategory, cafeSlug, currencyCode, currencyLabel, branchId, branchName, branchSlug, branches = [], configError, inventoryCatalog = false, initialProductId }: Props) {
  const router = useRouter();
  const [branchPending, startBranchTransition] = useTransition();
  const [requestedBranchName, setRequestedBranchName] = useState("");
  const [section, setSection] = useState<AwladSection>("salon");
  const sectionBusiness = awlad && section === "cafe" ? "cafes" : businessCategory;
  const copy = getBusinessCopy(sectionBusiness);
  const [products, setProducts] = useState<MenuProduct[]>(initialProducts);
  const [categories, setCategories] = useState<MenuCategoryRecord[]>(initialCategories);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("الكل");
  const initialProduct = initialProducts.find(product => product.id === initialProductId) ?? null;
  const [open, setOpen] = useState(Boolean(initialProduct));
  const [productModalRequested, setProductModalRequested] = useState(Boolean(initialProduct));
  const [importOpen, setImportOpen] = useState(false);
  const [importModalRequested, setImportModalRequested] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [editing, setEditing] = useState<MenuProduct | null>(initialProduct);
  const [ingredientsProduct, setIngredientsProduct] = useState<MenuProduct | null>(null);
  // Inventory catalog only: fetch the ingredients dialog code shortly after the page settles,
  // and start its first data read when the pointer or focus reaches an ingredients button.
  useEffect(() => {
    if (!inventoryCatalog) return;
    const timer = window.setTimeout(() => { void loadMenuInventoryIngredients().catch(() => undefined); }, 1200);
    return () => window.clearTimeout(timer);
  }, [inventoryCatalog]);
  const warmIngredients = (event: SyntheticEvent<HTMLElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!cafeSlug || !target?.closest('button[aria-label^="مكونات المخزون"]')) return;
    const productId = target.closest<HTMLElement>("[data-menu-product-id]")?.dataset.menuProductId;
    if (!productId) return;
    void loadMenuInventoryIngredients().catch(() => undefined);
    prewarmMenuIngredients(cafeSlug, productId);
  };
  const [saving, setSaving] = useState(false);
  const actionLock = useRef(false);
  const restorePosition = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const restore = restorePosition.current;
    restore?.();
    restorePosition.current = null;
    if (restore) {
      const frame = requestAnimationFrame(restore);
      return () => cancelAnimationFrame(frame);
    }
  }, [products, open]);
  const { toast, showToast } = useAppToast();
  const isSalon = copy.kind === "barbershop";
  const isFashion = copy.kind === "clothing";
  const isGifts = copy.kind === "gifts" || isFashion;
  const menuTitle = awlad ? "الخدمات والمنيو" : inventoryCatalog ? "المنيو" : isFashion ? "المتجر والمنتجات" : isGifts ? "المنتجات والخدمات" : isSalon ? "الخدمات والمنتجات" : copy.kind === "events" ? "التذاكر والباقات" : "المنيو الرقمي";
  const importLabel = isFashion ? "استيراد المنتجات" : isGifts ? "استيراد المنتجات والخدمات" : isSalon ? "استيراد الخدمات والمنتجات" : copy.kind === "events" ? "استيراد التذاكر" : "استيراد المنيو";
  const addLabel = awlad && section === "laser" ? "إضافة خدمة ليزر" : isFashion ? "إضافة منتج" : isGifts ? "إضافة منتج أو خدمة" : isSalon ? "إضافة خدمة أو منتج" : copy.kind === "events" ? "إضافة تذكرة أو باقة" : "إضافة منتج";

  const sectionProducts = useMemo(() => awlad ? products.filter(p =>
    awladProductSection(p, categories.find(c => c.id === p.categoryId)) === section) : products,
    [awlad, products, categories, section]);
  const sectionCategories = useMemo(() => awlad ? categories.filter(c => {
    const assigned = awladCategorySection(c);
    return assigned ? assigned === section : sectionProducts.some(p => p.categoryId === c.id) || (!products.some(p => p.categoryId === c.id) && section === "cafe");
  }) : categories, [awlad, categories, section, products, sectionProducts]);

  const sortedCategories = useMemo(
    () => [...sectionCategories].sort((a, b) => a.sortOrder - b.sortOrder),
    [sectionCategories]
  );

  const filtered = useMemo(() => {
    return sectionProducts.filter((p) => {
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
  }, [sectionProducts, query, categoryFilter, categories]);

  const availableCount = sectionProducts.filter(p => p.available && (!awlad || !p.categoryId || sectionCategories.some(c => c.id === p.categoryId && c.visible))).length;

  async function saveProduct(product: MenuProduct) {
    if (actionLock.current) return false;
    actionLock.current = true;
    restorePosition.current = captureProductPosition(product.id);
    setSaving(true);
    try {
      const categoryName = getCategoryNameById(categories, product.categoryId, product.category);
      const normalized = { ...product, category: categoryName, ...(branchId !== undefined ? { branchId } : {}) };
      const id = await (localDraft ? saveDraftProduct : saveMenuProductAction)(normalized);
      const saved = { ...normalized, id: id || normalized.id,
        ...(isGifts ? { commerceSnapshot: readCommerceDetails(normalized.commerceDetails) } : {}),
        ...(cafeSlug === "mind-hospital" && normalized.priceMode ? { commerceSnapshot: withMenuProductPriceMode(normalized.commerceSnapshot, normalized.priceMode) } : {}),
      };

      setProducts((prev) => prev.some((item) => item.id === saved.id)
        ? prev.map((item) => item.id === saved.id ? saved : item) : [...prev, saved]);
      notifyMenuChanged(cafeSlug);
      showToast({ type: "success", message: copy.kind === "events" ? "تم حفظ التذكرة أو الباقة" : "تم حفظ المنتج" });
      return true;
    } catch (error) {
      const conflict = "تغيرت بيانات المنتج أو مخزونه حدث الصفحة وأعد التعديل";
      showToast({ type: "error", message: error instanceof Error && error.message === conflict
        ? conflict : copy.kind === "events" ? "تعذر حفظ التذكرة أو الباقة" : "تعذر حفظ المنتج" });
      return false;
    } finally {
      actionLock.current = false;
      setSaving(false);
    }
  }

  async function deleteProduct(productId: string) {
    if (actionLock.current) return;
    actionLock.current = true;
    setSaving(true);
    restorePosition.current = captureProductPosition(productId);
    try {
      await (localDraft ? deleteDraftProduct : deleteMenuProductAction)(productId);
      setProducts((prev) => prev.filter((product) => product.id !== productId));
      notifyMenuChanged(cafeSlug);
      showToast({ type: "success", message: "تم حذف المنتج" });
    } catch {
      showToast({ type: "error", message: "تعذر حذف المنتج حاول مرة أخرى" });
    } finally {
      actionLock.current = false;
      setSaving(false);
    }
  }

  async function handleCategoriesChange(next: MenuCategoryRecord[]) {
    setSaving(true);
    try {
      const saved = await (localDraft ? saveDraftCategories : saveMenuCategoriesAction)(next.map(item => ({ ...item, ...(awlad ? { icon: `awlad-${section}` } : {}), ...(branchId !== undefined ? { branchId } : {}) })));
      setCategories(current => awlad ? [...current.filter(c => !sectionCategories.some(sc => sc.id === c.id)), ...saved] : saved);
      notifyMenuChanged(cafeSlug);
      showToast({ type: "success", message: isFashion ? "تم حفظ تصنيفات المتجر" : copy.kind === "events" ? "تم حفظ فئات التذاكر" : copy.kind === "gifts" ? "تم حفظ تصنيفات المنتجات والخدمات" : "تم حفظ تصنيفات المنيو" });
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
      const result = await (localDraft ? deleteDraftCategory : deleteMenuCategoryAction)(categoryId);

      if (result.ok) {
        setCategories((current) => current.filter((category) => category.id !== categoryId));
        notifyMenuChanged(cafeSlug);
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
        message: "تعذر حذف التصنيف حدّث الصفحة وحاول مرة أخرى",
      });
      return false;
    } catch (error) {
      console.error("Menu category deletion action failed", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      showToast({ type: "error", message: "تعذر حذف التصنيف حاول مرة أخرى" });
      return false;
    } finally {
      setSaving(false);
    }
  }

  if (configError) {
    return (
      <div dir="rtl" className={styles.page}>
        <DashboardPageShell title={menuTitle} subtitle={configError}>
          <BentoCard variant="white" span="4">
            <p className="font-medium text-[#806A5E]">{configError}</p>
          </BentoCard>
        </DashboardPageShell>
      </div>
    );
  }

  if (branchPending) return <div dir="rtl" className={styles.page} aria-busy="true">
    <DashboardPageShell title={menuTitle} subtitle={`جارٍ فتح ${requestedBranchName}`}>
      <MenuBranchSwitcher branches={branches} currentId={branchId} busy />
      <section role="status" aria-live="polite" className="rounded-3xl border border-[#E5D8CD] bg-white p-8 text-center text-[#4A281D]">
        <LoaderCircle className="mx-auto mb-4 h-8 w-8 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <h2 className="text-lg font-bold">جارٍ تحميل منيو {requestedBranchName}</h2>
        <p className="mt-2 text-sm text-[#806A5E]">نجهز منتجات الفرع وصوره وأسعاره</p>
        <div aria-hidden="true" className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">{[0, 1, 2, 3].map(item => <div key={item} className="h-40 rounded-2xl bg-[#F8F4EF] motion-safe:animate-pulse" />)}</div>
      </section>
    </DashboardPageShell>
  </div>;

  return (
    <div dir="rtl" className={inventoryCatalog ? `${styles.page} ${catalogSkin.menu}` : styles.page}>
      {inventoryCatalog && <InventoryCatalogTabs active="menu" />}
      <DashboardPageShell
        title={branchName ? `${menuTitle} — ${branchName}` : menuTitle}
        subtitle={awlad ? undefined : isFashion ? "أدر منتجات المتجر وصورها وأسعارها والمقاسات والألوان" : isGifts ? "أدر منتجاتك وخدماتك وصورها وأسعارها وخيارات العملاء" : isSalon ? "خدمات الصالون وأسعاره ومنتجات العناية كما يراها العميل" : "منتجاتك وأسعارك كما يراها العميل"}
        action={
          <div className={styles.headerActions}>
            {awlad && <AwladSections selected={section} onSelect={next => { setSection(next); setQuery(""); setCategoryFilter("الكل"); setCategoriesOpen(false); }} />}
            {cafeSlug && <a href={`${awlad ? awladSectionHref(cafeSlug, section) : `/${isSalon ? "salon" : "menu"}/${encodeURIComponent(cafeSlug)}`}${branchSlug ? `?branch=${encodeURIComponent(branchSlug)}` : ""}`} target="_blank" rel="noopener noreferrer" className={styles.secondaryAction}>
              <ExternalLink className="h-5 w-5" aria-hidden="true" />
              {awlad && section === "laser" ? "فتح صفحة الليزر" : isGifts ? "فتح صفحة المتجر" : isSalon ? "فتح صفحة الصالون" : "فتح المنيو المستقل"}
            </a>}
            {!branchId && !localDraft && <button
              type="button"
              onClick={() => {
                setImportModalRequested(true);
                setImportOpen(true);
              }}
              disabled={saving}
              className={styles.secondaryAction}
            >
              <Upload className="h-5 w-5" />
              {importLabel}
            </button>}
            <PrimaryButton
            onClick={() => {
              setEditing(null);
              setProductModalRequested(true);
              setOpen(true);
            }}
            disabled={saving}
            className={styles.primaryAction}
          >
            <Plus className="h-5 w-5" />
            {addLabel}
            </PrimaryButton>
          </div>
        }
      >
        {localDraft && <p className="mb-2 text-sm">معاينة محلية تُحفظ تعديلاتك على هذا الجهاز</p>}
        {currencyCode && <p className="mb-4 text-sm font-bold text-[#6B5144]" data-account-currency={currencyCode}>عملة الحساب {currencyByCode(currencyCode).currencyName} <bdi>({currencyCode})</bdi></p>}
        <MenuBranchSwitcher branches={branches} currentId={branchId} busy={saving} onSwitch={branch => {
          setRequestedBranchName(branch.name);
          const destination = inventoryCatalog ? "/dashboard/system/inventory/items?view=products&branch=" : "/dashboard/menu?branch=";
          startBranchTransition(() => router.push(`${destination}${encodeURIComponent(branch.id)}`, { scroll: false }));
        }} />
        <section className={styles.summaryGrid} aria-label={isGifts ? "ملخص المنتجات والخدمات" : "ملخص المنيو"}>
          {[
            [isFashion ? "إجمالي المنتجات" : isGifts ? "المنتجات والخدمات" : isSalon ? "الخدمات والمنتجات" : copy.kind === "events" ? "إجمالي التذاكر والباقات" : "إجمالي المنتجات", sectionProducts.length],
            [isGifts ? "متاح للطلب" : awlad ? "ظاهر في صفحة القسم" : isSalon ? "ظاهر في صفحة الصالون" : copy.kind === "events" ? "تذاكر متاحة" : "ظاهر في المنيو", availableCount],
            ["التصنيفات", sectionCategories.length],
            [isGifts ? "غير متاح للطلب" : awlad ? "مخفي من صفحة القسم" : isSalon ? "مخفي من صفحة الصالون" : "مخفي من المنيو", sectionProducts.length - availableCount],
          ].map(([label, value]) => (
            <div key={String(label)} className={styles.metricCard}>
              <p className={styles.metricLabel}>{label}</p>
              <p className={styles.metricValue}>{value}</p>
            </div>
          ))}
        </section>

        <section className={styles.toolbar}>
          <div className={styles.toolbarRow}>
            <div className={styles.searchWrap}>
              <Search className={styles.searchIcon} />
              <NeumoInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isGifts ? "ابحث باسم المنتج أو الخدمة" : isSalon ? "ابحث باسم الخدمة أو المنتج" : "ابحث باسم المنتج أو التصنيف"}
                aria-label="البحث في المنتجات والتصنيفات"
                className={styles.searchInput}
              />
            </div>
            <label className={styles.categorySelect}>
              <span className="sr-only">تصفية حسب التصنيف</span>
              <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
                <option value="الكل">كل التصنيفات</option>
                {sortedCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setCategoriesOpen((current) => !current)}
              aria-expanded={categoriesOpen}
              className={styles.categoryButton}
            >
              <SlidersHorizontal className="h-4 w-4" />
              إدارة التصنيفات
              <ChevronDown className={`h-4 w-4 transition ${categoriesOpen ? "rotate-180" : ""}`} />
            </button>
          </div>

        </section>

        {categoriesOpen ? (
          <div className="mb-6">
            <CategoryManager
              categories={sectionCategories}
              products={sectionProducts}
              onChange={handleCategoriesChange}
              onDelete={handleCategoryDelete}
              businessCategory={sectionBusiness}
            />
          </div>
        ) : null}

        <section className="min-w-0">
          <div className={styles.catalogHeader}>
            <div>
              <h2 className={styles.catalogTitle}>{isFashion ? "منتجات المتجر" : isGifts ? "المنتجات والخدمات" : isSalon ? "الخدمات والمنتجات" : copy.kind === "events" ? "التذاكر والباقات" : "المنتجات"}</h2>
              <p className={styles.catalogMeta}>
                {filtered.length} نتيجة
                {categoryFilter === "الكل"
                  ? " في كل التصنيفات"
                  : ` في ${sortedCategories.find((category) => category.id === categoryFilter)?.name ?? categoryFilter}`}
              </p>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className={styles.emptyState}>
              {query || categoryFilter !== "الكل" ? "لا توجد نتائج مطابقة جرّب اسمًا أو تصنيفًا آخر" : awlad && section === "laser" ? "أضف أول خدمة ليزر" : isFashion ? "أضف أول منتج لمتجرك" : isGifts ? "أضف أول منتج أو خدمة لمتجرك" : isSalon ? "أضف أول خدمة للصالون أو منتج للعناية" : copy.kind === "events" ? "لا توجد تذاكر أو باقات بعد" : "لا توجد منتجات بعد"}
            </div>
          ) : (
            <div className={styles.productGrid} onPointerOver={inventoryCatalog ? warmIngredients : undefined} onFocus={inventoryCatalog ? warmIngredients : undefined}>
              {filtered.map((product, index) => (
                  <MenuProductCard
                    currencyCode={currencyCode}
                    onInventoryIngredients={inventoryCatalog && cafeSlug ? () => setIngredientsProduct(product) : undefined}
                    key={product.id}
                    product={product}
                    busy={saving}
                    index={index}
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
                      restorePosition.current = captureProductPosition(product.id);
                      setEditing(product);
                      setProductModalRequested(true);
                      setOpen(true);
                    }}
                    onToggleAvailability={() => {
                      void saveProduct({ ...product, available: !product.available });
                    }}
                    onDuplicate={() => {
                      restorePosition.current = captureProductPosition(product.id);
                      setEditing(createProductCopy(product, products));
                      setProductModalRequested(true);
                      setOpen(true);
                    }}
                    onDelete={() => { void deleteProduct(product.id); }}
                    businessCategory={sectionBusiness}
                  />
              ))}
            </div>
          )}
        </section>

        {ingredientsProduct && cafeSlug && <MenuInventoryIngredients slug={cafeSlug} productId={ingredientsProduct.id} productName={ingredientsProduct.name} onClose={() => setIngredientsProduct(null)} />}
        {productModalRequested ? (
          <MenuProductFormModal
            currencyCode={currencyCode}
            currencyLabel={currencyLabel}
            open={open}
            mode={editing ? products.some((product) => product.id === editing.id) ? "edit" : "duplicate" : "add"}
            editingProduct={editing}
            productList={sectionProducts}
            categories={sectionCategories}
            businessCategory={sectionBusiness}
            cafeSlug={cafeSlug}
            onCategoriesChange={handleCategoriesChange}
            onClose={() => {
              if (editing && products.some((product) => product.id === editing.id)) restorePosition.current = captureProductPosition(editing.id);
              setOpen(false);
            }}
            onSave={saveProduct}
          />
        ) : null}
        {importModalRequested ? (
          <MenuImportModal
            open={importOpen}
            onClose={() => setImportOpen(false)}
            onImported={async () => {
              setImportOpen(false);
              notifyMenuChanged(cafeSlug);
              try {
                const menu = await fetchOwnerMenuAction(branchId);
                setProducts(menu.products);
                setCategories(menu.categories);
              } catch {
                showToast({ type: "error", message: "تم الاستيراد وتعذر تحديث القائمة أعد فتحها" });
              }
            }}
          />
        ) : null}
      </DashboardPageShell>
      <AppToast toast={toast} />
    </div>
  );
}
