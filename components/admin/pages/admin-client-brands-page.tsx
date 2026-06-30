"use client";

import {
  Building2,
  CalendarDays,
  Eye,
  Gift,
  Plus,
  Save,
  Search,
  ShoppingBag,
  Star,
  Store,
  Trash2,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePlatformHomePromotionsAction } from "@/app/actions/platform-content";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import {
  AdminFilterBar,
  AdminInput,
  AdminPageShell,
  AdminSelect,
  AdminStatPill,
  BentoCard,
  BentoGrid,
  GoldButton,
  StatusBadge,
} from "@/components/ui/design-system";
import type {
  AdminClientBrandAvailableItem,
  AdminClientBrandsData,
  PlatformHomePromotionItem,
  PlatformHomePromotionType,
} from "@/lib/data/platform-content";

type Props = {
  initialData: AdminClientBrandsData;
  configError?: string;
};

const typeLabels: Record<PlatformHomePromotionType | "all", string> = {
  all: "كل العناصر",
  brand: "علامات تثق بنا",
  product: "منتجات",
  offer: "عروض",
  reservation: "حجوزات",
};

const typeIcons = {
  brand: Store,
  product: ShoppingBag,
  offer: Gift,
  reservation: CalendarDays,
} as const;

function itemKey(item: Pick<PlatformHomePromotionItem, "id" | "itemType" | "cafeId" | "itemId">) {
  return item.id ?? `${item.itemType}:${item.cafeId}:${item.itemId ?? "brand"}`;
}

function makePromotion(item: AdminClientBrandAvailableItem, sortOrder: number): PlatformHomePromotionItem {
  return {
    itemType: item.itemType,
    cafeId: item.cafeId,
    itemId: item.itemId ?? null,
    title: item.title,
    subtitle: item.subtitle ?? "",
    badge: item.badge ?? "",
    locationLabel: item.locationLabel ?? "",
    imageUrl: item.imageUrl ?? "",
    href: item.href,
    active: true,
    featured: false,
    sortOrder,
    brandName: item.brandName,
    brandLogoUrl: item.brandLogoUrl,
  };
}

function updateAt<T>(items: T[], index: number, next: T) {
  return items.map((item, itemIndex) => (itemIndex === index ? next : item));
}

