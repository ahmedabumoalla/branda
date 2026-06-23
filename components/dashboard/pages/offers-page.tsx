"use client";

import { CalendarPlus, Gift, ImagePlus, Megaphone, PackageCheck, Plus, Search, Sparkles, TicketPercent, Trash2 } from "lucide-react";
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
import { deleteOfferAction, generateOfferCardAction, saveOfferAction } from "@/app/actions/offers";
import {
  deleteExperienceCampaignAction,
  generateExperienceCampaignCardAction,
  saveExperienceCampaignAction,
} from "@/app/actions/experience";
import { uploadImageAction } from "@/app/actions/upload";
import {
  ImagePipelineError,
  isHttpImageUrl,
  optimizeImageForStorage,
  type OptimizedImageResult,
} from "@/lib/cafe/image-asset-pipeline";
import { revokeObjectUrl } from "@/lib/cafe/local-asset-store";
import { ProductImage } from "@/components/cafe/product-image";
import { formatSar } from "@/lib/format";
import {
  type CafeOffer,
  type OfferPlacement,
  type OfferType,
} from "@/lib/mock/offers";
import { type MenuProduct } from "@/lib/mock/menu";
import type { ReservationService } from "@/lib/data/platform-upgrade";
import {
  platformLabels,
  type ExperienceCampaign,
  type ExperiencePlatform,
  type ExperienceRewardType,
} from "@/lib/mock/experience-campaigns";
import { getBusinessCopy } from "@/lib/platform/business-copy";

type Props = {
  initialOffers: CafeOffer[];
  initialProducts: MenuProduct[];
  initialReservationServices?: ReservationService[];
  initialExperienceCampaigns?: ExperienceCampaign[];
  businessCategory?: string;
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
  "عرض حجز",
];

const PLACEMENTS: OfferPlacement[] = ["قائمة العروض", "بانر الكوفي", "كلاهما"];

const EXPERIENCE_PLATFORMS: ExperiencePlatform[] = ["instagram", "tiktok", "snapchat", "youtube_shorts", "x"];

const REWARD_LABELS: Record<ExperienceRewardType, string> = {
  free_order: "طلب مجاني",
  product: "منتج مجاني",
  reservation: "حجز مجاني",
  discount: "خصم",
};

