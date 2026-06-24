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
import { ProductMediaDisplay } from "@/components/cafe/product-image";
import { uploadImageAction, uploadProductVideoAction } from "@/app/actions/upload";
import {
  ImagePipelineError,
  MAX_UPLOAD_BYTES,
  isHttpImageUrl,
  optimizeImageForStorage,
  type OptimizedImageResult,
} from "@/lib/cafe/image-asset-pipeline";
import {
  revokeObjectUrl,
} from "@/lib/cafe/local-asset-store";
import { Modal } from "@/components/dashboard/ui/modal";
import { formatSar } from "@/lib/format";
import {
  isPromoActive,
  PROMO_KINDS,
  promoBadgeText,
  type MenuImageVariant,
  type MenuProduct,
  type ProductPromo,
  type PromoKind,
} from "@/lib/mock/menu";
import {
  getCategoryNameById,
  type MenuCategoryRecord,
} from "@/lib/mock/menu-categories";
import { getBusinessCopy } from "@/lib/platform/business-copy";

type Props = {
  open: boolean;
  mode: "add" | "edit";
  editingProduct: MenuProduct | null;
  productList: MenuProduct[];
  categories: MenuCategoryRecord[];
  businessCategory?: string;
  onCategoriesChange: (
    categories: MenuCategoryRecord[]
  ) => Promise<MenuCategoryRecord[]> | MenuCategoryRecord[] | void;
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

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;
const ACCEPTED_VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const ACCEPTED_VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"];

type PendingProductImage = {
  id: string;
  optimized: OptimizedImageResult;
  previewUrl: string;
};

function normalizeMime(type: string) {
  return type.toLowerCase().split(";")[0].trim();
}

function isVideoFile(file: File) {
  const mime = normalizeMime(file.type || "");
  const name = file.name.toLowerCase();
  return (
    ACCEPTED_VIDEO_MIMES.has(mime) ||
    ACCEPTED_VIDEO_EXTENSIONS.some((extension) => name.endsWith(extension))
  );
}

function videoMimeFromFile(file: File) {
  const mime = normalizeMime(file.type || "");
  if (ACCEPTED_VIDEO_MIMES.has(mime)) return mime;
  const name = file.name.toLowerCase();
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".mp4")) return "video/mp4";
  return undefined;
}

function isPersistableUrl(value?: string | null) {
  return Boolean(value && (value.startsWith("http://") || value.startsWith("https://")));
}

