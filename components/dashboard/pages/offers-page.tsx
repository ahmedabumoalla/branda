"use client";

import { ImagePlus, Megaphone, Plus, Search, TicketPercent, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  FilterBar,
  NeumoInput,
  NeumoSelect,
  NeumoTextarea,
  PrimaryButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { deleteOfferAction, saveOfferAction } from "@/app/actions/offers";
import { uploadImageAction } from "@/app/actions/upload";
import {
  ImagePipelineError,
  isHttpImageUrl,
  optimizeImageForStorage,
  type OptimizedImageResult,
} from "@/lib/cafe/image-asset-pipeline";
import { revokeObjectUrl } from "@/lib/cafe/local-asset-store";
import { formatSar } from "@/lib/format";
import {
  type CafeOffer,
  type OfferPlacement,
  type OfferStatus,
  type OfferType,
} from "@/lib/mock/offers";
import { type MenuProduct } from "@/lib/mock/menu";

type Props = {
  initialOffers: CafeOffer[];
  initialProducts: MenuProduct[];
  configError?: string;
};

const OFFER_TYPES: OfferType[] = [
  "خصم",
  "اشتر واحصل",
  "منتج مجاني مع الطلب",
  "كود مسوق",
  "إطلاق منتج",
  "عرض موسمي",
  "عرض مخصص",
];

const PLACEMENTS: OfferPlacement[] = ["قائمة العروض", "بانر الكوفي", "كلاهما"];

export function OffersPageClient({ initialOffers, initialProducts, configError }: Props) {
  const [offers, setOffers] = useState<CafeOffer[]>(initialOffers);
  const [products] = useState<MenuProduct[]>(initialProducts);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<OfferType | "الكل">("الكل");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [offerType, setOfferType] = useState<OfferType>("خصم");
  const [placement, setPlacement] = useState<OfferPlacement>("كلاهما");
  const [discountPercent, setDiscountPercent] = useState("");
  const [code, setCode] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [codeOwnerName, setCodeOwnerName] = useState("");
  const [codeOwnerPhone, setCodeOwnerPhone] = useState("");
  const [codeOwnerNationalId, setCodeOwnerNationalId] = useState("");
  const [codeOwnerEmail, setCodeOwnerEmail] = useState("");
  const [codeOwnerBankAccount, setCodeOwnerBankAccount] = useState("");
  const [codeOwnerCommissionPercent, setCodeOwnerCommissionPercent] = useState("");

  const [linkedProductId, setLinkedProductId] = useState("");
  const [bannerImageUrl, setBannerImageUrl] = useState("");
  const [pendingBanner, setPendingBanner] = useState<OptimizedImageResult | null>(null);
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | undefined>();
  const [optimizingBanner, setOptimizingBanner] = useState(false);
  const [ctaText, setCtaText] = useState("");

  const [promoProductName, setPromoProductName] = useState("");
  const [promoProductPrice, setPromoProductPrice] = useState("");
  const [promoProductCategory, setPromoProductCategory] = useState("");
  const [promoProductDescription, setPromoProductDescription] = useState("");

  const filtered = useMemo(() => {
    return offers.filter((offer) => {
      const matchQuery =
        offer.title.includes(query) ||
        offer.description.includes(query) ||
        offer.code?.includes(query) ||
        offer.codeOwnerName?.includes(query) ||
        offer.promoProductName?.includes(query);

      const matchType = typeFilter === "الكل" || offer.type === typeFilter;

      return matchQuery && matchType;
    });
  }, [offers, query, typeFilter]);

  const activeOffers = offers.filter((o) => o.status === "نشط").length;

  function resetForm() {
    setTitle("");
    setDescription("");
    setOfferType("خصم");
    setPlacement("كلاهما");
    setDiscountPercent("");
    setCode("");
    setStartDate("");
    setEndDate("");
    setCodeOwnerName("");
    setCodeOwnerPhone("");
    setCodeOwnerNationalId("");
    setCodeOwnerEmail("");
    setCodeOwnerBankAccount("");
    setCodeOwnerCommissionPercent("");
    setLinkedProductId("");
    setBannerImageUrl("");
    if (bannerPreviewUrl?.startsWith("blob:")) revokeObjectUrl(bannerPreviewUrl);
    setBannerPreviewUrl(undefined);
    setPendingBanner(null);
    setCtaText("");
    setPromoProductName("");
    setPromoProductPrice("");
    setPromoProductCategory("");
    setPromoProductDescription("");
  }

  async function addOffer() {
    if (!title.trim()) {
      alert("اكتب عنوان العرض");
      return;
    }

    const linkedProduct = products.find((product) => product.id === linkedProductId);
    const offerId = crypto.randomUUID();

    let bannerAssetId: string | undefined;
    if (pendingBanner) {
      try {
        const formData = new FormData();
        formData.append("file", pendingBanner.blob, "banner.webp");
        const uploaded = await uploadImageAction(
          "offer-banners",
          formData,
          "offer-banner",
          offerId
        );
        bannerAssetId = uploaded.storagePath;
      } catch {
        alert("تعذر حفظ صورة البانر");
        return;
      }
    }

    const offer: CafeOffer = {
      id: offerId,
      title: title.trim(),
      description:
        description.trim() ||
        promoProductDescription.trim() ||
        "عرض ترويجي يظهر مباشرة في صفحة الكوفي.",
      type: offerType,
      status: startDate ? "مجدول" : "نشط",
      placement,
      visibleInCafe: true,

      discountPercent: discountPercent ? Number(discountPercent) : undefined,
      code: code.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,

      codeOwnerName: codeOwnerName.trim() || undefined,
      codeOwnerPhone: codeOwnerPhone.trim() || undefined,
      codeOwnerNationalId: codeOwnerNationalId.trim() || undefined,
      codeOwnerEmail: codeOwnerEmail.trim() || undefined,
      codeOwnerBankAccount: codeOwnerBankAccount.trim() || undefined,
      codeOwnerCommissionPercent: codeOwnerCommissionPercent
        ? Number(codeOwnerCommissionPercent)
        : undefined,

      linkedProductId: linkedProductId || undefined,
      bannerAssetId,
      bannerImageUrl:
        bannerImageUrl.trim() && isHttpImageUrl(bannerImageUrl.trim())
          ? bannerImageUrl.trim()
          : linkedProduct?.imageDataUrl && isHttpImageUrl(linkedProduct.imageDataUrl)
            ? linkedProduct.imageDataUrl
            : "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=1200&auto=format&fit=crop",
      ctaText: ctaText.trim() || "شاهد المنتج",

      promoProductName:
        promoProductName.trim() || linkedProduct?.name || undefined,
      promoProductPrice: promoProductPrice
        ? Number(promoProductPrice)
        : linkedProduct?.price,
      promoProductCategory:
        promoProductCategory.trim() || linkedProduct?.category || undefined,
      promoProductDescription:
        promoProductDescription.trim() || linkedProduct?.description || undefined,
    };

    try {
      const saved = await saveOfferAction(offer);
      setOffers((prev) => [saved, ...prev]);
      resetForm();
    } catch {
      alert("تعذر حفظ العرض");
    }
  }

  async function toggleStatus(id: string) {
    const offer = offers.find((item) => item.id === id);
    if (!offer) return;
    const next = {
      ...offer,
      status: offer.status === "نشط" ? ("متوقف" as const) : ("نشط" as const),
    };
    try {
      const saved = await saveOfferAction(next);
      setOffers((prev) => prev.map((item) => (item.id === id ? saved : item)));
    } catch {
      alert("تعذر تحديث حالة العرض");
    }
  }

  async function toggleVisible(id: string) {
    const offer = offers.find((item) => item.id === id);
    if (!offer) return;
    const next = { ...offer, visibleInCafe: !offer.visibleInCafe };
    try {
      const saved = await saveOfferAction(next);
      setOffers((prev) => prev.map((item) => (item.id === id ? saved : item)));
    } catch {
      alert("تعذر تحديث ظهور العرض");
    }
  }

  async function deleteOffer(id: string) {
    try {
      await deleteOfferAction(id);
      setOffers((prev) => prev.filter((offer) => offer.id !== id));
    } catch {
      alert("تعذر حذف العرض");
    }
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="العروض والخصومات"
        subtitle="أضف خصومات، أكواد مسوقين، إعلانات بانر، أو إطلاق منتجات جديدة وتظهر مباشرة في صفحة الكوفي."
      >
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="إجمالي العروض" value={offers.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="عروض نشطة" value={activeOffers} />
          </BentoCard>
          <BentoCard variant="white" span="2">
            <StatPill label="نتائج البحث" value={filtered.length} />
          </BentoCard>
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="white" span="2">
            <FilterBar>
              <div className="relative flex-1">
                <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7A6255]" />
                <NeumoInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث باسم العرض أو الكود أو صاحب الكود..."
                  className="pr-12"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {["الكل", ...OFFER_TYPES].map((item) => (
                  <button
                    key={item}
                    onClick={() => setTypeFilter(item as OfferType | "الكل")}
                    className={`rounded-2xl px-5 py-3 text-sm font-black ${
                      typeFilter === item
                        ? "bg-[#3A2117] text-[#F8F4EF]"
                        : "bg-[#F8F4EF] text-[#3A2117]"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </FilterBar>

            <div className="grid gap-5">
              {filtered.map((offer) => (
                <SoftCard key={offer.id}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                        {offer.placement === "بانر الكوفي" ? (
                          <Megaphone className="h-7 w-7" />
                        ) : (
                          <TicketPercent className="h-7 w-7" />
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-black text-[#6B3A25]">
                          {offer.type} • {offer.placement}
                        </p>
                        <h2 className="mt-1 text-2xl font-black text-[#3A2117]">
                          {offer.title}
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-[#7A6255]">
                          {offer.description}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-4 py-2 text-xs font-black ${
                        offer.status === "نشط"
                          ? "bg-green-50 text-green-700"
                          : offer.status === "مجدول"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {offer.status}
                    </span>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Info label="الكود" value={offer.code || "بدون كود"} />
                    <Info
                      label="خصم"
                      value={
                        offer.discountPercent ? `${offer.discountPercent}%` : "غير محدد"
                      }
                    />
                    <Info
                      label="صاحب الكود"
                      value={offer.codeOwnerName || "غير محدد"}
                    />
                    <Info
                      label="نسبة صاحب الكود"
                      value={
                        offer.codeOwnerCommissionPercent
                          ? `${offer.codeOwnerCommissionPercent}%`
                          : "غير محدد"
                      }
                    />
                  </div>

                  {offer.placement !== "قائمة العروض" ? (
                    <div className="mt-4 rounded-2xl bg-[#F8F4EF] p-4">
                      <p className="text-xs font-black text-[#6B3A25]">
                        إعلان بانر الكوفي
                      </p>
                      <div className="mt-3 grid gap-4 md:grid-cols-[160px_1fr]">
                        <img
                          src={offer.bannerImageUrl}
                          alt=""
                          className="h-28 w-full rounded-2xl bg-white object-contain"
                        />
                        <div>
                          <h3 className="font-black text-[#3A2117]">
                            {offer.promoProductName || offer.title}
                          </h3>
                          <p className="mt-1 text-sm font-bold text-[#7A6255]">
                            {offer.promoProductDescription || offer.description}
                          </p>
                          <p className="mt-2 font-black text-[#6B3A25]">
                            {offer.promoProductPrice
                              ? formatSar(offer.promoProductPrice)
                              : "بدون سعر"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      onClick={() => toggleStatus(offer.id)}
                      className="rounded-2xl bg-[#3A2117]/10 px-5 py-3 text-sm font-black text-[#3A2117]"
                    >
                      {offer.status === "نشط" ? "إيقاف" : "تفعيل"}
                    </button>

                    <button
                      onClick={() => toggleVisible(offer.id)}
                      className="rounded-2xl bg-[#F8F4EF] px-5 py-3 text-sm font-black text-[#3A2117]"
                    >
                      {offer.visibleInCafe
                        ? "إخفاء من صفحة الكوفي"
                        : "إظهار في صفحة الكوفي"}
                    </button>

                    <button
                      onClick={() => deleteOffer(offer.id)}
                      className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700"
                    >
                      <Trash2 className="inline h-4 w-4" /> حذف
                    </button>
                  </div>
                </SoftCard>
              ))}
            </div>
          </BentoCard>

          <BentoCard variant="white" span="2">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
              <Plus className="h-5 w-5" />
              إضافة عرض سريع
            </h2>

            <div className="space-y-3">
              <NeumoInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="عنوان العرض"
              />
              <NeumoTextarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="وصف العرض"
                className="h-24"
              />

              <div className="grid grid-cols-2 gap-2">
                <NeumoSelect
                  value={offerType}
                  onChange={(e) => setOfferType(e.target.value as OfferType)}
                >
                  {OFFER_TYPES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </NeumoSelect>

                <NeumoSelect
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value as OfferPlacement)}
                >
                  {PLACEMENTS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </NeumoSelect>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NeumoInput
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="نسبة الخصم"
                />
                <NeumoInput
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="كود الخصم"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NeumoInput
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <NeumoInput
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <SoftCard className="p-4">
                <p className="mb-3 font-black text-[#3A2117]">
                  بيانات صاحب الكود اختيارية
                </p>

                <div className="space-y-2">
                  <NeumoInput
                    value={codeOwnerName}
                    onChange={(e) => setCodeOwnerName(e.target.value)}
                    placeholder="الاسم الكامل"
                  />
                  <NeumoInput
                    value={codeOwnerPhone}
                    onChange={(e) => setCodeOwnerPhone(e.target.value)}
                    placeholder="رقم الجوال"
                  />
                  <NeumoInput
                    value={codeOwnerNationalId}
                    onChange={(e) => setCodeOwnerNationalId(e.target.value)}
                    placeholder="رقم الهوية"
                  />
                  <NeumoInput
                    value={codeOwnerEmail}
                    onChange={(e) => setCodeOwnerEmail(e.target.value)}
                    placeholder="الإيميل"
                  />
                  <NeumoInput
                    value={codeOwnerBankAccount}
                    onChange={(e) => setCodeOwnerBankAccount(e.target.value)}
                    placeholder="الحساب البنكي / IBAN"
                  />
                  <NeumoInput
                    value={codeOwnerCommissionPercent}
                    onChange={(e) => setCodeOwnerCommissionPercent(e.target.value)}
                    placeholder="نسبة صاحب الكود %"
                  />
                </div>
              </SoftCard>

              <SoftCard className="p-4">
                <p className="mb-3 flex items-center gap-2 font-black text-[#3A2117]">
                  <ImagePlus className="h-5 w-5" />
                  العروض الترويجية في بانر الكوفي
                </p>

                <div className="space-y-2">
                  <NeumoSelect
                    value={linkedProductId}
                    onChange={(e) => setLinkedProductId(e.target.value)}
                  >
                    <option value="">ربط بمنتج من المنيو</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </NeumoSelect>

                  <NeumoInput
                    value={bannerImageUrl}
                    onChange={(e) => setBannerImageUrl(e.target.value)}
                    placeholder="رابط صورة البانر (اختياري)"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id="offer-banner-file"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = "";
                      setOptimizingBanner(true);
                      try {
                        const optimized = await optimizeImageForStorage(file, "offer-banner");
                        if (bannerPreviewUrl?.startsWith("blob:")) {
                          revokeObjectUrl(bannerPreviewUrl);
                        }
                        setBannerPreviewUrl(URL.createObjectURL(optimized.blob));
                        setPendingBanner(optimized);
                        setBannerImageUrl("");
                      } catch (err) {
                        alert(
                          err instanceof ImagePipelineError
                            ? err.message
                            : "تعذر قراءة الصورة"
                        );
                      } finally {
                        setOptimizingBanner(false);
                      }
                    }}
                  />
                  <label
                    htmlFor="offer-banner-file"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[#F8F4EF] px-4 py-3 text-sm font-black text-[#3A2117]"
                  >
                    <ImagePlus className="h-5 w-5" />
                    {optimizingBanner ? "جاري تحسين الصورة..." : "رفع صورة بانر"}
                  </label>
                  {bannerPreviewUrl ? (
                    <img
                      src={bannerPreviewUrl}
                      alt=""
                      className="h-20 w-full rounded-2xl object-cover"
                    />
                  ) : null}
                  <NeumoInput
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    placeholder="نص الزر مثل: شاهد المنتج"
                  />
                  <NeumoInput
                    value={promoProductName}
                    onChange={(e) => setPromoProductName(e.target.value)}
                    placeholder="اسم المنتج الترويجي"
                  />
                  <NeumoInput
                    value={promoProductPrice}
                    onChange={(e) => setPromoProductPrice(e.target.value)}
                    placeholder="سعر المنتج الترويجي"
                  />
                  <NeumoInput
                    value={promoProductCategory}
                    onChange={(e) => setPromoProductCategory(e.target.value)}
                    placeholder="تصنيف المنتج"
                  />
                  <NeumoTextarea
                    value={promoProductDescription}
                    onChange={(e) => setPromoProductDescription(e.target.value)}
                    placeholder="وصف المنتج الترويجي"
                    className="h-24"
                  />
                </div>
              </SoftCard>

              <PrimaryButton onClick={addOffer} className="w-full">
                إضافة العرض وربطه بالكوفي
              </PrimaryButton>
            </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#F8F4EF] p-4">
      <p className="text-xs font-black text-[#7A6255]">{label}</p>
      <h3 className="mt-1 font-black text-[#3A2117]">{value}</h3>
    </div>
  );
}
