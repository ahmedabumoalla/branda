"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CalendarDays,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  deleteOfferAction,
  saveOfferAction,
  uploadOfferBannerAction,
} from "@/app/actions/offers";
import { DashboardPageShell } from "@/components/ui/design-system";
import { OfferCard } from "@/components/offers/offer-card";
import { ProductImage } from "@/components/cafe/product-image";
import { formatSar } from "@/lib/format";
import type {
  CafeOffer,
  OfferPlacement,
  OfferStatus,
  OfferType,
} from "@/lib/mock/offers";
import type { MenuProduct } from "@/lib/mock/menu";

type Props = {
  initialOffers: CafeOffer[];
  initialProducts: MenuProduct[];
  businessCategory?: string | null;
  configError?: string;
};

const offerTypes: OfferType[] = [
  "خصم",
  "اشتر واحصل",
  "منتج مجاني مع الطلب",
  "كود مسوق",
  "إطلاق منتج",
  "عرض موسمي",
  "عرض مخصص",
];
const statuses: OfferStatus[] = ["نشط", "مجدول", "متوقف", "مسودة"];
const placements: OfferPlacement[] = ["قائمة العروض", "بانر الكوفي", "كلاهما"];

function emptyOffer(): CafeOffer {
  return {
    id: `draft-${crypto.randomUUID()}`,
    title: "",
    description: "",
    type: "خصم",
    status: "مسودة",
    placement: "قائمة العروض",
    visibleInCafe: false,
    ctaText: "شاهد العرض",
    cardGenerationStatus: "idle",
  };
}

function statusTone(status: CafeOffer["status"]) {
  if (status === "نشط") return "bg-emerald-50 text-emerald-700";
  if (status === "مجدول") return "bg-amber-50 text-amber-700";
  if (status === "منتهي") return "bg-slate-100 text-slate-600";
  if (status === "مسودة") return "bg-blue-50 text-blue-700";
  return "bg-rose-50 text-rose-700";
}

function generationLabel(status?: CafeOffer["cardGenerationStatus"]) {
  if (status === "generating") return "جارٍ التوليد";
  if (status === "ready") return "الصورة جاهزة";
  if (status === "failed") return "فشل التوليد";
  return "لم تُولد صورة";
}