function matchesQuery(item: AdminClientBrandAvailableItem, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.title, item.subtitle, item.brandName, item.badge, item.href]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function PreviewCard({ item }: { item: PlatformHomePromotionItem }) {
  const Icon = typeIcons[item.itemType];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {item.brandLogoUrl ? (
            <img src={item.brandLogoUrl} alt={item.brandName} className="h-12 w-12 rounded-2xl bg-white object-contain" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F6C35B]/15">
              <Building2 className="h-5 w-5 text-[#F6C35B]" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-[#F8F4EF]">{item.brandName}</p>
            <p className="truncate text-xs font-bold text-[#7A6255]">{item.locationLabel || "بدون لوكيشن مخصص"}</p>
          </div>
        </div>
        <StatusBadge tone={item.active ? "success" : "muted"}>{item.active ? "ظاهر" : "موقوف"}</StatusBadge>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs font-black text-[#F6C35B]">
        <Icon className="h-4 w-4" />
        <span>{item.badge || typeLabels[item.itemType]}</span>
        {item.featured ? <Star className="h-4 w-4 fill-current" /> : null}
      </div>
      <h3 className="mt-3 line-clamp-2 text-lg font-black text-[#F8F4EF]">{item.title || item.brandName}</h3>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm font-bold leading-6 text-[#CBB29C]">{item.subtitle || "بدون وصف مختصر"}</p>
      <p className="mt-3 truncate rounded-xl border border-white/10 bg-[#0f0c0a] px-3 py-2 text-left text-xs font-bold text-[#7A6255]">
        {item.href || "بدون رابط"}
      </p>
    </div>
  );
}

export function AdminClientBrandsPage({ initialData, configError }: Props) {
  const router = useRouter();
  const [promotions, setPromotions] = useState<PlatformHomePromotionItem[]>(
    initialData.promotions
  );
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<PlatformHomePromotionType | "all">("all");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedKeys = useMemo(
    () => new Set(promotions.map((item) => `${item.itemType}:${item.cafeId}:${item.itemId ?? "brand"}`)),
    [promotions]
  );

  const filteredAvailable = useMemo(() => {
    return initialData.availableItems.filter((item) => {
      const sameType = typeFilter === "all" || item.itemType === typeFilter;
      return sameType && matchesQuery(item, query);
    });
  }, [initialData.availableItems, query, typeFilter]);

  const sortedPromotions = useMemo(
    () => [...promotions].sort((a, b) => a.sortOrder - b.sortOrder),
    [promotions]
  );

  function addItem(item: AdminClientBrandAvailableItem) {
    const key = `${item.itemType}:${item.cafeId}:${item.itemId ?? "brand"}`;
    if (selectedKeys.has(key)) return;
    const nextSort = promotions.length ? Math.max(...promotions.map((promo) => promo.sortOrder)) + 10 : 10;
    setPromotions((current) => [...current, makePromotion(item, nextSort)]);
  }

  function updatePromotion(index: number, patch: Partial<PlatformHomePromotionItem>) {
    setPromotions((current) => updateAt(current, index, { ...current[index], ...patch }));
  }

  function removePromotion(index: number) {
    setPromotions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function save() {
    setMessage("");
    startTransition(() => {
      void (async () => {
        try {
          await savePlatformHomePromotionsAction(promotions);
          setMessage("تم حفظ اختيارات الصفحة الرئيسية بنجاح.");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "تعذر حفظ اختيارات الصفحة الرئيسية.");
        }
      })();
    });
  }

  return (
    <AdminPageShell
      title="إدارة العلامات التجارية للعملاء"
      subtitle="تحكم في علامات تثق بنا، وقسم اكتشف علاماتنا وعروضهم في الصفحة الرئيسية."
      action={<BarndaksaLogo variant="dark" width={130} height={52} />}
    >
      {configError ? <p className="mb-5 rounded-2xl bg-red-500/10 p-4 font-black text-red-300">{configError}</p> : null}
      {initialData.promotionsTableMissing ? (
        <p className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 font-black text-amber-200">
          جدول العروض الترويجية غير موجود بعد. يمكن معاينة المصادر، لكن الحفظ يحتاج اعتماد migration لجدول platform_home_promotions.
        </p>
      ) : null}
      {message ? <p className="mb-5 rounded-2xl bg-[#D9A33F]/10 p-4 font-black text-[#F6C35B]">{message}</p> : null}

      <BentoGrid className="mb-6">
        <BentoCard variant="cyber">
          <AdminStatPill label="العناصر المختارة" value={promotions.length} />
        </BentoCard>
        <BentoCard variant="cyber">
          <AdminStatPill label="الظاهرة" value={promotions.filter((item) => item.active).length} />
        </BentoCard>
        <BentoCard variant="cyber">
          <AdminStatPill label="المميزة" value={promotions.filter((item) => item.featured).length} />
        </BentoCard>
        <BentoCard variant="cyber">
          <AdminStatPill label="مصادر متاحة" value={initialData.availableItems.length} />
        </BentoCard>
      </BentoGrid>

      <AdminFilterBar>
        <div className="relative min-w-0 w-full flex-1">
          <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#CBB29C]" />
          <AdminInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث باسم العلامة أو المنتج أو العرض"
            className="pr-12"
          />
        </div>
        <AdminSelect
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as PlatformHomePromotionType | "all")}
          className="max-w-xs"
        >
          {Object.entries(typeLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </AdminSelect>
        <GoldButton onClick={save} disabled={isPending} className="inline-flex items-center justify-center gap-2">
          <Save className="h-4 w-4" />
          {isPending ? "جار الحفظ" : "حفظ الترتيب والاختيارات"}
        </GoldButton>
      </AdminFilterBar>

      <BentoGrid>
        <BentoCard variant="dark" span="2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-[#F8F4EF]">مصادر قابلة للإضافة</h2>
            <StatusBadge tone="gold">{filteredAvailable.length} عنصر</StatusBadge>
          </div>
          <div className="max-h-[720px] space-y-3 overflow-y-auto pr-1">
            {filteredAvailable.map((item) => {
              const Icon = typeIcons[item.itemType];
              const selected = selectedKeys.has(`${item.itemType}:${item.cafeId}:${item.itemId ?? "brand"}`);
              return (
                <div key={item.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      {item.imageUrl || item.brandLogoUrl ? (
                        <img src={item.imageUrl || item.brandLogoUrl} alt={item.title} className="h-14 w-14 rounded-2xl bg-white object-cover" />
                      ) : (
                        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6C35B]/15">
                          <Icon className="h-5 w-5 text-[#F6C35B]" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-black text-[#F8F4EF]">{item.title}</p>
                        <p className="truncate text-xs font-bold text-[#CBB29C]">{item.brandName}</p>
                        <p className="mt-1 text-xs font-black text-[#F6C35B]">{typeLabels[item.itemType]}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addItem(item)}
                      disabled={selected}
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#F6C35B] px-3 text-xs font-black text-[#241610] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-[#7A6255]"
                    >
                      <Plus className="h-4 w-4" />
                      {selected ? "مضاف" : "إضافة"}
                    </button>
                  </div>
                </div>
              );
            })}
            {!filteredAvailable.length ? (
              <p className="rounded-2xl border border-white/10 p-6 text-center font-bold text-[#7A6255]">
                لا توجد مصادر مطابقة.
              </p>
            ) : null}
          </div>
        </BentoCard>

        <BentoCard variant="dark" span="2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-[#F8F4EF]">العناصر المختارة للصفحة الرئيسية</h2>
            <StatusBadge tone="gold">{promotions.length} عنصر</StatusBadge>
          </div>
          <div className="space-y-4">
            {sortedPromotions.map((item) => {
              const index = promotions.findIndex((promo) => itemKey(promo) === itemKey(item));
              const Icon = typeIcons[item.itemType];
              return (
                <div key={itemKey(item)} className="rounded-2xl border border-white/10 bg-[#0f0c0a]/70 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-[#F6C35B]" />
                      <div>
                        <p className="font-black text-[#F8F4EF]">{typeLabels[item.itemType]}</p>
                        <p className="text-xs font-bold text-[#7A6255]">{item.brandName}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => removePromotion(index)} className="rounded-xl bg-red-500/10 p-3 text-red-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <AdminInput value={item.title} onChange={(event) => updatePromotion(index, { title: event.target.value })} placeholder="العنوان الظاهر" />
                    <AdminInput value={item.badge ?? ""} onChange={(event) => updatePromotion(index, { badge: event.target.value })} placeholder="الشارة" />
                    <AdminInput value={item.locationLabel ?? ""} onChange={(event) => updatePromotion(index, { locationLabel: event.target.value })} placeholder="اللوكيشن أو المدينة أو الفرع" />
                    <AdminInput type="number" min={0} value={item.sortOrder} onChange={(event) => updatePromotion(index, { sortOrder: Number(event.target.value) || 0 })} placeholder="Sort Order" />
                    <AdminInput value={item.href} onChange={(event) => updatePromotion(index, { href: event.target.value })} placeholder="الرابط" />
                    <AdminInput value={item.imageUrl ?? ""} onChange={(event) => updatePromotion(index, { imageUrl: event.target.value })} placeholder="رابط الصورة" />
                  </div>
                  <textarea
                    value={item.subtitle ?? ""}
                    onChange={(event) => updatePromotion(index, { subtitle: event.target.value })}
                    placeholder="الوصف المختصر"
                    className="mt-3 min-h-20 w-full resize-none rounded-xl border border-[#D9A33F]/25 bg-[#211711] px-3 py-3 text-right text-sm font-bold text-[#FCF8F3] outline-none placeholder:text-[#F2E7D9]/80"
                  />
                  <div className="mt-3 flex flex-wrap gap-3">
                    <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-black text-[#CBB29C]">
                      <input type="checkbox" checked={item.active} onChange={(event) => updatePromotion(index, { active: event.target.checked })} />
                      تفعيل الظهور
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-black text-[#CBB29C]">
                      <input type="checkbox" checked={item.featured} onChange={(event) => updatePromotion(index, { featured: event.target.checked })} />
                      Featured
                    </label>
                  </div>
                </div>
              );
            })}
            {!promotions.length ? (
              <p className="rounded-2xl border border-white/10 p-6 text-center font-bold text-[#7A6255]">
                أضف علامات أو منتجات أو عروض أو حجوزات لعرضها في الصفحة الرئيسية.
              </p>
            ) : null}
          </div>
        </BentoCard>
      </BentoGrid>

      <BentoCard variant="dark" className="mt-6">
        <div className="mb-4 flex items-center gap-3">
          <Eye className="h-6 w-6 text-[#F6C35B]" />
          <div>
            <h2 className="text-xl font-black text-[#F8F4EF]">معاينة قبل الحفظ</h2>
            <p className="mt-1 text-xs font-bold text-[#CBB29C]">الاسم، العلامة، اللوكيشن، والرابط كما سيظهرون تقريبًا في الصفحة الرئيسية.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedPromotions.slice(0, 9).map((item) => (
            <PreviewCard key={`preview:${itemKey(item)}`} item={item} />
          ))}
          {!sortedPromotions.length ? <p className="font-bold text-[#7A6255]">لا توجد عناصر للمعاينة.</p> : null}
        </div>
      </BentoCard>
    </AdminPageShell>
  );
}