export function OffersPageClient({
  initialOffers,
  initialProducts,
  initialReservationServices = [],
  initialExperienceCampaigns = [],
  businessCategory,
  configError,
}: Props) {
  const copy = getBusinessCopy(businessCategory);
  const placementLabel = (value: OfferPlacement) =>
    value === "بانر الكوفي" ? `بانر ${copy.casualNoun}` : value;
  const [offers, setOffers] = useState<CafeOffer[]>(initialOffers);
  const [products] = useState<MenuProduct[]>(initialProducts);
  const [reservationServices] = useState<ReservationService[]>(initialReservationServices);
  const [experienceCampaigns, setExperienceCampaigns] =
    useState<ExperienceCampaign[]>(initialExperienceCampaigns);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);

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
  const [buyProductId, setBuyProductId] = useState("");
  const [buyQuantity, setBuyQuantity] = useState("1");
  const [rewardKind, setRewardKind] = useState<"free_product" | "gift">("free_product");
  const [freeProductId, setFreeProductId] = useState("");
  const [giftName, setGiftName] = useState("");
  const [rewardQuantity, setRewardQuantity] = useState("1");
  const [seasonalMode, setSeasonalMode] = useState<"package" | "discount" | "experience">("discount");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [packageDescription, setPackageDescription] = useState("");
  const [appliesToAllProducts, setAppliesToAllProducts] = useState(false);
  const [reservationServiceId, setReservationServiceId] = useState("");
  const [reservationBenefitType, setReservationBenefitType] =
    useState<"free_products" | "product_discount" | "reservation_discount" | "extra_benefits">("reservation_discount");
  const [reservationBenefitText, setReservationBenefitText] = useState("");
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);

  const [campaignTitle, setCampaignTitle] = useState("وثّق تجربتك");
  const [campaignDescription, setCampaignDescription] = useState("شارك تجربتك المصورة واحصل على مكافأة من العلامة.");
  const [campaignStartDate, setCampaignStartDate] = useState("");
  const [campaignEndDate, setCampaignEndDate] = useState("");
  const [campaignViews, setCampaignViews] = useState("");
  const [campaignLikes, setCampaignLikes] = useState("");
  const [campaignComments, setCampaignComments] = useState("");
  const [campaignExtraRule, setCampaignExtraRule] = useState("");
  const [campaignExcludedContent, setCampaignExcludedContent] = useState("محتوى مسيء\nمحتوى بذيء\nمحتوى خارج السياق");
  const [campaignPlatforms, setCampaignPlatforms] = useState<ExperiencePlatform[]>(["instagram", "tiktok"]);
  const [campaignRewardType, setCampaignRewardType] = useState<ExperienceRewardType>("product");
  const [campaignRewardProductId, setCampaignRewardProductId] = useState("");
  const [campaignRewardReservationId, setCampaignRewardReservationId] = useState("");
  const [campaignRewardDiscount, setCampaignRewardDiscount] = useState("");

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
    setEditingOfferId(null);
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
    setBuyProductId("");
    setBuyQuantity("1");
    setRewardKind("free_product");
    setFreeProductId("");
    setGiftName("");
    setRewardQuantity("1");
    setSeasonalMode("discount");
    setSelectedProductIds([]);
    setPackageDescription("");
    setAppliesToAllProducts(false);
    setReservationServiceId("");
    setReservationBenefitType("reservation_discount");
    setReservationBenefitText("");
  }

  function resetCampaignForm() {
    setEditingCampaignId(null);
    setCampaignTitle("وثّق تجربتك");
    setCampaignDescription("شارك تجربتك المصورة واحصل على مكافأة من العلامة.");
    setCampaignStartDate("");
    setCampaignEndDate("");
    setCampaignViews("");
    setCampaignLikes("");
    setCampaignComments("");
    setCampaignExtraRule("");
    setCampaignExcludedContent("محتوى مسيء\nمحتوى بذيء\nمحتوى خارج السياق");
    setCampaignPlatforms(["instagram", "tiktok"]);
    setCampaignRewardType("product");
    setCampaignRewardProductId("");
    setCampaignRewardReservationId("");
    setCampaignRewardDiscount("");
  }

  async function addOffer() {
    if (!title.trim()) {
      alert("اكتب عنوان العرض");
      return;
    }

    const linkedProduct = products.find((product) => product.id === linkedProductId);
    const existing = editingOfferId ? offers.find((item) => item.id === editingOfferId) : null;
    const offerId = editingOfferId ?? crypto.randomUUID();
    const targetType = offerType === "عرض حجز" ? "reservation" : "products";
    const offerRules: CafeOffer["offerRules"] = {
      buyProductId: buyProductId || undefined,
      buyQuantity: Number(buyQuantity || 1),
      rewardKind,
      freeProductId: rewardKind === "free_product" ? freeProductId || undefined : undefined,
      giftName: rewardKind === "gift" ? giftName.trim() || undefined : undefined,
      rewardQuantity: Number(rewardQuantity || 1),
      selectedProductIds,
      seasonalMode,
      packageDescription: packageDescription.trim() || undefined,
      appliesToAllProducts,
      reservationBenefitType,
      reservationBenefitText: reservationBenefitText.trim() || undefined,
    };

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
      ...(existing ?? {}),
      id: offerId,
      title: title.trim(),
      description:
        description.trim() ||
        promoProductDescription.trim() ||
        `عرض ترويجي يظهر مباشرة في صفحة ${copy.casualNoun}.`,
      type: offerType,
      status: existing?.status ?? (startDate ? "مجدول" : "نشط"),
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
      targetType,
      reservationServiceId: offerType === "عرض حجز" ? reservationServiceId || undefined : undefined,
      offerRules,
      bannerAssetId: bannerAssetId ?? existing?.bannerAssetId,
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
      setOffers((prev) =>
        editingOfferId
          ? prev.map((item) => (item.id === editingOfferId ? saved : item))
          : [saved, ...prev]
      );
      resetForm();
      setShowOfferForm(false);
    } catch {
      alert("تعذر حفظ العرض");
    }
  }

  function editOffer(offer: CafeOffer) {
    setEditingOfferId(offer.id);
    setTitle(offer.title);
    setDescription(offer.description);
    setOfferType(offer.type);
    setPlacement(offer.placement);
    setDiscountPercent(String(offer.discountPercent ?? ""));
    setCode(offer.code ?? "");
    setStartDate(offer.startDate ?? "");
    setEndDate(offer.endDate ?? "");
    setCodeOwnerName(offer.codeOwnerName ?? "");
    setCodeOwnerPhone(offer.codeOwnerPhone ?? "");
    setCodeOwnerNationalId(offer.codeOwnerNationalId ?? "");
    setCodeOwnerEmail(offer.codeOwnerEmail ?? "");
    setCodeOwnerBankAccount(offer.codeOwnerBankAccount ?? "");
    setCodeOwnerCommissionPercent(String(offer.codeOwnerCommissionPercent ?? ""));
    setLinkedProductId(offer.linkedProductId ?? "");
    setBannerImageUrl(offer.bannerImageUrl ?? "");
    if (bannerPreviewUrl?.startsWith("blob:")) revokeObjectUrl(bannerPreviewUrl);
    setBannerPreviewUrl(undefined);
    setPendingBanner(null);
    setCtaText(offer.ctaText ?? "");
    setPromoProductName(offer.promoProductName ?? "");
    setPromoProductPrice(String(offer.promoProductPrice ?? ""));
    setPromoProductCategory(offer.promoProductCategory ?? "");
    setPromoProductDescription(offer.promoProductDescription ?? "");
    setBuyProductId(offer.offerRules?.buyProductId ?? "");
    setBuyQuantity(String(offer.offerRules?.buyQuantity ?? 1));
    setRewardKind(offer.offerRules?.rewardKind ?? "free_product");
    setFreeProductId(offer.offerRules?.freeProductId ?? "");
    setGiftName(offer.offerRules?.giftName ?? "");
    setRewardQuantity(String(offer.offerRules?.rewardQuantity ?? 1));
    setSeasonalMode(offer.offerRules?.seasonalMode ?? "discount");
    setSelectedProductIds(offer.offerRules?.selectedProductIds ?? []);
    setPackageDescription(offer.offerRules?.packageDescription ?? "");
    setAppliesToAllProducts(Boolean(offer.offerRules?.appliesToAllProducts));
    setReservationServiceId(offer.reservationServiceId ?? "");
    setReservationBenefitType(offer.offerRules?.reservationBenefitType ?? "reservation_discount");
    setReservationBenefitText(offer.offerRules?.reservationBenefitText ?? "");
    setShowOfferForm(true);
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

  function toggleSelectedProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((item) => item !== productId)
        : [...current, productId]
    );
  }

  function toggleCampaignPlatform(platform: ExperiencePlatform) {
    setCampaignPlatforms((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform]
    );
  }

  async function generateOfferCard(id: string) {
    setAiBusyId(id);
    try {
      const saved = await generateOfferCardAction(id);
      setOffers((prev) => prev.map((item) => (item.id === id ? saved : item)));
      if (saved.cardGenerationStatus === "failed") {
        alert("تعذر توليد بطاقة AI، وسيظهر قالب احتياطي داخل الواجهة.");
      }
    } catch {
      alert("تعذر توليد بطاقة العرض");
    } finally {
      setAiBusyId(null);
    }
  }

  async function generateCampaignCard(id: string) {
    setAiBusyId(id);
    try {
      const saved = await generateExperienceCampaignCardAction(id);
      setExperienceCampaigns((prev) => prev.map((item) => (item.id === id ? saved : item)));
      if (saved.cardGenerationStatus === "failed") {
        alert("تعذر توليد بطاقة AI، وسيظهر قالب احتياطي داخل الواجهة.");
      }
    } catch {
      alert("تعذر توليد بطاقة الحملة");
    } finally {
      setAiBusyId(null);
    }
  }

  async function createExperienceCampaign() {
    if (!campaignTitle.trim() || campaignPlatforms.length === 0) {
      alert("أكمل اسم الحملة واختر منصة واحدة على الأقل");
      return;
    }

    const existing = editingCampaignId
      ? experienceCampaigns.find((item) => item.id === editingCampaignId)
      : null;
    const campaign: ExperienceCampaign = {
      ...(existing ?? {}),
      id: editingCampaignId ?? crypto.randomUUID(),
      cafeSlug: "",
      title: campaignTitle.trim(),
      description: campaignDescription.trim() || "حملة توثيق تجربة من العلامة.",
      startDate: campaignStartDate || new Date().toISOString().slice(0, 10),
      endDate: campaignEndDate || "2099-12-31",
      terms: [
        campaignExtraRule.trim(),
        campaignExcludedContent.trim()
          ? `المحتوى المستبعد: ${campaignExcludedContent.split(/\n|،|,/).map((item) => item.trim()).filter(Boolean).join("، ")}`
          : "",
      ].filter(Boolean).join("\n"),
      platforms: campaignPlatforms,
      minFollowers: undefined,
      basePoints: 0,
      pointsPerView: 0,
      pointsPerLike: 0,
      pointsPerComment: 0,
      maxPointsPerSubmission: 0,
      requiresManualApproval: true,
      requirements: {
        views: campaignViews ? Number(campaignViews) : undefined,
        likes: campaignLikes ? Number(campaignLikes) : undefined,
        comments: campaignComments ? Number(campaignComments) : undefined,
        extra: campaignExtraRule.trim() || undefined,
      },
      excludedContentRules: campaignExcludedContent.split(/\n|،|,/).map((item) => item.trim()).filter(Boolean),
      rewardType: campaignRewardType,
      rewardProductId: campaignRewardType === "product" ? campaignRewardProductId || undefined : undefined,
      rewardReservationServiceId:
        campaignRewardType === "reservation" ? campaignRewardReservationId || undefined : undefined,
      rewardDiscountPercent:
        campaignRewardType === "discount" && campaignRewardDiscount ? Number(campaignRewardDiscount) : undefined,
      cardStoragePath: existing?.cardStoragePath,
      cardGenerationStatus: existing?.cardGenerationStatus ?? "idle",
      cardGenerationError: existing?.cardGenerationError,
      cardGeneratedAt: existing?.cardGeneratedAt,
      status: existing?.status ?? "active",
      createdAt: existing?.createdAt ?? new Date().toISOString().slice(0, 10),
    };

    try {
      const saved = await saveExperienceCampaignAction(campaign);
      setExperienceCampaigns((prev) =>
        editingCampaignId
          ? prev.map((item) => (item.id === editingCampaignId ? saved : item))
          : [saved, ...prev]
      );
      resetCampaignForm();
      setShowCampaignForm(false);
      alert(editingCampaignId ? "تم تحديث حملة توثيق التجربة" : "تم إطلاق حملة توثيق التجربة");
    } catch {
      alert("تعذر حفظ حملة توثيق التجربة");
    }
  }

  function editCampaign(campaign: ExperienceCampaign) {
    setEditingCampaignId(campaign.id);
    setCampaignTitle(campaign.title);
    setCampaignDescription(campaign.description);
    setCampaignStartDate(campaign.startDate);
    setCampaignEndDate(campaign.endDate);
    setCampaignViews(String(campaign.requirements?.views ?? ""));
    setCampaignLikes(String(campaign.requirements?.likes ?? ""));
    setCampaignComments(String(campaign.requirements?.comments ?? ""));
    setCampaignExtraRule(campaign.requirements?.extra ?? "");
    setCampaignExcludedContent((campaign.excludedContentRules ?? []).join("\n"));
    setCampaignPlatforms(campaign.platforms);
    setCampaignRewardType(campaign.rewardType ?? "product");
    setCampaignRewardProductId(campaign.rewardProductId ?? "");
    setCampaignRewardReservationId(campaign.rewardReservationServiceId ?? "");
    setCampaignRewardDiscount(String(campaign.rewardDiscountPercent ?? ""));
    setShowCampaignForm(true);
  }

  async function toggleCampaignStatus(campaign: ExperienceCampaign) {
    const next: ExperienceCampaign = {
      ...campaign,
      status: campaign.status === "active" ? "ended" : "active",
    };
    try {
      const saved = await saveExperienceCampaignAction(next);
      setExperienceCampaigns((prev) => prev.map((item) => (item.id === campaign.id ? saved : item)));
    } catch {
      alert("تعذر تحديث حالة الحملة");
    }
  }

  async function deleteCampaign(id: string) {
    try {
      await deleteExperienceCampaignAction(id);
      setExperienceCampaigns((prev) => prev.filter((campaign) => campaign.id !== id));
      if (editingCampaignId === id) {
        resetCampaignForm();
        setShowCampaignForm(false);
      }
    } catch {
      alert("تعذر حذف حملة توثيق التجربة");
    }
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="العروض والخصومات"
        subtitle={`أضف خصومات، أكواد مسوقين، إعلانات بانر، أو إطلاق منتجات جديدة وتظهر مباشرة في صفحة ${copy.casualNoun}.`}
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

        <div className="mb-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowOfferForm((value) => !value)}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#3A2117] px-5 py-3 text-sm font-black text-[#F8F4EF]"
          >
            <Plus className="h-4 w-4" />
            إضافة عرض سريع
          </button>
          <button
            type="button"
            onClick={() => {
              if (!showCampaignForm) resetCampaignForm();
              setShowCampaignForm((value) => !value);
            }}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#D9A33F] px-5 py-3 text-sm font-black text-[#311912]"
          >
            <Megaphone className="h-4 w-4" />
            إطلاق حملة توثيق التجربة
          </button>
        </div>

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
                          {offer.type} • {placementLabel(offer.placement)}
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

                  {offer.type === "عرض حجز" || offer.offerRules?.selectedProductIds?.length ? (
                    <div className="mt-4 rounded-2xl bg-[#F8F4EF] p-4">
                      <p className="text-xs font-black text-[#6B3A25]">تفاصيل العرض المتقدمة</p>
                      <p className="mt-2 text-sm font-bold leading-7 text-[#7A6255]">
                        {offer.type === "عرض حجز"
                          ? `مرتبط بالحجز: ${
                              reservationServices.find((service) => service.id === offer.reservationServiceId)?.name ||
                              "غير محدد"
                            }`
                          : `منتجات مختارة: ${offer.offerRules?.selectedProductIds?.length ?? 0}`}
                      </p>
                    </div>
                  ) : null}

                  {offer.placement !== "قائمة العروض" ? (
                    <div className="mt-4 rounded-2xl bg-[#F8F4EF] p-4">
                      <p className="text-xs font-black text-[#6B3A25]">
                        إعلان بانر {copy.casualNoun}
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
                      type="button"
                      onClick={() => editOffer(offer)}
                      className="rounded-2xl bg-[#F8F4EF] px-5 py-3 text-sm font-black text-[#3A2117]"
                    >
                      تعديل
                    </button>

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
                        ? `إخفاء من صفحة ${copy.casualNoun}`
                        : `إظهار في صفحة ${copy.casualNoun}`}
                    </button>

                    <button
                      onClick={() => deleteOffer(offer.id)}
                      className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700"
                    >
                      <Trash2 className="inline h-4 w-4" /> حذف
                    </button>

                    <button
                      onClick={() => void generateOfferCard(offer.id)}
                      disabled={aiBusyId === offer.id}
                      className="inline-flex items-center gap-2 rounded-2xl bg-[#D9A33F] px-5 py-3 text-sm font-black text-[#311912] disabled:opacity-60"
                    >
                      <Sparkles className="h-4 w-4" />
                      {aiBusyId === offer.id ? "جاري التوليد..." : offer.cardStoragePath ? "إعادة توليد AI" : "توليد بطاقة AI"}
                    </button>
                  </div>
                </SoftCard>
              ))}
            </div>
          </BentoCard>

          {showOfferForm ? (
          <BentoCard variant="white" span="2">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
              <Plus className="h-5 w-5" />
              {editingOfferId ? "تعديل العرض" : "إضافة عرض سريع"}
            </h2>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-2 block text-xs font-black text-[#7A6255]">عنوان العرض الذي يظهر للعميل</span>
                <NeumoInput
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال خصم 20% على القهوة المختصة"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black text-[#7A6255]">وصف العرض وتفاصيله</span>
                <NeumoTextarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="اكتب تفاصيل العرض وشروطه المختصرة"
                  className="h-24"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-black text-[#7A6255]">نوع العرض</span>
                  <NeumoSelect
                    value={offerType}
                    onChange={(e) => setOfferType(e.target.value as OfferType)}
                  >
                  {OFFER_TYPES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                  </NeumoSelect>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-black text-[#7A6255]">مكان ظهور العرض</span>
                  <NeumoSelect
                    value={placement}
                    onChange={(e) => setPlacement(e.target.value as OfferPlacement)}
                  >
                  {PLACEMENTS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                  </NeumoSelect>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-black text-[#7A6255]">نسبة الخصم</span>
                  <NeumoInput
                    value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                    placeholder="مثال 15"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-black text-[#7A6255]">كود الخصم اختياري</span>
                  <NeumoInput
                    value={code}
                  onChange={(e) => setCode(e.target.value)}
                    placeholder="مثال WELCOME15"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-black text-[#7A6255]">تاريخ بداية العرض</span>
                  <NeumoInput
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-black text-[#7A6255]">تاريخ نهاية العرض</span>
                  <NeumoInput
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </label>
              </div>

              {offerType === "اشتر واحصل" ? (
                <SoftCard className="p-4">
                  <p className="mb-3 flex items-center gap-2 font-black text-[#3A2117]">
                    <Gift className="h-5 w-5" />
                    تفاصيل اشتر واحصل
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <ProductPicker
                      products={products}
                      value={buyProductId}
                      onChange={setBuyProductId}
                      placeholder="المنتج المطلوب شراؤه"
                    />
                    <NeumoInput value={buyQuantity} onChange={(e) => setBuyQuantity(e.target.value)} placeholder="الكمية المطلوبة" />
                    <NeumoSelect value={rewardKind} onChange={(e) => setRewardKind(e.target.value as "free_product" | "gift")}>
                      <option value="free_product">منتج مجاني</option>
                      <option value="gift">هدية</option>
                    </NeumoSelect>
                    {rewardKind === "free_product" ? (
                      <ProductPicker
                        products={products}
                        value={freeProductId}
                        onChange={setFreeProductId}
                        placeholder="المنتج المجاني"
                      />
                    ) : (
                      <NeumoInput value={giftName} onChange={(e) => setGiftName(e.target.value)} placeholder="اسم الهدية" />
                    )}
                    <NeumoInput value={rewardQuantity} onChange={(e) => setRewardQuantity(e.target.value)} placeholder="كمية الهدية / المنتج المجاني" />
                  </div>
                </SoftCard>
              ) : null}

              {offerType === "عرض موسمي" || offerType === "عرض مخصص" ? (
                <SoftCard className="p-4">
                  <p className="mb-3 flex items-center gap-2 font-black text-[#3A2117]">
                    <PackageCheck className="h-5 w-5" />
                    المنتجات والقواعد
                  </p>
                  {offerType === "عرض موسمي" ? (
                    <NeumoSelect value={seasonalMode} onChange={(e) => setSeasonalMode(e.target.value as "package" | "discount" | "experience")}>
                      <option value="discount">خصم على منتجات موسمية</option>
                      <option value="package">باكج موسمي</option>
                      <option value="experience">تجربة مركبة</option>
                    </NeumoSelect>
                  ) : (
                    <label className="mb-3 flex items-center gap-2 rounded-2xl bg-[#F8F4EF] px-4 py-3 font-black text-[#3A2117]">
                      <input
                        type="checkbox"
                        checked={appliesToAllProducts}
                        onChange={(e) => setAppliesToAllProducts(e.target.checked)}
                      />
                      تطبيق العرض على كل المنتجات
                    </label>
                  )}
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-2xl bg-[#F8F4EF] p-3">
                    {products.map((product) => (
                      <ProductToggleRow
                        key={product.id}
                        product={product}
                        checked={selectedProductIds.includes(product.id)}
                        onToggle={() => toggleSelectedProduct(product.id)}
                      />
                    ))}
                  </div>
                  <NeumoTextarea
                    value={packageDescription}
                    onChange={(e) => setPackageDescription(e.target.value)}
                    placeholder={`تفاصيل اختيارية مثل: جلسة + شاشة + ${copy.itemSingular} مجاني`}
                    className="mt-3 h-20"
                  />
                </SoftCard>
              ) : null}

              {offerType === "عرض حجز" ? (
                <SoftCard className="p-4">
                  <p className="mb-3 flex items-center gap-2 font-black text-[#3A2117]">
                    <CalendarPlus className="h-5 w-5" />
                    تفاصيل عرض الحجز
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <NeumoSelect value={reservationServiceId} onChange={(e) => setReservationServiceId(e.target.value)}>
                      <option value="">اختر نوع الحجز المرتبط</option>
                      {reservationServices.map((service) => (
                        <option key={service.id} value={service.id}>{service.name}</option>
                      ))}
                    </NeumoSelect>
                    <NeumoSelect value={reservationBenefitType} onChange={(e) => setReservationBenefitType(e.target.value as typeof reservationBenefitType)}>
                      <option value="free_products">منتجات مجانية</option>
                      <option value="product_discount">خصم على المنتجات</option>
                      <option value="reservation_discount">خصم على قيمة الحجز</option>
                      <option value="extra_benefits">مزايا إضافية</option>
                    </NeumoSelect>
                  </div>
                  <NeumoTextarea
                    value={reservationBenefitText}
                    onChange={(e) => setReservationBenefitText(e.target.value)}
                    placeholder="اكتب تفاصيل ما يتضمنه عرض الحجز"
                    className="mt-3 h-20"
                  />
                </SoftCard>
              ) : null}

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
                  العروض الترويجية في بانر {copy.casualNoun}
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
                {editingOfferId ? "حفظ تعديل العرض" : `إضافة العرض وربطه بـ${copy.casualNoun}`}
              </PrimaryButton>
            </div>
          </BentoCard>
          ) : null}
        </BentoGrid>

        <BentoGrid className="mt-8">
          {showCampaignForm ? (
          <BentoCard variant="white" span="2">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
              <Megaphone className="h-5 w-5" />
              {editingCampaignId ? "تعديل حملة توثيق التجربة" : "إطلاق حملة توثيق التجربة"}
            </h2>
            <div className="space-y-3">
              <NeumoInput value={campaignTitle} onChange={(e) => setCampaignTitle(e.target.value)} placeholder="اسم الحملة" />
              <NeumoTextarea
                value={campaignDescription}
                onChange={(e) => setCampaignDescription(e.target.value)}
                placeholder="وصف الحملة"
                className="h-20"
              />
              <div className="grid grid-cols-2 gap-2">
                <NeumoInput type="date" value={campaignStartDate} onChange={(e) => setCampaignStartDate(e.target.value)} />
                <NeumoInput type="date" value={campaignEndDate} onChange={(e) => setCampaignEndDate(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NeumoInput value={campaignViews} onChange={(e) => setCampaignViews(e.target.value)} placeholder="المشاهدات" />
                <NeumoInput value={campaignLikes} onChange={(e) => setCampaignLikes(e.target.value)} placeholder="الإعجابات" />
                <NeumoInput value={campaignComments} onChange={(e) => setCampaignComments(e.target.value)} placeholder="التعليقات" />
              </div>
              <NeumoTextarea
                value={campaignExcludedContent}
                onChange={(e) => setCampaignExcludedContent(e.target.value)}
                placeholder="المحتوى المستبعد — كل شرط بسطر"
                className="h-20"
              />
              <NeumoTextarea
                value={campaignExtraRule}
                onChange={(e) => setCampaignExtraRule(e.target.value)}
                placeholder="أي شرط إضافي"
                className="h-16"
              />
              <div className="flex flex-wrap gap-2">
                {EXPERIENCE_PLATFORMS.map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => toggleCampaignPlatform(platform)}
                    className={`rounded-2xl px-4 py-2 text-sm font-black ${
                      campaignPlatforms.includes(platform)
                        ? "bg-[#3A2117] text-[#F8F4EF]"
                        : "bg-[#F8F4EF] text-[#3A2117]"
                    }`}
                  >
                    {platformLabels[platform]}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <NeumoSelect value={campaignRewardType} onChange={(e) => setCampaignRewardType(e.target.value as ExperienceRewardType)}>
                  {(Object.keys(REWARD_LABELS) as ExperienceRewardType[]).map((type) => (
                    <option key={type} value={type}>{REWARD_LABELS[type]}</option>
                  ))}
                </NeumoSelect>
                {campaignRewardType === "product" ? (
                  <ProductPicker
                    products={products}
                    value={campaignRewardProductId}
                    onChange={setCampaignRewardProductId}
                    placeholder="المنتج المجاني"
                  />
                ) : campaignRewardType === "reservation" ? (
                  <NeumoSelect value={campaignRewardReservationId} onChange={(e) => setCampaignRewardReservationId(e.target.value)}>
                    <option value="">اختر الحجز المجاني</option>
                    {reservationServices.map((service) => (
                      <option key={service.id} value={service.id}>{service.name}</option>
                    ))}
                  </NeumoSelect>
                ) : campaignRewardType === "discount" ? (
                  <NeumoInput value={campaignRewardDiscount} onChange={(e) => setCampaignRewardDiscount(e.target.value)} placeholder="نسبة الخصم" />
                ) : (
                  <NeumoInput disabled value="طلب مجاني" />
                )}
              </div>
              <PrimaryButton onClick={createExperienceCampaign} className="w-full">
                {editingCampaignId ? "حفظ تعديل الحملة" : "حفظ وإطلاق الحملة"}
              </PrimaryButton>
            </div>
          </BentoCard>
          ) : null}

          <BentoCard variant="white" span="2">
            <h2 className="mb-4 text-xl font-black">حملات توثيق التجربة</h2>
            <div className="grid gap-4">
              {experienceCampaigns.length ? (
                experienceCampaigns.map((campaign) => (
                  <SoftCard key={campaign.id}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-black text-[#6B3A25]">
                          {campaign.platforms.map((platform) => platformLabels[platform]).join("، ")}
                        </p>
                        <h3 className="mt-1 text-xl font-black text-[#3A2117]">{campaign.title}</h3>
                        <p className="mt-2 text-sm font-bold leading-7 text-[#7A6255]">{campaign.description}</p>
                      </div>
                      <span className="rounded-full bg-green-50 px-4 py-2 text-xs font-black text-green-700">
                        {campaign.status === "active" ? "نشطة" : campaign.status}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <Info label="المشاهدات" value={String(campaign.requirements?.views ?? "—")} />
                      <Info label="الإعجابات" value={String(campaign.requirements?.likes ?? "—")} />
                      <Info label="المكافأة" value={REWARD_LABELS[campaign.rewardType ?? "product"]} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => editCampaign(campaign)}
                        className="rounded-2xl bg-[#F8F4EF] px-5 py-3 text-sm font-black text-[#3A2117]"
                      >
                        تعديل
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleCampaignStatus(campaign)}
                        className="rounded-2xl bg-[#3A2117]/10 px-5 py-3 text-sm font-black text-[#3A2117]"
                      >
                        {campaign.status === "active" ? "إيقاف" : "تفعيل"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteCampaign(campaign.id)}
                        className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700"
                      >
                        <Trash2 className="inline h-4 w-4" /> حذف
                      </button>
                      <button
                        onClick={() => void generateCampaignCard(campaign.id)}
                        disabled={aiBusyId === campaign.id}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[#D9A33F] px-5 py-3 text-sm font-black text-[#311912] disabled:opacity-60"
                      >
                        <Sparkles className="h-4 w-4" />
                        {aiBusyId === campaign.id ? "جاري التوليد..." : campaign.cardStoragePath ? "إعادة توليد AI" : "توليد بطاقة AI"}
                      </button>
                    </div>
                  </SoftCard>
                ))
              ) : (
                <p className="rounded-2xl bg-[#F8F4EF] p-4 text-sm font-bold text-[#7A6255]">
                  لا توجد حملات توثيق تجربة محفوظة حتى الآن.
                </p>
              )}
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

function ProductThumb({ product }: { product: MenuProduct }) {
  return (
    <div className="h-12 w-12 overflow-hidden rounded-2xl bg-[#FCF8F3]">
      <ProductImage
        product={product}
        alt={product.name}
        className="h-full w-full object-cover"
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-[#F8F4EF]">
            <PackageCheck className="h-5 w-5 text-[#6B3A25]" />
          </div>
        }
      />
    </div>
  );
}

function ProductPicker({
  products,
  value,
  onChange,
  placeholder,
}: {
  products: MenuProduct[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const selectedProduct = products.find((product) => product.id === value);

  return (
    <div className="rounded-3xl bg-[#F8F4EF] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-[#7A6255]">{placeholder}</p>
          <p className="mt-1 text-sm font-black text-[#3A2117]">
            {selectedProduct ? selectedProduct.name : "لم يتم الاختيار"}
          </p>
        </div>
        {selectedProduct ? <ProductThumb product={selectedProduct} /> : null}
      </div>
      <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
        {products.map((product) => {
          const selected = value === product.id;
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => onChange(selected ? "" : product.id)}
              className={`flex min-w-0 items-center gap-3 rounded-2xl border p-2 text-right transition ${
                selected
                  ? "border-[#3A2117] bg-white shadow-sm"
                  : "border-transparent bg-white/55 hover:bg-white"
              }`}
            >
              <ProductThumb product={product} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-[#3A2117]">{product.name}</span>
                <span className="block text-xs font-bold text-[#7A6255]">{formatSar(product.price)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProductToggleRow({
  product,
  checked,
  onToggle,
}: {
  product: MenuProduct;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-2xl border p-2 text-right transition ${
        checked ? "border-[#3A2117] bg-white" : "border-transparent bg-white/55"
      }`}
    >
      <input type="checkbox" checked={checked} readOnly className="pointer-events-none" />
      <ProductThumb product={product} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-[#3A2117]">{product.name}</span>
        <span className="block text-xs font-bold text-[#7A6255]">{formatSar(product.price)}</span>
      </span>
    </button>
  );
}