export function OffersPageClient({
  initialOffers,
  initialProducts,
  businessCategory,
  configError,
}: Props) {
  const [offers, setOffers] = useState(initialOffers);
  const [draft, setDraft] = useState<CafeOffer>(() => initialOffers[0] ?? emptyOffer());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [typeFilter, setTypeFilter] = useState("الكل");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(configError ?? null);
  const [deleteTarget, setDeleteTarget] = useState<CafeOffer | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const selectedProduct = initialProducts.find((product) => product.id === draft.linkedProductId);
  const filteredOffers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return offers.filter((offer) => {
      const matchesQuery =
        !normalized ||
        offer.title.toLowerCase().includes(normalized) ||
        offer.description.toLowerCase().includes(normalized);
      return (
        matchesQuery &&
        (statusFilter === "الكل" || offer.status === statusFilter) &&
        (typeFilter === "الكل" || offer.type === typeFilter)
      );
    });
  }, [offers, query, statusFilter, typeFilter]);

  const stats = {
    total: offers.length,
    active: offers.filter((offer) => offer.status === "نشط").length,
    scheduled: offers.filter((offer) => offer.status === "مجدول").length,
    inactive: offers.filter((offer) => offer.status === "متوقف" || offer.status === "مسودة").length,
  };

  function update<K extends keyof CafeOffer>(key: K, value: CafeOffer[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setError(null);
  }

  function beginCreate() {
    setDraft(emptyOffer());
    setMessage(null);
    setError(null);
  }

  function validate() {
    if (!draft.title.trim() || !draft.description.trim()) {
      return "عنوان العرض ووصفه مطلوبان";
    }
    if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
      return "تاريخ النهاية يجب ألا يسبق تاريخ البداية";
    }
    if (draft.type === "خصم" && (!draft.discountPercent || draft.discountPercent <= 0)) {
      return "أدخل نسبة خصم صحيحة";
    }
    return null;
  }

  function save() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    startSaving(async () => {
      try {
        const saved = await saveOfferAction(draft);
        setOffers((current) => {
          const exists = current.some((offer) => offer.id === saved.id);
          return exists
            ? current.map((offer) => (offer.id === saved.id ? saved : offer))
            : [saved, ...current];
        });
        setDraft(saved);
        setMessage("تم حفظ العرض وتحديث القائمة");
        setError(null);
      } catch {
        setError("تعذر حفظ العرض. بقيت إدخالاتك كما هي");
      }
    });
  }

  async function generateCard() {
    if (!/^[0-9a-f-]{36}$/i.test(draft.id)) {
      setError("احفظ العرض أولًا قبل توليد الصورة");
      return;
    }
    setIsGenerating(true);
    setError(null);
    setMessage(null);
    setDraft((current) => ({ ...current, cardGenerationStatus: "generating", cardGenerationError: undefined }));
    try {
      const response = await fetch(`/api/dashboard/offers/${encodeURIComponent(draft.id)}/generate-card`, {
        method: "POST",
      });
      const payload = await response.json() as {
        error?: string;
        cardStoragePath?: string;
        generatedAt?: string;
      };
      if (!response.ok || !payload.cardStoragePath) {
        throw new Error(payload.error || "تعذر توليد الصورة");
      }
      const next = {
        ...draft,
        cardStoragePath: payload.cardStoragePath,
        cardGeneratedAt: payload.generatedAt,
        cardGenerationStatus: "ready" as const,
        cardGenerationError: undefined,
      };
      setDraft(next);
      setOffers((current) => current.map((offer) => (offer.id === next.id ? next : offer)));
      setMessage("تم توليد صورة العرض وحفظها بأمان");
    } catch (reason) {
      const failure = reason instanceof Error ? reason.message : "تعذر توليد الصورة";
      setDraft((current) => ({ ...current, cardGenerationStatus: "failed", cardGenerationError: failure }));
      setError(failure);
    } finally {
      setIsGenerating(false);
    }
  }

  async function uploadBanner(file?: File) {
    if (!file) return;
    if (!/^[0-9a-f-]{36}$/i.test(draft.id)) {
      setError("احفظ العرض أولًا قبل رفع الصورة");
      return;
    }
    setIsUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const uploaded = await uploadOfferBannerAction(draft.id, form);
      const next = { ...draft, bannerAssetId: uploaded.storagePath };
      const saved = await saveOfferAction(next);
      setDraft(saved);
      setOffers((current) => current.map((offer) => (offer.id === saved.id ? saved : offer)));
      setMessage("تم رفع صورة العرض وحفظها");
      setError(null);
    } catch {
      setError("تعذر رفع الصورة. لم تتغير الصورة السابقة");
    } finally {
      setIsUploading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteOfferAction(deleteTarget.id);
      setOffers((current) => current.filter((offer) => offer.id !== deleteTarget.id));
      if (draft.id === deleteTarget.id) beginCreate();
      setDeleteTarget(null);
      setMessage("تم حذف العرض");
    } catch {
      setError("تعذر حذف العرض");
    }
  }

  const inputClass =
    "mt-2 min-h-11 w-full rounded-xl border border-[#E7D7C6] bg-white px-3 text-sm font-bold outline-none transition focus:border-[#8B5E3C] focus:ring-2 focus:ring-[#8B5E3C]/10";

  return (
    <DashboardPageShell
      title="العروض"
      subtitle="إنشاء وإدارة العروض الظاهرة في الفرع الإلكتروني"
      action={
        <button type="button" onClick={beginCreate} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#3A2117] px-4 text-sm font-black text-white">
          <Plus className="h-4 w-4" />
          إنشاء عرض جديد
        </button>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["إجمالي العروض", stats.total],
          ["النشطة", stats.active],
          ["المجدولة", stats.scheduled],
          ["المتوقفة", stats.inactive],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#E7D7C6] bg-white px-3 py-3">
            <p className="text-xs font-black text-[#806A5E]">{label}</p>
            <p className="mt-1 text-xl font-black text-[#3A2117]">{value}</p>
          </div>
        ))}
      </div>

      {message ? <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{message}</p> : null}
      {error ? <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">{error}</p> : null}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(280px,0.4fr)_minmax(0,0.6fr)]">
        <aside className="min-w-0 rounded-2xl border border-[#E7D7C6] bg-white p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#806A5E]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في العروض" className={`${inputClass} mt-0 pr-9`} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${inputClass} mt-0`}>
              <option>الكل</option>
              {statuses.map((status) => <option key={status}>{status}</option>)}
              <option>منتهي</option>
            </select>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={`${inputClass} mt-0`}>
              <option>الكل</option>
              {offerTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </div>

          <div className="mt-4 max-h-[760px] space-y-2 overflow-y-auto">
            {filteredOffers.map((offer) => {
              const product = initialProducts.find((item) => item.id === offer.linkedProductId);
              return (
                <article key={offer.id} className={`rounded-xl border p-3 ${draft.id === offer.id ? "border-[#8B5E3C] bg-[#FCF8F3]" : "border-[#EFE8DF]"}`}>
                  <button type="button" onClick={() => setDraft(offer)} className="w-full text-right">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[#3A2117]">{offer.title}</p>
                        <p className="mt-1 text-xs font-bold text-[#806A5E]">{offer.type}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${statusTone(offer.status)}`}>{offer.status}</span>
                    </div>
                    <p className="mt-2 truncate text-xs font-bold text-[#806A5E]">
                      {offer.startDate || "بدون بداية"} — {offer.endDate || "بدون نهاية"}
                    </p>
                    {product ? <p className="mt-1 truncate text-xs font-black text-[#8B5E3C]">{product.name}</p> : null}
                    <p className="mt-1 text-[10px] font-black text-[#806A5E]">{generationLabel(offer.cardGenerationStatus)}</p>
                  </button>
                  <div className="mt-3 flex gap-2 border-t border-[#EFE8DF] pt-2">
                    <button type="button" onClick={() => setDraft(offer)} className="inline-flex items-center gap-1 text-xs font-black text-[#3A2117]">
                      <Pencil className="h-3.5 w-3.5" /> تعديل
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(offer)} className="mr-auto inline-flex items-center gap-1 text-xs font-black text-rose-700">
                      <Trash2 className="h-3.5 w-3.5" /> حذف
                    </button>
                  </div>
                </article>
              );
            })}
            {!filteredOffers.length ? <p className="py-8 text-center text-sm font-bold text-[#806A5E]">لا توجد نتائج مطابقة.</p> : null}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="rounded-2xl border border-[#E7D7C6] bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-[#8B5E3C]">محرر العرض</p>
                <h2 className="mt-1 text-2xl font-black text-[#3A2117]">{/^[0-9a-f-]{36}$/i.test(draft.id) ? "تعديل العرض" : "عرض جديد"}</h2>
              </div>
              <button type="button" onClick={save} disabled={isSaving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#3A2117] px-5 text-sm font-black text-white disabled:opacity-60">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                حفظ العرض
              </button>
            </div>

            <fieldset className="mt-6 border-t border-[#EFE8DF] pt-5">
              <legend className="px-2 text-sm font-black text-[#3A2117]">معلومات العرض</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-black text-[#806A5E] sm:col-span-2">عنوان العرض
                  <input value={draft.title} onChange={(event) => update("title", event.target.value)} className={inputClass} />
                </label>
                <label className="text-xs font-black text-[#806A5E] sm:col-span-2">وصف العرض
                  <textarea value={draft.description} onChange={(event) => update("description", event.target.value)} rows={3} className={`${inputClass} py-3`} />
                </label>
                <label className="text-xs font-black text-[#806A5E]">نوع العرض
                  <select value={draft.type} onChange={(event) => update("type", event.target.value as OfferType)} className={inputClass}>
                    {offerTypes.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
                <label className="text-xs font-black text-[#806A5E]">نص زر الإجراء
                  <input value={draft.ctaText || ""} onChange={(event) => update("ctaText", event.target.value)} className={inputClass} />
                </label>
              </div>
            </fieldset>

            <fieldset className="mt-6 border-t border-[#EFE8DF] pt-5">
              <legend className="px-2 text-sm font-black text-[#3A2117]">الارتباط بالمنتجات</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-black text-[#806A5E]">المنتج المرتبط
                  <select
                    value={draft.linkedProductId || ""}
                    onChange={(event) => {
                      const product = initialProducts.find((item) => item.id === event.target.value);
                      setDraft((current) => ({
                        ...current,
                        linkedProductId: product?.id,
                        promoProductName: product?.name,
                        promoProductPrice: product?.price,
                        promoProductCategory: product?.category,
                        promoProductDescription: product?.description,
                      }));
                    }}
                    className={inputClass}
                  >
                    <option value="">بدون منتج مرتبط</option>
                    {initialProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-black text-[#806A5E]">نسبة الخصم
                  <input type="number" min="0" max="100" value={draft.discountPercent ?? ""} onChange={(event) => update("discountPercent", event.target.value ? Number(event.target.value) : undefined)} className={inputClass} />
                </label>
                <label className="text-xs font-black text-[#806A5E]">كود الخصم
                  <input value={draft.code || ""} onChange={(event) => update("code", event.target.value || undefined)} className={inputClass} />
                </label>
              </div>
              {selectedProduct ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#EFE8DF] bg-[#FCF8F3] p-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white">
                    <ProductImage
                      product={selectedProduct}
                      alt={selectedProduct.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-black text-[#3A2117]">{selectedProduct.name}</p>
                    <p className="mt-1 text-xs font-bold text-[#806A5E]">{selectedProduct.category} · {formatSar(selectedProduct.price)}</p>
                  </div>
                </div>
              ) : null}
            </fieldset>

            <fieldset className="mt-6 border-t border-[#EFE8DF] pt-5">
              <legend className="px-2 text-sm font-black text-[#3A2117]">الجدولة والظهور</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-black text-[#806A5E]">الحالة
                  <select value={draft.status} onChange={(event) => update("status", event.target.value as OfferStatus)} className={inputClass}>
                    {statuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                <label className="text-xs font-black text-[#806A5E]">مكان الظهور
                  <select value={draft.placement} onChange={(event) => update("placement", event.target.value as OfferPlacement)} className={inputClass}>
                    {placements.map((placement) => <option key={placement}>{placement}</option>)}
                  </select>
                </label>
                <label className="text-xs font-black text-[#806A5E]">تاريخ البداية
                  <input type="date" value={draft.startDate || ""} onChange={(event) => update("startDate", event.target.value || undefined)} className={inputClass} />
                </label>
                <label className="text-xs font-black text-[#806A5E]">تاريخ النهاية
                  <input type="date" value={draft.endDate || ""} onChange={(event) => update("endDate", event.target.value || undefined)} className={inputClass} />
                </label>
                <label className="flex items-center gap-2 text-sm font-black text-[#3A2117] sm:col-span-2">
                  <input type="checkbox" checked={draft.visibleInCafe} onChange={(event) => update("visibleInCafe", event.target.checked)} className="h-4 w-4" />
                  ظاهر في الفرع الإلكتروني
                </label>
              </div>
            </fieldset>

            <fieldset className="mt-6 border-t border-[#EFE8DF] pt-5">
              <legend className="px-2 text-sm font-black text-[#3A2117]">صورة العرض</legend>
              <p className="text-xs font-bold text-[#806A5E]">
                حالة التوليد: {generationLabel(draft.cardGenerationStatus)}
              </p>
              {draft.cardGenerationError ? <p className="mt-2 text-xs font-black text-rose-700">{draft.cardGenerationError}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#E7D7C6] px-4 text-sm font-black text-[#3A2117]">
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  رفع صورة يدويًا
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" disabled={isUploading} onChange={(event) => void uploadBanner(event.target.files?.[0])} />
                </label>
                <button type="button" disabled={isGenerating || draft.cardGenerationStatus === "generating"} onClick={() => void generateCard()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#8B5E3C] px-4 text-sm font-black text-white disabled:opacity-60">
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {draft.cardStoragePath ? "إعادة التوليد" : "توليد صورة بالذكاء الاصطناعي"}
                </button>
              </div>
            </fieldset>
          </div>

          <div className="rounded-2xl border border-[#E7D7C6] bg-[#FCF8F3] p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-[#8B5E3C]">المعاينة الحية</p>
                <h2 className="mt-1 text-lg font-black text-[#3A2117]">كما ستظهر للعميل</h2>
              </div>
              <span className="text-xs font-bold text-[#806A5E]">{businessCategory || "هوية العلامة"}</span>
            </div>
            <OfferCard offer={draft} />
          </div>
        </section>
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <Trash2 className="h-7 w-7 text-rose-700" />
            <h2 className="mt-3 text-xl font-black text-[#3A2117]">تأكيد حذف العرض</h2>
            <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">سيُخفى العرض من الفرع الإلكتروني، ولن يتم الحذف دون هذا التأكيد.</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => void confirmDelete()} className="min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-black text-white">حذف العرض</button>
              <button type="button" onClick={() => setDeleteTarget(null)} className="min-h-11 rounded-xl border border-[#E7D7C6] px-4 text-sm font-black">إلغاء</button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardPageShell>
  );
}