function buildPromoFromForm(
  linked: boolean,
  kind: PromoKind,
  discountMode: "percent" | "fixed_price",
  discountPercent: string,
  discountedPrice: string,
  freeProductId: string,
  customText: string,
  startDate: string,
  endDate: string
): ProductPromo | null {
  if (!linked || !startDate || !endDate) return null;

  if (kind === "خصم") {
    return {
      kind,
      discountMode,
      discountPercent: discountMode === "percent" ? Number(discountPercent) || 10 : undefined,
      discountedPrice: discountMode === "fixed_price" ? Number(discountedPrice) || 0 : undefined,
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
  categories,
  businessCategory,
  onCategoriesChange,
  onClose,
  onSave,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const copy = getBusinessCopy(businessCategory);
  const isEvents = copy.kind === "events";
  const productNoun = isEvents ? "التذكرة أو الباقة" : "المنتج";
  const productNameLabel = isEvents ? "اسم التذكرة أو الباقة" : "اسم المنتج";
  const categoryLabel = isEvents ? "نوع التذكرة أو الفئة" : "التصنيف";
  const descriptionLabel = isEvents ? "وصف التذكرة أو الباقة" : "وصف المنتج";
  const priceLabel = isEvents ? "رسوم الدخول ر.س *" : "السعر ر.س *";
  const detailsLabel = isEvents ? "ما تشمله التذكرة أو الباقة" : "مكونات المنتج";
  const detailsPlaceholder = isEvents ? "مثال: حضور، ورشة، شهادة..." : "مثال: حليب، قهوة...";
  const defaultProductName = isEvents ? "اسم التذكرة أو الباقة" : "اسم المنتج";
  const defaultDescription = isEvents ? "تذكرة أو باقة من قائمة الفعالية" : "منتج من قائمة العلامة التجارية";

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [description, setDescription] = useState("");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageAssetId, setImageAssetId] = useState<string | undefined>();
  const [imageGallery, setImageGallery] = useState<MenuProduct["imageGallery"]>([]);
  const [pendingImages, setPendingImages] = useState<PendingProductImage[]>([]);
  const [legacyExternalImageUrl, setLegacyExternalImageUrl] = useState<string | null>(null);
  const [pendingOptimized, setPendingOptimized] = useState<OptimizedImageResult | null>(null);
  const [optimizingImage, setOptimizingImage] = useState(false);
  const [videoAssetId, setVideoAssetId] = useState<string | undefined>();
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | undefined>();
  const [imageVariant, setImageVariant] = useState<MenuImageVariant>("latte");

  const [calories, setCalories] = useState("");
  const [price, setPrice] = useState("18");
  const [preparationTimeMinutes, setPreparationTimeMinutes] = useState("");
  const [availableForPickup, setAvailableForPickup] = useState(true);
  const [pickupLeadTimeMinutes, setPickupLeadTimeMinutes] = useState("");
  const [eventStartAt, setEventStartAt] = useState("");
  const [eventEndAt, setEventEndAt] = useState("");
  const [venueName, setVenueName] = useState("");
  const [gateName, setGateName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [ticketType, setTicketType] = useState("general_admission");
  const [ticketValidFrom, setTicketValidFrom] = useState("");
  const [ticketValidUntil, setTicketValidUntil] = useState("");
  const [maxPerCustomer, setMaxPerCustomer] = useState("");
  const [checkinPolicy, setCheckinPolicy] = useState<"single_use" | "multi_use">("single_use");

  const [ingredients, setIngredients] = useState<string[]>([]);
  const [ingredientDraft, setIngredientDraft] = useState("");
  const [available, setAvailable] = useState(true);

  const [promoLinked, setPromoLinked] = useState(false);
  const [promoKind, setPromoKind] = useState<PromoKind>("خصم");
  const [promoDiscountMode, setPromoDiscountMode] = useState<"percent" | "fixed_price">("percent");
  const [promoDiscount, setPromoDiscount] = useState("10");
  const [promoDiscountedPrice, setPromoDiscountedPrice] = useState("");
  const [promoFreeId, setPromoFreeId] = useState("");
  const [promoCustom, setPromoCustom] = useState("");
  const [promoStart, setPromoStart] = useState("2026-05-10");
  const [promoEnd, setPromoEnd] = useState("2026-05-31");

  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && editingProduct) {
      setName(editingProduct.name);
      setCategoryId(editingProduct.categoryId ?? "");
      setCreatingCategory(false);
      setNewCategoryName("");
      setDescription(editingProduct.description);
      setImagePreviewUrl(null);
      setImageAssetId(editingProduct.imageAssetId);
      setImageGallery(editingProduct.imageGallery ?? []);
      setPendingImages([]);
      setLegacyExternalImageUrl(
        isHttpImageUrl(editingProduct.imageDataUrl) ? editingProduct.imageDataUrl! : null
      );
      setPendingOptimized(null);
      setVideoAssetId(editingProduct.videoAssetId);
      setPendingVideoFile(null);
      setVideoPreviewUrl(undefined);
      setImageVariant(editingProduct.imageVariant);
      setPrice(String(editingProduct.price));
      setCalories(
        editingProduct.calories === undefined ? "" : String(editingProduct.calories)
      );
      setPreparationTimeMinutes(
        editingProduct.preparationTimeMinutes === undefined
          ? ""
          : String(editingProduct.preparationTimeMinutes)
      );
      setAvailableForPickup(editingProduct.availableForPickup !== false);
      setPickupLeadTimeMinutes(
        editingProduct.pickupLeadTimeMinutes === undefined
          ? ""
          : String(editingProduct.pickupLeadTimeMinutes)
      );
      setEventStartAt(editingProduct.eventTicketSettings?.eventStartAt?.slice(0, 16) ?? "");
      setEventEndAt(editingProduct.eventTicketSettings?.eventEndAt?.slice(0, 16) ?? "");
      setVenueName(editingProduct.eventTicketSettings?.venueName ?? "");
      setGateName(editingProduct.eventTicketSettings?.gateName ?? "");
      setCapacity(editingProduct.eventTicketSettings?.capacity == null ? "" : String(editingProduct.eventTicketSettings.capacity));
      setTicketType(editingProduct.eventTicketSettings?.ticketType ?? "general_admission");
      setTicketValidFrom(editingProduct.eventTicketSettings?.ticketValidFrom?.slice(0, 16) ?? "");
      setTicketValidUntil(editingProduct.eventTicketSettings?.ticketValidUntil?.slice(0, 16) ?? "");
      setMaxPerCustomer(editingProduct.eventTicketSettings?.maxPerCustomer == null ? "" : String(editingProduct.eventTicketSettings.maxPerCustomer));
      setCheckinPolicy(editingProduct.eventTicketSettings?.checkinPolicy ?? "single_use");
      setIngredients([...editingProduct.ingredients]);
      setAvailable(editingProduct.available);

      const promo = editingProduct.promo;
      setPromoLinked(!!promo);

      if (promo) {
        setPromoKind(promo.kind);
        setPromoDiscountMode(promo.discountMode ?? "percent");
        setPromoDiscount(String(promo.discountPercent ?? 10));
        setPromoDiscountedPrice(promo.discountedPrice == null ? "" : String(promo.discountedPrice));
        setPromoFreeId(promo.freeProductId ?? "");
        setPromoCustom(promo.customText ?? "");
        setPromoStart(promo.startDate);
        setPromoEnd(promo.endDate);
      }
    } else {
      setName("");
      setCategoryId(categories[0]?.id ?? "");
      setCreatingCategory(false);
      setNewCategoryName("");
      setDescription("");
      setImagePreviewUrl(null);
      setImageAssetId(undefined);
      setImageGallery([]);
      setPendingImages([]);
      setLegacyExternalImageUrl(null);
      setPendingOptimized(null);
      setVideoAssetId(undefined);
      setPendingVideoFile(null);
      setVideoPreviewUrl(undefined);
      setImageVariant("latte");
      setPrice("18");
      setCalories("");
      setPreparationTimeMinutes("");
      setAvailableForPickup(true);
      setPickupLeadTimeMinutes("");
      setEventStartAt("");
      setEventEndAt("");
      setVenueName("");
      setGateName("");
      setCapacity("");
      setTicketType("general_admission");
      setTicketValidFrom("");
      setTicketValidUntil("");
      setMaxPerCustomer("");
      setCheckinPolicy("single_use");
      setIngredients([]);
      setIngredientDraft("");
      setAvailable(true);
      setPromoLinked(false);
      setPromoKind("خصم");
      setPromoDiscountMode("percent");
      setPromoDiscount("10");
      setPromoDiscountedPrice("");
      setPromoFreeId("");
      setPromoCustom("");
      setPromoStart("2026-05-10");
      setPromoEnd("2026-05-31");
    }
  }, [open, mode, editingProduct, categories]);

  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  async function resolveCategoryRecord(): Promise<MenuCategoryRecord | undefined> {
    if (creatingCategory) {
      if (!newCategoryName.trim()) return undefined;
      const now = new Date().toISOString().slice(0, 10);
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.sortOrder), 0);
      const newCat: MenuCategoryRecord = {
        id: `cat_${Date.now()}`,
        cafeSlug: "test-cafe",
        name: newCategoryName.trim(),
        sortOrder: maxOrder + 1,
        visible: true,
        featured: false,
        createdAt: now,
        updatedAt: now,
      };
      const nextCategories = [...categories, newCat];
      const savedCategories = await onCategoriesChange(nextCategories);
      const availableCategories = Array.isArray(savedCategories)
        ? savedCategories
        : nextCategories;

      return (
        availableCategories.find((item) => item.id === newCat.id) ??
        availableCategories.find(
          (item) => item.name === newCat.name && item.sortOrder === newCat.sortOrder
        ) ??
        availableCategories.find((item) => item.name === newCat.name)
      );
    }
    return categories.find((item) => item.id === categoryId);
  }

  function addIngredient() {
    const value = ingredientDraft.trim();
    if (!value) return;

    setIngredients((prev) => [...prev, value]);
    setIngredientDraft("");
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setOptimizingImage(true);
    try {
      const optimized = await optimizeImageForStorage(file, "product-image");
      if (imagePreviewUrl?.startsWith("blob:")) revokeObjectUrl(imagePreviewUrl);
      setImagePreviewUrl(URL.createObjectURL(optimized.blob));
      setPendingOptimized(optimized);
      setLegacyExternalImageUrl(null);
    } catch (err) {
      alert(
        err instanceof ImagePipelineError
          ? err.message
          : "تعذر قراءة الصورة، جرّب ملف PNG أو JPG أو WEBP"
      );
    } finally {
      setOptimizingImage(false);
    }
  }

  async function onPickMediaFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    setOptimizingImage(true);
    try {
      const nextImages: PendingProductImage[] = [];

      for (const file of files) {
        if (isVideoFile(file)) {
          if (file.size > MAX_UPLOAD_BYTES) {
            throw new ImagePipelineError("حجم الفيديو كبير جدًا، اختر ملفًا أقل من 40MB");
          }

          if (videoPreviewUrl?.startsWith("blob:")) revokeObjectUrl(videoPreviewUrl);
          setPendingVideoFile(file);
          setVideoPreviewUrl(URL.createObjectURL(file));
          continue;
        }

        const optimized = await optimizeImageForStorage(file, "product-image");
        nextImages.push({
          id: crypto.randomUUID(),
          optimized,
          previewUrl: URL.createObjectURL(optimized.blob),
        });
      }

      if (nextImages.length) {
        setPendingImages((current) => [...current, ...nextImages]);
        setPendingOptimized(nextImages[0].optimized);
        if (imagePreviewUrl?.startsWith("blob:")) revokeObjectUrl(imagePreviewUrl);
        setImagePreviewUrl(nextImages[0].previewUrl);
        setLegacyExternalImageUrl(null);
      }
    } catch (err) {
      alert(
        err instanceof ImagePipelineError
          ? err.message
          : "تعذر قراءة الملف، جرّب صورة PNG أو JPG أو WEBP أو فيديو MP4"
      );
    } finally {
      setOptimizingImage(false);
    }
  }

  const resolvedCategoryId = creatingCategory
    ? undefined
    : categoryId || undefined;
  const displayCategory = getCategoryNameById(
    categories,
    resolvedCategoryId,
    creatingCategory ? newCategoryName.trim() || "أخرى" : "أخرى"
  );

  const previewProduct: MenuProduct = useMemo(() => {
    const promo = buildPromoFromForm(
      promoLinked,
      promoKind,
      promoDiscountMode,
      promoDiscount,
      promoDiscountedPrice,
      promoFreeId,
      promoCustom,
      promoStart,
      promoEnd
    );

    return {
      id: "preview",
      name: name.trim() || defaultProductName,
      category: displayCategory,
      categoryId: resolvedCategoryId,
      description: description.trim() || defaultDescription,
      imageAssetId,
      imageDataUrl: legacyExternalImageUrl,
      imageGallery: [
        ...(imageGallery ?? []),
        ...pendingImages.map((item) => ({
          imageDataUrl: item.previewUrl,
          alt: name.trim() || undefined,
        })),
      ],
      videoAssetId,
      media: [
        ...(pendingVideoFile && videoPreviewUrl
          ? [{
              type: "video" as const,
              url: videoPreviewUrl,
              mimeType: videoMimeFromFile(pendingVideoFile),
            }]
          : videoAssetId
            ? [{ type: "video" as const, assetId: videoAssetId }]
            : []),
      ],
      imageVariant,
      price: Number(price) || 0,
      calories: calories.trim() ? Number(calories) || 0 : undefined,
      loyaltyPoints: 0,
      preparationTimeMinutes: preparationTimeMinutes.trim()
        ? Number(preparationTimeMinutes) || undefined
        : undefined,
      redeemableWithPoints: false,
      redemptionPoints: undefined,
      availableForPickup,
      pickupLeadTimeMinutes: pickupLeadTimeMinutes.trim()
        ? Number(pickupLeadTimeMinutes) || undefined
        : undefined,
      ingredients: ingredients.length ? ingredients : ["مكون"],
      available,
      promo,
      eventTicketSettings: isEvents
        ? {
            eventStartAt: eventStartAt || null,
            eventEndAt: eventEndAt || null,
            venueName: venueName.trim() || null,
            gateName: gateName.trim() || null,
            capacity: capacity.trim() ? Number(capacity) || null : null,
            ticketType,
            ticketValidFrom: ticketValidFrom || null,
            ticketValidUntil: ticketValidUntil || null,
            maxPerCustomer: maxPerCustomer.trim() ? Number(maxPerCustomer) || null : null,
            checkinPolicy,
          }
        : null,
    };
  }, [
    isEvents,
    name,
    displayCategory,
    resolvedCategoryId,
    description,
    imageAssetId,
    imageGallery,
    pendingImages,
    legacyExternalImageUrl,
    imagePreviewUrl,
    pendingOptimized,
    videoAssetId,
    pendingVideoFile,
    videoPreviewUrl,
    imageVariant,
    price,
    calories,
    preparationTimeMinutes,
    availableForPickup,
    pickupLeadTimeMinutes,
    eventStartAt,
    eventEndAt,
    venueName,
    gateName,
    capacity,
    ticketType,
    ticketValidFrom,
    ticketValidUntil,
    maxPerCustomer,
    checkinPolicy,
    ingredients,
    available,
    promoLinked,
    promoKind,
    promoDiscountMode,
    promoDiscount,
    promoDiscountedPrice,
    promoFreeId,
    promoCustom,
    promoStart,
    promoEnd,
  ]);

  const freeProductOptions = productList.filter(
    (product) => product.id !== editingProduct?.id
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      alert(isEvents ? "اكتب اسم التذكرة أو الباقة" : "اكتب اسم المنتج");
      return;
    }

        if (!price || Number.isNaN(Number(price))) {
      alert("السعر مطلوب");
      return;
    }

    if (creatingCategory && !newCategoryName.trim()) {
      alert("اكتب اسم التصنيف الجديد");
      return;
    }

    if (!creatingCategory && !categoryId) {
      alert(isEvents ? "اختر نوع التذكرة أو الفئة" : "اختر تصنيفًا للمنتج");
      return;
    }

    const categoryRecord = await resolveCategoryRecord();
    if (!categoryRecord || !UUID_PATTERN.test(categoryRecord.id)) {
      alert("تعذر حفظ التصنيف");
      return;
    }

    const nextCategoryId = categoryRecord.id;
    const categoryName = categoryRecord.name;

    if (promoLinked && promoKind === "منتج مجاني مع الطلب" && !promoFreeId) {
      alert(isEvents ? "اختر التذكرة أو الباقة المجانية" : "اختر المنتج المجاني");
      return;
    }

    const promo = buildPromoFromForm(
      promoLinked,
      promoKind,
      promoDiscountMode,
      promoDiscount,
      promoDiscountedPrice,
      promoFreeId,
      promoCustom,
      promoStart,
      promoEnd
    );

    const productId = editingProduct?.id || crypto.randomUUID();
    let finalAssetId = imageAssetId;
    let finalVideoAssetId = videoAssetId;
    const finalGallery = (imageGallery ?? []).filter(
      (item) => item.imageAssetId || isPersistableUrl(item.imageDataUrl)
    );

    try {
      for (const pendingImage of pendingImages) {
        const formData = new FormData();
        formData.append("file", pendingImage.optimized.blob, pendingImage.optimized.fileName);
        const uploaded = await uploadImageAction(
          "menu-products",
          formData,
          "product",
          productId
        );
        const galleryItem = {
          imageAssetId: uploaded.storagePath,
          imageDataUrl: null,
          alt: name.trim() || undefined,
        };
        finalGallery.push(galleryItem);
        finalAssetId = finalAssetId ?? uploaded.storagePath;
      }

      if (pendingVideoFile) {
        const formData = new FormData();
        formData.append("file", pendingVideoFile, pendingVideoFile.name);
        const uploaded = await uploadProductVideoAction(formData, productId);
        finalVideoAssetId = uploaded.storagePath;
      }
    } catch {
      alert(isEvents ? "تعذر حفظ صورة التذكرة أو الباقة محليًا" : "تعذر حفظ صورة المنتج محليًا");
      return;
    }

    const payload: MenuProduct = {
      id: productId,
      name: name.trim(),
      category: categoryName,
      categoryId: nextCategoryId,
      description: description.trim() || defaultDescription,
      imageAssetId: finalAssetId,
      imageDataUrl: isPersistableUrl(legacyExternalImageUrl) ? legacyExternalImageUrl : null,
      imageGallery: finalGallery,
      videoAssetId: finalVideoAssetId,
      media: [
        ...(finalVideoAssetId
          ? [{
              type: "video" as const,
              assetId: finalVideoAssetId,
              mimeType: pendingVideoFile ? videoMimeFromFile(pendingVideoFile) : undefined,
            }]
          : []),
        ...finalGallery.map((item) => ({
          type: "image" as const,
          assetId: item.imageAssetId,
          url: item.imageDataUrl ?? null,
          alt: item.alt,
        })),
      ],
      imageVariant,
      price: Number(price),
      calories: calories.trim() ? Number(calories) || 0 : undefined,
      loyaltyPoints: 0,
      preparationTimeMinutes: preparationTimeMinutes.trim()
        ? Number(preparationTimeMinutes) || undefined
        : undefined,
      redeemableWithPoints: false,
      redemptionPoints: undefined,
      availableForPickup,
      pickupLeadTimeMinutes: pickupLeadTimeMinutes.trim()
        ? Number(pickupLeadTimeMinutes) || undefined
        : undefined,
      ingredients,
      available,
      promo,
      eventTicketSettings: isEvents
        ? {
            eventStartAt: eventStartAt || null,
            eventEndAt: eventEndAt || null,
            venueName: venueName.trim() || null,
            gateName: gateName.trim() || null,
            capacity: capacity.trim() ? Number(capacity) || null : null,
            ticketType,
            ticketValidFrom: ticketValidFrom || null,
            ticketValidUntil: ticketValidUntil || null,
            maxPerCustomer: maxPerCustomer.trim() ? Number(maxPerCustomer) || null : null,
            checkinPolicy,
          }
        : null,
    };

    onSave(payload);
    if (imagePreviewUrl?.startsWith("blob:")) revokeObjectUrl(imagePreviewUrl);
    pendingImages.forEach((item) => revokeObjectUrl(item.previewUrl));
    if (videoPreviewUrl?.startsWith("blob:")) revokeObjectUrl(videoPreviewUrl);
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
      title={mode === "add" ? `إضافة ${productNoun}` : `تعديل ${productNoun}`}
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
            {mode === "add" ? `حفظ ${productNoun}` : `تحديث ${productNoun}`}
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
              {productNameLabel}
            </span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isEvents ? "مثال: تذكرة دخول عامة" : "مثال: لاتيه فانيلا"}
              className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
            />
          </label>

          <label className="block">
            <span className="text-xs font-black text-[#7A6255]">{categoryLabel}</span>
            <select
              value={creatingCategory ? "__new__" : categoryId}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setCreatingCategory(true);
                  setCategoryId("");
                } else {
                  setCreatingCategory(false);
                  setCategoryId(e.target.value);
                }
              }}
              className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
            >
              {sortedCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              <option value="__new__">+ إنشاء تصنيف جديد</option>
            </select>
          </label>

          {creatingCategory ? (
            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                اسم التصنيف الجديد
              </span>
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="اكتب اسم التصنيف"
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="text-xs font-black text-[#7A6255]">
              {descriptionLabel}
            </span>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isEvents ? "اكتب وصف التذكرة أو الباقة كما سيظهر للعميل" : "اكتب وصف المنتج كما سيظهر للعميل"}
              className="mt-2 w-full resize-none rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
            />
          </label>

          <div className="rounded-3xl border border-[#E5D8CD] bg-white p-4">
            <p className="text-xs font-black text-[#7A6255]">{isEvents ? "صورة التذكرة أو الباقة" : "صورة المنتج"}</p>

            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={onPickMediaFiles}
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={optimizingImage}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#F8F4EF] px-4 py-3 text-sm font-black text-[#3A2117] disabled:opacity-60"
              >
                <ImagePlus className="h-5 w-5" />
                {optimizingImage ? "جاري تحسين الصورة..." : "اختيار صورة"}
              </button>

              {imagePreviewUrl || imageAssetId || legacyExternalImageUrl || imageGallery?.length || pendingImages.length || videoAssetId || pendingVideoFile ? (
                <button
                  type="button"
                  onClick={() => {
                    if (imagePreviewUrl?.startsWith("blob:")) revokeObjectUrl(imagePreviewUrl);
                    pendingImages.forEach((item) => revokeObjectUrl(item.previewUrl));
                    if (videoPreviewUrl?.startsWith("blob:")) revokeObjectUrl(videoPreviewUrl);
                    setImagePreviewUrl(null);
                    setPendingOptimized(null);
                    setPendingImages([]);
                    setImageGallery([]);
                    setImageAssetId(undefined);
                    setLegacyExternalImageUrl(null);
                    setVideoAssetId(undefined);
                    setPendingVideoFile(null);
                    setVideoPreviewUrl(undefined);
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                  إزالة
                </button>
              ) : null}
            </div>

            {pendingImages.length || imageGallery?.length || videoPreviewUrl || videoAssetId ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {videoPreviewUrl || videoAssetId ? (
                  <span className="rounded-2xl bg-[#3A2117] px-3 py-2 text-xs font-black text-[#F8E8D2]">
                    فيديو
                  </span>
                ) : null}
                {imageGallery?.map((item, index) => (
                  <span key={item.imageAssetId || item.imageDataUrl || index} className="rounded-2xl bg-[#F8F4EF] px-3 py-2 text-xs font-black text-[#3A2117]">
                    صورة {index + 1}
                  </span>
                ))}
                {pendingImages.map((item, index) => (
                  <span key={item.id} className="rounded-2xl bg-[#F8F4EF] px-3 py-2 text-xs font-black text-[#3A2117]">
                    صورة جديدة {index + 1}
                  </span>
                ))}
              </div>
            ) : null}

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

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                {isEvents ? "السعة التقريبية اختياري" : "السعرات الحرارية اختياري"}
              </span>
              <input
                inputMode="numeric"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder={isEvents ? "مثال: 120" : "مثال: 220"}
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                {priceLabel}
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


          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                {isEvents ? "مدة الدخول أو الجلسة (دقيقة) اختياري" : "وقت التحضير (دقيقة) اختياري"}
              </span>
              <input
                inputMode="numeric"
                value={preparationTimeMinutes}
                onChange={(e) => setPreparationTimeMinutes(e.target.value)}
                placeholder="مثال: 5"
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black text-[#7A6255]">
                {isEvents ? "مهلة تجهيز التذكرة (دقيقة) اختياري" : "مهلة الاستلام (دقيقة) اختياري"}
              </span>
              <input
                inputMode="numeric"
                value={pickupLeadTimeMinutes}
                onChange={(e) => setPickupLeadTimeMinutes(e.target.value)}
                placeholder="مثال: 15"
                className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
              />
            </label>
          </div>

          <fieldset className="rounded-3xl border border-[#E5D8CD] bg-white p-4">
            <legend className="px-2 text-xs font-black text-[#3A2117]">
              {isEvents ? "خيارات شراء التذكرة" : "خيارات الاستلام"}
            </legend>

            <label className="mt-3 flex items-center gap-2 text-sm font-black text-[#3A2117]">
              <input
                type="checkbox"
                checked={availableForPickup}
                onChange={(e) => setAvailableForPickup(e.target.checked)}
              />
              {isEvents ? "متاحة للشراء" : "متاح للاستلام"}
            </label>

          </fieldset>

          {isEvents ? (
            <fieldset className="rounded-3xl border border-[#E5D8CD] bg-white p-4">
              <legend className="px-2 text-xs font-black text-[#3A2117]">
                إعدادات تذكرة الدخول
              </legend>

              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-black text-[#7A6255]">نوع التذكرة</span>
                  <select
                    value={ticketType}
                    onChange={(e) => setTicketType(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
                  >
                    <option value="general_admission">دخول عام</option>
                    <option value="vip">VIP</option>
                    <option value="workshop">ورشة أو جلسة</option>
                    <option value="bundle">باقة</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-black text-[#7A6255]">سياسة الدخول</span>
                  <select
                    value={checkinPolicy}
                    onChange={(e) => setCheckinPolicy(e.target.value as "single_use" | "multi_use")}
                    className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
                  >
                    <option value="single_use">مرة واحدة</option>
                    <option value="multi_use">دخول متعدد</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-black text-[#7A6255]">تاريخ بداية الفعالية</span>
                  <input
                    type="datetime-local"
                    value={eventStartAt}
                    onChange={(e) => setEventStartAt(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-black text-[#7A6255]">تاريخ نهاية الفعالية</span>
                  <input
                    type="datetime-local"
                    value={eventEndAt}
                    onChange={(e) => setEventEndAt(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-black text-[#7A6255]">تاريخ بداية الصلاحية</span>
                  <input
                    type="datetime-local"
                    value={ticketValidFrom}
                    onChange={(e) => setTicketValidFrom(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-black text-[#7A6255]">تاريخ نهاية الصلاحية</span>
                  <input
                    type="datetime-local"
                    value={ticketValidUntil}
                    onChange={(e) => setTicketValidUntil(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-black text-[#7A6255]">موقع الفعالية</span>
                  <input
                    value={venueName}
                    onChange={(e) => setVenueName(e.target.value)}
                    placeholder="مثال: قاعة المؤتمرات الرئيسية"
                    className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-black text-[#7A6255]">بوابة الدخول</span>
                  <input
                    value={gateName}
                    onChange={(e) => setGateName(e.target.value)}
                    placeholder="مثال: البوابة A"
                    className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-black text-[#7A6255]">السعة</span>
                  <input
                    inputMode="numeric"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    placeholder="مثال: 120"
                    className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-black text-[#7A6255]">الحد الأقصى لكل عميل</span>
                  <input
                    inputMode="numeric"
                    value={maxPerCustomer}
                    onChange={(e) => setMaxPerCustomer(e.target.value)}
                    placeholder="مثال: 4"
                    className="mt-2 w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold text-[#3A2117] outline-none focus:ring-2 focus:ring-[#CBB29C]"
                  />
                </label>
              </div>
            </fieldset>
          ) : null}

          <div>
            <span className="text-xs font-black text-[#7A6255]">
              {detailsLabel}
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
                placeholder={detailsPlaceholder}
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
              {isEvents ? "حالة التذكرة أو الباقة" : "حالة المنتج"}
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
                  <div className="space-y-3 rounded-2xl bg-[#F8F4EF] p-3">
                    <p className="text-xs font-black text-[#7A6255]">
                      طريقة الخصم
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="flex items-center gap-2 rounded-xl bg-white p-3 text-sm font-black text-[#3A2117]">
                        <input
                          type="radio"
                          checked={promoDiscountMode === "percent"}
                          onChange={() => setPromoDiscountMode("percent")}
                        />
                        نسبة مئوية تطبق على السعر الأساسي
                      </label>
                      <label className="flex items-center gap-2 rounded-xl bg-white p-3 text-sm font-black text-[#3A2117]">
                        <input
                          type="radio"
                          checked={promoDiscountMode === "fixed_price"}
                          onChange={() => setPromoDiscountMode("fixed_price")}
                        />
                        {isEvents ? "رسوم الدخول بعد الخصم" : "سعر المنتج بعد الخصم"}
                      </label>
                    </div>

                    {promoDiscountMode === "percent" ? (
                      <input
                        value={promoDiscount}
                        onChange={(e) => setPromoDiscount(e.target.value)}
                        placeholder="نسبة الخصم مثل 15"
                        className="w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold outline-none"
                      />
                    ) : (
                      <input
                        value={promoDiscountedPrice}
                        onChange={(e) => setPromoDiscountedPrice(e.target.value)}
                        placeholder="السعر بعد الخصم مثل 19"
                        className="w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold outline-none"
                      />
                    )}
                  </div>
                ) : null}

                {promoKind === "منتج مجاني مع الطلب" ? (
                  <select
                    value={promoFreeId}
                    onChange={(e) => setPromoFreeId(e.target.value)}
                    className="w-full rounded-2xl border border-[#E5D8CD] bg-white px-4 py-4 text-right text-sm font-bold outline-none"
                  >
                    <option value="">{isEvents ? "اختر تذكرة أو باقة مجانية" : "اختر منتج مجاني"}</option>
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
                  <label className="block">
                    <span className="text-xs font-black text-[#7A6255]">تاريخ بداية العرض</span>
                    <input
                      type="date"
                      value={promoStart}
                      onChange={(e) => setPromoStart(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-[#E5D8CD] px-4 py-4 text-sm font-bold outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-black text-[#7A6255]">تاريخ نهاية العرض</span>
                    <input
                      type="date"
                      value={promoEnd}
                      onChange={(e) => setPromoEnd(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-[#E5D8CD] px-4 py-4 text-sm font-bold outline-none"
                    />
                  </label>
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
              <ProductMediaDisplay
                product={previewProduct}
                alt=""
                className="h-full w-full object-contain"
                imagePreviewUrl={imagePreviewUrl ?? undefined}
                videoPreviewUrl={videoPreviewUrl}
                fallback={
                  <div
                    className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${variantGradient[previewProduct.imageVariant]}`}
                  >
                    <Coffee className="h-12 w-12 text-white/85" />
                  </div>
                }
              />

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
