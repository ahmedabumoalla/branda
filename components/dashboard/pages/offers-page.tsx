"use client";

import { Gift, ImagePlus, Megaphone, Plus, Search, TicketPercent, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatSar } from "@/lib/format";
import {
  type CafeOffer,
  type OfferPlacement,
  type OfferStatus,
  type OfferType,
} from "@/lib/mock/offers";
import { mockMenuProducts, type MenuProduct } from "@/lib/mock/menu";

const OFFERS_KEY = "branda_qatrah_offers";
const MENU_KEY = "branda_qatrah_menu";

type Props = {
  initialOffers: CafeOffer[];
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

export function OffersPageClient({ initialOffers }: Props) {
  const [offers, setOffers] = useState<CafeOffer[]>(initialOffers);
  const [products, setProducts] = useState<MenuProduct[]>(mockMenuProducts);

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
  const [ctaText, setCtaText] = useState("");

  const [promoProductName, setPromoProductName] = useState("");
  const [promoProductPrice, setPromoProductPrice] = useState("");
  const [promoProductCategory, setPromoProductCategory] = useState("");
  const [promoProductDescription, setPromoProductDescription] = useState("");

  useEffect(() => {
    const savedOffers = localStorage.getItem(OFFERS_KEY);
    const savedMenu = localStorage.getItem(MENU_KEY);

    if (savedOffers) setOffers(JSON.parse(savedOffers));
    if (savedMenu) setProducts(JSON.parse(savedMenu));
  }, []);

  useEffect(() => {
    localStorage.setItem(OFFERS_KEY, JSON.stringify(offers));
  }, [offers]);

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
    setCtaText("");
    setPromoProductName("");
    setPromoProductPrice("");
    setPromoProductCategory("");
    setPromoProductDescription("");
  }

  function addOffer() {
    if (!title.trim()) {
      alert("اكتب عنوان العرض");
      return;
    }

    const linkedProduct = products.find((product) => product.id === linkedProductId);

    const offer: CafeOffer = {
      id: crypto.randomUUID(),
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
      bannerImageUrl:
        bannerImageUrl.trim() ||
        linkedProduct?.imageDataUrl ||
        "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=1200&auto=format&fit=crop",
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

    setOffers((prev) => [offer, ...prev]);
    resetForm();
  }

  function toggleStatus(id: string) {
    setOffers((prev) =>
      prev.map((offer) =>
        offer.id === id
          ? { ...offer, status: offer.status === "نشط" ? "متوقف" : "نشط" }
          : offer
      )
    );
  }

  function toggleVisible(id: string) {
    setOffers((prev) =>
      prev.map((offer) =>
        offer.id === id
          ? { ...offer, visibleInCafe: !offer.visibleInCafe }
          : offer
      )
    );
  }

  function deleteOffer(id: string) {
    setOffers((prev) => prev.filter((offer) => offer.id !== id));
  }

  return (
    <div dir="rtl" className="min-h-screen px-6 py-8 text-[#2B1710]">
      <header className="mb-8">
        <p className="font-black text-[#8B5E3C]">لوحة برندة</p>
        <h1 className="mt-2 text-4xl font-black text-[#3A2117]">
          العروض والخصومات
        </h1>
        <p className="mt-2 text-[#7A6255]">
          أضف خصومات، أكواد مسوقين، إعلانات بانر، أو إطلاق منتجات جديدة وتظهر مباشرة في صفحة الكوفي.
        </p>
      </header>

      <section className="mb-8 grid gap-5 xl:grid-cols-[1fr_460px]">
        <div className="rounded-3xl border border-[#E5D8CD] bg-white/80 p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8A7062]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث باسم العرض أو الكود أو صاحب الكود..."
                className="h-14 w-full rounded-2xl border border-[#E5D8CD] bg-white pr-12 pl-4 text-right font-bold outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {["الكل", ...OFFER_TYPES].map((item) => (
                <button
                  key={item}
                  onClick={() => setTypeFilter(item as OfferType | "الكل")}
                  className={`rounded-2xl px-5 py-3 text-sm font-black ${
                    typeFilter === item
                      ? "bg-[#3A2117] text-[#F8E8D2]"
                      : "bg-[#F8F4EF] text-[#3A2117]"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-5">
            {filtered.map((offer) => (
              <article
                key={offer.id}
                className="rounded-3xl border border-white bg-white p-6 shadow-lg"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8E8D2]">
                      {offer.placement === "بانر الكوفي" ? (
                        <Megaphone className="h-7 w-7" />
                      ) : (
                        <TicketPercent className="h-7 w-7" />
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-black text-[#8B5E3C]">
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

                <div className="mt-6 grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-[#F8F4EF] p-4">
                    <p className="text-xs font-black text-[#7A6255]">الكود</p>
                    <h3 className="mt-1 font-black text-[#3A2117]">
                      {offer.code || "بدون كود"}
                    </h3>
                  </div>

                  <div className="rounded-2xl bg-[#F8F4EF] p-4">
                    <p className="text-xs font-black text-[#7A6255]">خصم</p>
                    <h3 className="mt-1 font-black text-[#3A2117]">
                      {offer.discountPercent ? `${offer.discountPercent}%` : "غير محدد"}
                    </h3>
                  </div>

                  <div className="rounded-2xl bg-[#F8F4EF] p-4">
                    <p className="text-xs font-black text-[#7A6255]">
                      صاحب الكود
                    </p>
                    <h3 className="mt-1 font-black text-[#3A2117]">
                      {offer.codeOwnerName || "غير محدد"}
                    </h3>
                  </div>

                  <div className="rounded-2xl bg-[#F8F4EF] p-4">
                    <p className="text-xs font-black text-[#7A6255]">
                      نسبة صاحب الكود
                    </p>
                    <h3 className="mt-1 font-black text-[#3A2117]">
                      {offer.codeOwnerCommissionPercent
                        ? `${offer.codeOwnerCommissionPercent}%`
                        : "غير محدد"}
                    </h3>
                  </div>
                </div>

                {offer.placement !== "قائمة العروض" ? (
                  <div className="mt-4 rounded-2xl bg-[#F8F4EF] p-4">
                    <p className="text-xs font-black text-[#8B5E3C]">
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
                    {offer.visibleInCafe ? "إخفاء من صفحة الكوفي" : "إظهار في صفحة الكوفي"}
                  </button>

                  <button
                    onClick={() => deleteOffer(offer.id)}
                    className="rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700"
                  >
                    <Trash2 className="inline h-4 w-4" /> حذف
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="rounded-3xl border border-[#E5D8CD] bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
            <Plus className="h-5 w-5" />
            إضافة عرض سريع
          </h2>

          <div className="space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان العرض" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-4 text-right font-bold outline-none" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف العرض" className="h-24 w-full resize-none rounded-2xl border border-[#E5D8CD] p-4 text-right font-bold outline-none" />

            <div className="grid grid-cols-2 gap-2">
              <select value={offerType} onChange={(e) => setOfferType(e.target.value as OfferType)} className="h-12 rounded-2xl border border-[#E5D8CD] px-3 font-bold outline-none">
                {OFFER_TYPES.map((item) => <option key={item}>{item}</option>)}
              </select>

              <select value={placement} onChange={(e) => setPlacement(e.target.value as OfferPlacement)} className="h-12 rounded-2xl border border-[#E5D8CD] px-3 font-bold outline-none">
                {PLACEMENTS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder="نسبة الخصم" className="h-12 rounded-2xl border border-[#E5D8CD] px-3 text-right font-bold outline-none" />
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="كود الخصم" className="h-12 rounded-2xl border border-[#E5D8CD] px-3 text-right font-bold outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-12 rounded-2xl border border-[#E5D8CD] px-3 font-bold outline-none" />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-12 rounded-2xl border border-[#E5D8CD] px-3 font-bold outline-none" />
            </div>

            <div className="rounded-3xl bg-[#F8F4EF] p-4">
              <p className="mb-3 font-black text-[#3A2117]">بيانات صاحب الكود اختيارية</p>

              <div className="space-y-2">
                <input value={codeOwnerName} onChange={(e) => setCodeOwnerName(e.target.value)} placeholder="الاسم الكامل" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-3 text-right font-bold outline-none" />
                <input value={codeOwnerPhone} onChange={(e) => setCodeOwnerPhone(e.target.value)} placeholder="رقم الجوال" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-3 text-right font-bold outline-none" />
                <input value={codeOwnerNationalId} onChange={(e) => setCodeOwnerNationalId(e.target.value)} placeholder="رقم الهوية" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-3 text-right font-bold outline-none" />
                <input value={codeOwnerEmail} onChange={(e) => setCodeOwnerEmail(e.target.value)} placeholder="الإيميل" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-3 text-right font-bold outline-none" />
                <input value={codeOwnerBankAccount} onChange={(e) => setCodeOwnerBankAccount(e.target.value)} placeholder="الحساب البنكي / IBAN" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-3 text-right font-bold outline-none" />
                <input value={codeOwnerCommissionPercent} onChange={(e) => setCodeOwnerCommissionPercent(e.target.value)} placeholder="نسبة صاحب الكود %" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-3 text-right font-bold outline-none" />
              </div>
            </div>

            <div className="rounded-3xl bg-[#F8F4EF] p-4">
              <p className="mb-3 flex items-center gap-2 font-black text-[#3A2117]">
                <ImagePlus className="h-5 w-5" />
                العروض الترويجية في بانر الكوفي
              </p>

              <div className="space-y-2">
                <select value={linkedProductId} onChange={(e) => setLinkedProductId(e.target.value)} className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-3 font-bold outline-none">
                  <option value="">ربط بمنتج من المنيو</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>

                <input value={bannerImageUrl} onChange={(e) => setBannerImageUrl(e.target.value)} placeholder="رابط صورة البانر" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-3 text-right font-bold outline-none" />
                <input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="نص الزر مثل: شاهد المنتج" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-3 text-right font-bold outline-none" />
                <input value={promoProductName} onChange={(e) => setPromoProductName(e.target.value)} placeholder="اسم المنتج الترويجي" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-3 text-right font-bold outline-none" />
                <input value={promoProductPrice} onChange={(e) => setPromoProductPrice(e.target.value)} placeholder="سعر المنتج الترويجي" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-3 text-right font-bold outline-none" />
                <input value={promoProductCategory} onChange={(e) => setPromoProductCategory(e.target.value)} placeholder="تصنيف المنتج" className="h-12 w-full rounded-2xl border border-[#E5D8CD] px-3 text-right font-bold outline-none" />
                <textarea value={promoProductDescription} onChange={(e) => setPromoProductDescription(e.target.value)} placeholder="وصف المنتج الترويجي" className="h-24 w-full resize-none rounded-2xl border border-[#E5D8CD] p-4 text-right font-bold outline-none" />
              </div>
            </div>

            <button onClick={addOffer} className="h-14 w-full rounded-2xl bg-[#3A2117] font-black text-[#F8E8D2]">
              إضافة العرض وربطه بالكوفي
            </button>
          </div>
        </aside>
      </section>
    </div>
  );
}