"use client";

import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  ImagePlus,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { LocalAssetImage } from "@/components/ui/local-asset-image";
import {
  ImagePipelineError,
  optimizeImageForStorage,
  type OptimizedImageResult,
} from "@/lib/cafe/image-asset-pipeline";
import { saveOptimizedImageAsset, revokeObjectUrl } from "@/lib/cafe/local-asset-store";
import { BentoCard, PrimaryButton, SoftCard } from "@/components/ui/design-system";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { MenuProduct } from "@/lib/mock/menu";

type Props = {
  categories: MenuCategoryRecord[];
  products: MenuProduct[];
  cafeSlug?: string;
  onChange: (categories: MenuCategoryRecord[]) => void;
};

type FormState = {
  id?: string;
  name: string;
  description: string;
  visible: boolean;
  featured: boolean;
};

const emptyForm: FormState = {
  name: "",
  description: "",
  visible: true,
  featured: false,
};

export function CategoryManager({
  categories,
  products,
  cafeSlug = "test-cafe",
  onChange,
}: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | undefined>();
  const [pendingImage, setPendingImage] = useState<OptimizedImageResult | null>(null);
  const [optimizingImage, setOptimizingImage] = useState(false);

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  function linkedCount(categoryId: string) {
    return products.filter((p) => p.categoryId === categoryId).length;
  }

  function openAdd() {
    setForm(emptyForm);
    setImagePreviewUrl(undefined);
    setPendingImage(null);
    setFormOpen(true);
  }

  function openEdit(category: MenuCategoryRecord) {
    setForm({
      id: category.id,
      name: category.name,
      description: category.description ?? "",
      visible: category.visible,
      featured: category.featured,
    });
    setImagePreviewUrl(undefined);
    setPendingImage(null);
    setFormOpen(true);
  }

  async function saveForm() {
    if (!form.name.trim()) {
      alert("اكتب اسم التصنيف");
      return;
    }

    const now = new Date().toISOString().slice(0, 10);
    const categoryId = form.id ?? `cat_${Date.now()}`;

    let imageAssetId: string | undefined;
    if (pendingImage) {
      try {
        imageAssetId = await saveOptimizedImageAsset(
          "category-image",
          pendingImage,
          categoryId
        );
      } catch {
        alert("تعذر حفظ صورة التصنيف");
        return;
      }
    }

    if (form.id) {
      onChange(
        categories.map((c) =>
          c.id === form.id
            ? {
                ...c,
                name: form.name.trim(),
                description: form.description.trim() || undefined,
                visible: form.visible,
                featured: form.featured,
                updatedAt: now,
                ...(imageAssetId ? { imageAssetId } : {}),
              }
            : c
        )
      );
    } else {
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.sortOrder), 0);
      const newCategory: MenuCategoryRecord = {
        id: categoryId,
        cafeSlug,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        sortOrder: maxOrder + 1,
        visible: form.visible,
        featured: form.featured,
        createdAt: now,
        updatedAt: now,
        imageAssetId,
      };
      onChange([...categories, newCategory]);
    }

    if (imagePreviewUrl?.startsWith("blob:")) revokeObjectUrl(imagePreviewUrl);
    setFormOpen(false);
    setForm(emptyForm);
    setImagePreviewUrl(undefined);
    setPendingImage(null);
  }

  function removeCategory(id: string) {
    const count = linkedCount(id);
    if (count > 0) {
      alert(`لا يمكن حذف التصنيف — ${count} منتج مرتبط به`);
      return;
    }
    if (!confirm("حذف هذا التصنيف؟")) return;
    onChange(categories.filter((c) => c.id !== id));
  }

  function toggleField(id: string, field: "visible" | "featured") {
    const now = new Date().toISOString().slice(0, 10);
    onChange(
      categories.map((c) =>
        c.id === id ? { ...c, [field]: !c[field], updatedAt: now } : c
      )
    );
  }

  function moveCategory(id: string, direction: "up" | "down") {
    const list = [...sorted];
    const index = list.findIndex((c) => c.id === id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= list.length) return;

    const current = list[index];
    const swap = list[swapIndex];
    const now = new Date().toISOString().slice(0, 10);

    onChange(
      categories.map((c) => {
        if (c.id === current.id) return { ...c, sortOrder: swap.sortOrder, updatedAt: now };
        if (c.id === swap.id) return { ...c, sortOrder: current.sortOrder, updatedAt: now };
        return c;
      })
    );
  }

  return (
    <BentoCard variant="white" span="4">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#3A2117]">تصنيفات المنيو</h2>
          <p className="mt-1 text-sm font-bold text-[#7A6255]">
            رتّب التصنيفات وتحكم في ظهورها للعميل.
          </p>
        </div>
        <PrimaryButton onClick={openAdd} className="inline-flex items-center gap-2">
          <Plus className="h-5 w-5" />
          تصنيف جديد
        </PrimaryButton>
      </div>

      {formOpen ? (
        <SoftCard className="mb-5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-black text-[#3A2117]">
              {form.id ? "تعديل التصنيف" : "إضافة تصنيف"}
            </h3>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setForm(emptyForm);
              }}
              className="rounded-xl p-2 hover:bg-[#F8F4EF]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-black text-[#7A6255]">اسم التصنيف</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-black text-[#7A6255]">الوصف (اختياري)</span>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-black text-[#7A6255]">صورة التصنيف (اختياري)</span>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[#F8F4EF] px-4 py-3 text-sm font-black">
                  <ImagePlus className="h-4 w-4" />
                  {optimizingImage ? "جاري تحسين الصورة..." : "رفع صورة"}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = "";
                      setOptimizingImage(true);
                      try {
                        const optimized = await optimizeImageForStorage(
                          file,
                          "category-image"
                        );
                        if (imagePreviewUrl?.startsWith("blob:")) {
                          revokeObjectUrl(imagePreviewUrl);
                        }
                        setImagePreviewUrl(URL.createObjectURL(optimized.blob));
                        setPendingImage(optimized);
                      } catch (err) {
                        alert(
                          err instanceof ImagePipelineError
                            ? err.message
                            : "تعذر قراءة الصورة"
                        );
                      } finally {
                        setOptimizingImage(false);
                      }
                    }}
                  />
                </label>
                {imagePreviewUrl ? (
                  <img src={imagePreviewUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
                ) : form.id ? (
                  <LocalAssetImage
                    assetId={categories.find((c) => c.id === form.id)?.imageAssetId}
                    alt=""
                    className="h-14 w-14 rounded-xl object-cover"
                  />
                ) : null}
              </div>
            </label>

            <label className="flex items-center gap-2 text-sm font-black">
              <input
                type="checkbox"
                checked={form.visible}
                onChange={(e) => setForm((f) => ({ ...f, visible: e.target.checked }))}
              />
              ظاهر للعميل
            </label>

            <label className="flex items-center gap-2 text-sm font-black">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
              />
              تصنيف مميز
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={saveForm}
              className="rounded-2xl bg-[#3A2117] px-5 py-3 text-sm font-black text-[#F8E8D2]"
            >
              حفظ
            </button>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setForm(emptyForm);
              }}
              className="rounded-2xl bg-[#F8F4EF] px-5 py-3 text-sm font-black text-[#3A2117]"
            >
              إلغاء
            </button>
          </div>
        </SoftCard>
      ) : null}

      <div className="grid gap-3">
        {sorted.map((category, index) => (
          <SoftCard key={category.id} className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-black text-[#3A2117]">{category.name}</h3>
                  {category.featured ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                      <Star className="h-3.5 w-3.5" />
                      مميز
                    </span>
                  ) : null}
                  {!category.visible ? (
                    <span className="rounded-full bg-[#F8F4EF] px-3 py-1 text-xs font-black text-[#7A6255]">
                      مخفي
                    </span>
                  ) : null}
                </div>
                {category.description ? (
                  <p className="mt-1 text-sm font-bold text-[#7A6255]">{category.description}</p>
                ) : null}
                <p className="mt-1 text-xs font-bold text-[#7A6255]">
                  {linkedCount(category.id)} منتج مرتبط
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => moveCategory(category.id, "up")}
                  disabled={index === 0}
                  className="rounded-2xl bg-[#F8F4EF] p-3 disabled:opacity-40"
                  title="تحريك لأعلى"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveCategory(category.id, "down")}
                  disabled={index === sorted.length - 1}
                  className="rounded-2xl bg-[#F8F4EF] p-3 disabled:opacity-40"
                  title="تحريك لأسفل"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleField(category.id, "visible")}
                  className="rounded-2xl bg-[#F8F4EF] p-3"
                  title={category.visible ? "إخفاء" : "إظهار"}
                >
                  {category.visible ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => toggleField(category.id, "featured")}
                  className={`rounded-2xl p-3 ${
                    category.featured ? "bg-amber-50 text-amber-700" : "bg-[#F8F4EF]"
                  }`}
                  title="تبديل مميز"
                >
                  <Star className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(category)}
                  className="rounded-2xl bg-[#F8F4EF] p-3"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeCategory(category.id)}
                  className="rounded-2xl bg-red-50 p-3 text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </SoftCard>
        ))}
      </div>
    </BentoCard>
  );
}
