"use client";

import {
  Coffee,
  Flame,
  Gift,
  ImagePlus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/dashboard/ui/modal";
import { formatSar } from "@/lib/format";
import {
  isPromoActive,
  MENU_CATEGORIES,
  PROMO_KINDS,
  promoBadgeText,
  type MenuCategory,
  type MenuImageVariant,
  type MenuProduct,
  type ProductPromo,
  type PromoKind,
} from "@/lib/mock/menu";

type Props = {
  open: boolean;
  mode: "add" | "edit";
  editingProduct: MenuProduct | null;
  productList: MenuProduct[];
  onClose: () => void;
  onSave: (product: MenuProduct) => void;
};

const VARIANT_OPTIONS: { id: MenuImageVariant; label: string }[] = [
  { id: "latte", label: "قهوة دافئة" },
  { id: "cold", label: "بارد" },
  { id: "cake", label: "حلويات" },
  { id: "bakery", label: "مخبوزات" },
  { id: "tea", label: "شاي / سبيشل" },
];

function buildPromoFromForm(
  linked: boolean,
  kind: PromoKind,
  discountPercent: string,
  freeProductId: string,
  customText: string,
  startDate: string,
  endDate: string
): ProductPromo | null {
  if (!linked || !startDate || !endDate) return null;

  if (kind === "خصم") {
    return {
      kind,
      discountPercent: Number(discountPercent) || 10,
      startDate,
      endDate,
    };
  }

  if (kind === "منتج مجاني مع الطلب") {
    return {
      kind,
      freeProductId: freeProductId || undefined,
      startDate,
      endDate,
    };
  }

  return {
    kind,
    customText: customText.trim() || "عرض خاص",
    startDate,
    endDate,
  };
}

export function MenuProductFormModal({
  open,
  mode,
  editingProduct,
  productList,
  onClose,
  onSave,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<MenuCategory>("قهوة");
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageVariant, setImageVariant] = useState<MenuImageVariant>("latte");

  const [calories, setCalories] = useState("");
  const [price, setPrice] = useState("18");
  const [loyaltyPoints, setLoyaltyPoints] = useState("18");

  const [ingredients, setIngredients] = useState<string[]>([]);
  const [ingredientDraft, setIngredientDraft] = useState("");
  const [available, setAvailable] = useState(true);

  const [promoLinked, setPromoLinked] = useState(false);
  const [promoKind, setPromoKind] = useState<PromoKind>("خصم");
  const [promoDiscount, setPromoDiscount] = useState("10");
  const [promoFreeId, setPromoFreeId] = useState("");
  const [promoCustom, setPromoCustom] = useState("");
  const [promoStart, setPromoStart] = useState("2026-05-10");
  const [promoEnd, setPromoEnd] = useState("2026-05-31");

  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && editingProduct) {
      const isKnownCategory = MENU_CATEGORIES.includes(editingProduct.category);

      setName(editingProduct.name);
      setCategory(isKnownCategory ? editingProduct.category : "أخرى");
      setCustomCategory(isKnownCategory ? "" : editingProduct.category);
      setDescription(editingProduct.description);
      setImageDataUrl(editingProduct.imageDataUrl ?? null);
      setImageVariant(editingProduct.imageVariant);
      setPrice(String(editingProduct.price));
      setCalories(
        editingProduct.calories === undefined ? "" : String(editingProduct.calories)
      );
      setLoyaltyPoints(String(editingProduct.loyaltyPoints));
      setIngredients([...editingProduct.ingredients]);
      setAvailable(editingProduct.available);

      const promo = editingProduct.promo;
      setPromoLinked(!!promo);

      if (promo) {
        setPromoKind(promo.kind);
        setPromoDiscount(String(promo.discountPercent ?? 10));
        setPromoFreeId(promo.freeProductId ?? "");
        setPromoCustom(promo.customText ?? "");
        setPromoStart(promo.startDate);
        setPromoEnd(promo.endDate);
      }
    } else {
      setName("");
      setCategory("قهوة");
      setCustomCategory("");
      setDescription("");
      setImageDataUrl(null);
      setImageVariant("latte");
      setPrice("18");
      setCalories("");
      setLoyaltyPoints("18");
      setIngredients([]);
      setIngredientDraft("");
      setAvailable(true);
      setPromoLinked(false);
      setPromoKind("خصم");
      setPromoDiscount("10");
      setPromoFreeId("");
      setPromoCustom("");
      setPromoStart("2026-05-10");
      setPromoEnd("2026-05-31");
    }
  }, [open, mode, editingProduct]);

  function addIngredient() {
    const value = ingredientDraft.trim();
    if (!value) return;

    setIngredients((prev) => [...prev, value]);
    setIngredientDraft("");
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageDataUrl(reader.result);
      }
    };

    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const finalCategory =
    category === "أخرى" ? customCategory.trim() || "أخرى" : category;

  const previewProduct: MenuProduct = useMemo(() => {
    const promo = buildPromoFromForm(
      promoLinked,
      promoKind,
      promoDiscount,
      promoFreeId,
      promoCustom,
      promoStart,
      promoEnd
    );

    return {
      id: "preview",
      name: name.trim() || "اسم المنتج",
      category: finalCategory,
      description: description.trim() || "وصف مختصر يظهر للعميل في صفحة المنتج.",
      imageDataUrl,
      imageVariant,
      price: Number(price) || 0,
      calories: calories.trim() ? Number(calories) || 0 : undefined,
      loyaltyPoints: Number(loyaltyPoints) || 0,
      ingredients: ingredients.length ? ingredients : ["مكون"],
      available,
      promo,
    };
  }, [
    name,
    finalCategory,
    description,
    imageDataUrl,
    imageVariant,
    price,
    calories,
    loyaltyPoints,
    ingredients,
    available,
    promoLinked,
    promoKind,
    promoDiscount,
    promoFreeId,
    promoCustom,
    promoStart,
    promoEnd,
  ]);

  const freeProductOptions = productList.filter(
    (product) => product.id !== editingProduct?.id
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      alert("اكتب اسم المنتج");
      return;
    }

    if (!description.trim()) {
      alert("اكتب وصف المنتج");
      return;
    }

    if (!price || Number.isNaN(Number(price))) {
      alert("السعر مطلوب");
      return;
    }

    if (!loyaltyPoints || Number.isNaN(Number(loyaltyPoints))) {
      alert("نقاط الولاء مطلوبة");
      return;
    }

    if (category === "أخرى" && !customCategory.trim()) {
      alert("اكتب اسم التصنيف المخصص");
      return;
    }

    if (promoLinked && promoKind === "منتج مجاني مع الطلب" && !promoFreeId) {
      alert("اختر المنتج المجاني");
      return;
    }

    const promo = buildPromoFromForm(
      promoLinked,
      promoKind,
      promoDiscount,
      promoFreeId,
      promoCustom,
      promoStart,
      promoEnd
    );

    const payload: MenuProduct = {
      id: editingProduct?.id ?? "",
      name: name.trim(),
      category: finalCategory,
      description: description.trim(),
      imageDataUrl,
      imageVariant,
      price: Number(price),
      calories: calories.trim() ? Number(calories) || 0 : undefined,
      loyaltyPoints: Number(loyaltyPoints) || 0,
      ingredients,
      available,
      promo,
    };

    onSave(payload);
    onClose();
  }

  const variantGradient: Record<MenuImageVariant, string> = {
    latte: "from-[#3b2416] via-[#5c3d2e] to-[#c78a45]",
    cold: "from-[#1e3a4a] via-[#496b4a] to-[#7eb8b8]",
    cake: "from-[#4a2c3d] via-[#8b5a6b] to-[#d4a59a]",
    bakery: "from-[#5c4a3a] via-[#8b7355] to-[#e8dcc8]",
    tea: "from-[#3d4f3f] via-[#496b4a] to-[#a8c4a9]",
  };

  const promoPreviewActive =
    previewProduct.promo && isPromoActive(previewProduct.promo);

  return (
    <Modal
      open={open}
      title={mode === "add" ? "إضافة منتج جديد" : "تعديل المنتج"}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-[#E5D8CD] px-5 py-3 text-sm font-black text-[#3A2117] hover:bg-[#F8F4EF]"
          >
            إلغاء
          </button>

          <button
            type="submit"
            form="menu-product-form"
            className="rounded-2xl bg-[#3A2117] px-6 py-3 text-sm font-black text-[#F8E8D2]"
          >
            {mode === "add" ? "حفظ المنتج" : "تحديث المنتج"}
          </button>
        </>
      }
    >
      <form
        id="menu-product-form"
        onSubmit={handleSubmit}
        className="grid gap-8 lg:grid-cols-2"
      >
        <div className="space-y-5">
          <label className="block">
            <span className="text-xs font-black text-[#7A6255]">
              اسم المنتج
            </span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: لاتيه فانيلا"
              className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
            />
          </label>

          <label className="block">
            <span className="text-xs font-black text-[#7A6255]">التصنيف</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as MenuCategory)}
              className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
            >
              {MENU_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          {category === "أخرى" ? (
            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                اسم التصنيف المخصص
              </span>
              <input
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="اكتب اسم التصنيف"
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="text-xs font-black text-[#7A6255]">
              وصف المنتج
            </span>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اكتب وصف المنتج كما سيظهر للعميل"
              className="mt-2 w-full resize-none rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
            />
          </label>

          <div className="rounded-3xl border border-[#E5D8CD] bg-white p-4">
            <p className="text-xs font-black text-[#7A6255]">صورة المنتج</p>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickFile}
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#F8F4EF] px-4 py-3 text-sm font-black text-[#3A2117]"
              >
                <ImagePlus className="h-5 w-5" />
                اختيار صورة
              </button>

              {imageDataUrl ? (
                <button
                  type="button"
                  onClick={() => setImageDataUrl(null)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                  إزالة
                </button>
              ) : null}
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-black text-[#7A6255]">
                خلفية احتياطية عند عدم رفع صورة
              </span>
              <select
                value={imageVariant}
                onChange={(e) =>
                  setImageVariant(e.target.value as MenuImageVariant)
                }
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              >
                {VARIANT_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                السعرات الحرارية اختياري
              </span>
              <input
                inputMode="numeric"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder="مثال: 220"
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                السعر ر.س *
              </span>
              <input
                required
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="مثال: 18"
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                نقاط الولاء *
              </span>
              <input
                required
                inputMode="numeric"
                value={loyaltyPoints}
                onChange={(e) => setLoyaltyPoints(e.target.value)}
                placeholder="مثال: 18"
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>
          </div>

          <div>
            <span className="text-xs font-black text-[#7A6255]">
              مكونات المنتج
            </span>

            <div className="mt-2 flex gap-2">
              <input
                value={ingredientDraft}
                onChange={(e) => setIngredientDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addIngredient();
                  }
                }}
                placeholder="مثال: حليب، قهوة..."
                className="min-w-0 flex-1 rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />

              <button
                type="button"
                onClick={addIngredient}
                className="rounded-2xl bg-[#3A2117] px-5 py-4 text-sm font-black text-[#F8E8D2]"
              >
                إضافة
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {ingredients.map((ingredient) => (
                <span
                  key={ingredient}
                  className="inline-flex items-center gap-1 rounded-full bg-[#EFE8DF] px-3 py-1 text-xs font-black text-[#3A2117]"
                >
                  {ingredient}
                  <button
                    type="button"
                    onClick={() =>
                      setIngredients((prev) =>
                        prev.filter((item) => item !== ingredient)
                      )
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <fieldset className="rounded-3xl border border-[#E5D8CD] bg-white p-4">
            <legend className="px-2 text-xs font-black text-[#3A2117]">
              حالة المنتج
            </legend>

            <div className="mt-3 flex gap-5">
              <label className="flex items-center gap-2 text-sm font-black text-[#3A2117]">
                <input
                  type="radio"
                  checked={available}
                  onChange={() => setAvailable(true)}
                />
                متاح
              </label>

              <label className="flex items-center gap-2 text-sm font-black text-[#3A2117]">
                <input
                  type="radio"
                  checked={!available}
                  onChange={() => setAvailable(false)}
                />
                غير متاح
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded-3xl border border-[#E5D8CD] bg-white p-4">
            <legend className="px-2 text-xs font-black text-[#3A2117]">
              هل يوجد عرض مرتبط؟
            </legend>

            <div className="mt-3 flex gap-5">
              <label className="flex items-center gap-2 text-sm font-black text-[#3A2117]">
                <input
                  type="radio"
                  checked={!promoLinked}
                  onChange={() => setPromoLinked(false)}
                />
                لا
              </label>

              <label className="flex items-center gap-2 text-sm font-black text-[#3A2117]">
                <input
                  type="radio"
                  checked={promoLinked}
                  onChange={() => setPromoLinked(true)}
                />
                نعم
              </label>
            </div>

            {promoLinked ? (
              <div className="mt-5 space-y-4 border-t border-[#E5D8CD] pt-4">
                <label className="block">
                  <span className="text-xs font-black text-[#7A6255]">
                    نوع العرض
                  </span>
                  <select
                    value={promoKind}
                    onChange={(e) =>
                      setPromoKind(e.target.value as PromoKind)
                    }
                    className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none"
                  >
                    {PROMO_KINDS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                {promoKind === "خصم" ? (
                  <input
                    value={promoDiscount}
                    onChange={(e) => setPromoDiscount(e.target.value)}
                    placeholder="نسبة الخصم"
                    className="w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold outline-none"
                  />
                ) : null}

                {promoKind === "منتج مجاني مع الطلب" ? (
                  <select
                    value={promoFreeId}
                    onChange={(e) => setPromoFreeId(e.target.value)}
                    className="w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold outline-none"
                  >
                    <option value="">اختر منتج مجاني</option>
                    {freeProductOptions.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                ) : null}

                {promoKind === "عرض مخصص" ? (
                  <textarea
                    value={promoCustom}
                    onChange={(e) => setPromoCustom(e.target.value)}
                    placeholder="نص العرض"
                    className="h-24 w-full resize-none rounded-2xl border border-[#E5D8CD] p-4 text-right text-sm font-bold outline-none"
                  />
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <input
                    type="date"
                    value={promoStart}
                    onChange={(e) => setPromoStart(e.target.value)}
                    className="rounded-2xl border border-[#E5D8CD] px-4 py-4 text-sm font-bold outline-none"
                  />

                  <input
                    type="date"
                    value={promoEnd}
                    onChange={(e) => setPromoEnd(e.target.value)}
                    className="rounded-2xl border border-[#E5D8CD] px-4 py-4 text-sm font-bold outline-none"
                  />
                </div>
              </div>
            ) : null}
          </fieldset>
        </div>

        <div className="lg:sticky lg:top-0 lg:self-start">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#8B5E3C]" />
            <p className="font-black text-[#3A2117]">معاينة مباشرة</p>
          </div>

          <div className="overflow-hidden rounded-3xl border border-[#E5D8CD] bg-white shadow-xl">
            <div className="relative aspect-[4/3] overflow-hidden bg-[#F8F4EF]">
              {previewProduct.imageDataUrl ? (
                <img
                  src={previewProduct.imageDataUrl}
                  alt=""
                  className="h-full w-full object-contain"
                />
              ) : (
                <div
                  className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${variantGradient[previewProduct.imageVariant]}`}
                >
                  <Coffee className="h-12 w-12 text-white/85" />
                </div>
              )}

              {previewProduct.promo ? (
                <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-xs font-black text-[#3A2117] shadow">
                  <Gift className="h-3.5 w-3.5 text-[#8B5E3C]" />
                  {promoPreviewActive
                    ? promoBadgeText(previewProduct.promo)
                    : "عرض غير نشط"}
                </span>
              ) : null}

              <span
                className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-black shadow ${
                  previewProduct.available
                    ? "bg-green-600 text-white"
                    : "bg-white text-[#3A2117]"
                }`}
              >
                {previewProduct.available ? "متاح" : "غير متاح"}
              </span>
            </div>

            <div className="space-y-3 p-5">
              <p className="text-xs font-black text-[#8B5E3C]">
                {previewProduct.category}
              </p>

              <h3 className="text-xl font-black text-[#3A2117]">
                {previewProduct.name}
              </h3>

              <p className="line-clamp-3 text-sm font-bold leading-7 text-[#7A6255]">
                {previewProduct.description}
              </p>

              <div className="flex flex-wrap gap-4 border-t border-[#E5D8CD] pt-4 text-sm">
                <div>
                  <p className="text-[10px] font-black text-[#7A6255]">
                    السعر
                  </p>
                  <p className="font-black text-[#3A2117]">
                    {formatSar(previewProduct.price)}
                  </p>
                </div>

                <div>
                  <p className="flex items-center gap-1 text-[10px] font-black text-[#7A6255]">
                    <Flame className="h-3 w-3 text-[#8B5E3C]" />
                    سعرات
                  </p>
                  <p className="font-black text-[#3A2117]">
                    {previewProduct.calories === undefined
                      ? "غير محدد"
                      : previewProduct.calories.toLocaleString("ar-SA")}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-black text-[#7A6255]">
                    ولاء
                  </p>
                  <p className="font-black text-[#8B5E3C]">
                    +{previewProduct.loyaltyPoints.toLocaleString("ar-SA")}
                  </p>
                </div>
              </div>

              {previewProduct.promo ? (
                <p className="rounded-2xl bg-[#F8F4EF] px-3 py-2 text-xs font-bold text-[#3A2117]">
                  العرض:{" "}
                  <span className="font-black">
                    {promoBadgeText(previewProduct.promo)}
                  </span>
                </p>
              ) : (
                <p className="rounded-2xl bg-[#F8F4EF] px-3 py-2 text-xs font-bold text-[#7A6255]">
                  بدون عرض مرتبط
                </p>
              )}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}