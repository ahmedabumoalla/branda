"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Coffee, Minus, Plus, ShoppingBag, MapPin, Clock, Utensils } from "lucide-react";
import { createCafeOrderAction } from "@/app/actions/orders";
import { formatSar } from "@/lib/format";
import { promoBadgeText, productFinalPrice, type MenuProduct } from "@/lib/mock/menu";
import type { CafeBranch } from "@/lib/mock/branches";
import { ProductReviews } from "@/components/cafe/product-reviews";
import { CafeLogo } from "@/components/cafe/cafe-logo";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { ThemedProductDetailLayout } from "@/components/cafe/themes/themed-product-detail";
import { InternalAdPanel } from "@/components/cafe/themes/customer-experience-primitives";
import {
  CustomerBottomDock,
  defaultCustomerDockItems,
} from "@/components/cafe/themes/customer-mobile-experience";
import { clearCachedCustomerSession, getCustomerSession } from "@/lib/customer/session";
import { usePublicCafeMenu } from "@/lib/cafe/use-public-cafe-menu";
import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";
import { appendPreviewToNextPath, getCafePath, getCustomerLoginHref } from "@/lib/cafe/theme-links";
import { ProductMediaDisplay } from "@/components/cafe/product-image";
import { resolveProductCategoryLabel } from "@/lib/cafe/menu-category-utils";
import { getBusinessCopy } from "@/lib/platform/business-copy";



function defaultPickupTime(leadMinutes = 30) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + leadMinutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ProductDetailClient({ slug, id }: { slug: string; id: string }) {
  const router = useRouter();
  const { theme, settings, experience, previewThemeId, path } = useCafePageContext(slug);
  const copy = getBusinessCopy(settings.businessCategory);
  const isEvents = copy.kind === "events";
  const ProductFallbackIcon = copy.kind === "events" ? CalendarDays : copy.kind === "restaurant" ? Utensils : Coffee;
  const logoUrl = useResolvedCafeLogoUrl(settings);
  const { products, branches, loading, error } = usePublicCafeMenu(slug);
  const [quantity, setQuantity] = useState(1);
  const [branchName, setBranchName] = useState("");
  const [pickupAt, setPickupAt] = useState("");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const active = branches.filter((b: CafeBranch) => b.active);
    if (active[0]) setBranchName(active[0].name);
  }, [branches]);

  const product = useMemo(() => products.find((p) => p.id === id), [products, id]);

  useEffect(() => {
    if (!product) return;
    setPickupAt(defaultPickupTime(product.pickupLeadTimeMinutes ?? 30));
  }, [product]);

  const activeBranches = branches.filter((b) => b.active);

  const unitPrice = product ? productFinalPrice(product.price, product.promo) : 0;
  const subtotal = product ? unitPrice * quantity : 0;
  const total = Math.round(subtotal * 100) / 100;

  async function addToOrder() {
    if (!product) return;
    const customer = await getCustomerSession(slug);
    if (!customer) {
      alert(isEvents ? "يجب تسجيل الدخول لشراء التذكرة." : "يجب تسجيل الدخول لإرسال الطلب.");
      router.push(getCustomerLoginHref(slug, `/c/${slug}/product/${id}`, previewThemeId));
      return;
    }

    if (activeBranches.length > 1 && !branchName) {
      alert(isEvents ? "اختر موقع أو بوابة الدخول" : "اختر فرع الاستلام");
      return;
    }

    if (!pickupAt) {
      alert(isEvents ? "حدد وقت الدخول" : "حدد وقت الاستلام");
      return;
    }

    setAdding(true);
    try {
      const pickupLabel = pickupAt.replace("T", " ");
      const result = await createCafeOrderAction({
        slug,
        customer,
        product,
        quantity,
        branchName: activeBranches.length === 1 ? activeBranches[0].name : branchName,
        pickupAt: pickupLabel,
        notes: notes.trim() || undefined,
      });
      if (!result.ok) {
        alert(result.message);
        if (
          result.code === "login_required" ||
          result.code === "invalid_customer_session"
        ) {
          clearCachedCustomerSession(slug);
          router.push(getCustomerLoginHref(slug, `/c/${slug}/product/${id}`, previewThemeId));
        }
        return;
      }
      alert(
        isEvents
          ? `تم إرسال طلب شراء التذكرة!\nالإجمالي: ${result.order.total} ر.س\nبانتظار موافقة ${copy.casualNoun}.`
          : `تم إرسال طلب الاستلام!\nالإجمالي: ${result.order.total} ر.س\nالدفع عند الاستلام.\nبانتظار موافقة ${copy.casualNoun}.`
      );
      router.push(appendPreviewToNextPath(path("account"), previewThemeId));
    } catch {
      alert("تعذر إرسال الطلب. تحقق من الاتصال وحاول مرة أخرى.");
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">جاري التحميل...</p>
        </div>
      </CafeLayout>
    );
  }

  if (error) {
    return (
      <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <p className="font-black">{error}</p>
        </div>
      </CafeLayout>
    );
  }

  if (!product) {
    return (
      <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <h1 className="text-3xl font-black">{isEvents ? "التذكرة غير موجودة" : "المنتج غير موجود"}</h1>
          <Link href={path()} className={`mt-5 inline-block px-6 py-3 font-black ${theme.button}`}>
            {isEvents ? "رجوع للتذاكر" : "رجوع للمنيو"}
          </Link>
        </div>
      </CafeLayout>
    );
  }

  const pickupAvailable = product.availableForPickup !== false;
  const categoryLabel = resolveProductCategoryLabel(product);

  const metaBadges: { icon?: typeof Clock; text: string }[] = [];
  if (product.preparationTimeMinutes && product.preparationTimeMinutes > 0) {
    metaBadges.push({
      icon: Clock,
      text: `جاهز خلال ${product.preparationTimeMinutes} دقيقة`,
    });
  }


  const imageSlot = (
    <div className="relative flex h-[min(460px,54vh)] items-center justify-center overflow-hidden rounded-[24px] bg-[var(--ci-page-bg,var(--barndaksa-cream-base))]">
      <div className="absolute inset-x-4 top-4 z-20 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-black ${theme.badge}`}>
          {categoryLabel}
        </span>
        {product.promo ? (
          <span className={`rounded-full px-3 py-1 text-xs font-black ${theme.button}`}>
            {promoBadgeText(product.promo)}
          </span>
        ) : null}
      </div>
      <ProductMediaDisplay
        product={product}
        alt={product.name}
        className="relative z-10 max-h-full w-full object-contain p-6 sm:p-8"
        fallback={<ProductFallbackIcon className="relative z-10 h-16 w-16 opacity-40" />}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/20 to-transparent" />
    </div>
  );

  const infoSlot = (
    <>
      <div className="mb-5 grid gap-3 rounded-[24px] border border-black/5 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className={`text-xs font-black ${theme.muted}`}>{isEvents ? "ملخص شراء التذكرة" : "ملخص الطلب"}</p>
          <p className="mt-1 text-2xl font-black">{formatSar(total)}</p>
        </div>
        <span className={`rounded-2xl px-4 py-3 text-center text-sm font-black ${theme.badge}`}>
          {pickupAvailable ? (isEvents ? "شراء التذكرة متاح" : "استلام متاح") : (isEvents ? "غير متاحة للشراء" : "غير متاح للاستلام")}
        </span>
      </div>
      <p className={`text-sm font-black ${theme.accent}`}>{categoryLabel}</p>
      <h1
        className={`mt-2 font-black leading-tight ${experience.detail === "kiosk" ? "text-3xl" : "text-2xl sm:text-3xl"} ${experience.headingTracking}`}
      >
        {product.name}
      </h1>
      <p className={`mt-3 text-sm font-bold leading-7 ${theme.muted}`}>{product.description}</p>

      {metaBadges.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {metaBadges.map((badge) => (
            <span
              key={badge.text}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-black ${theme.badge}`}
            >
              {badge.icon ? <badge.icon className="h-4 w-4" /> : null}
              {badge.text}
            </span>
          ))}
        </div>
      ) : null}

      {product.promo ? (
        <div className={`mt-5 rounded-2xl p-4 ${theme.card}`}>
          <p className={`text-sm font-bold ${theme.muted}`}>عرض مرتبط</p>
          <h3 className={`mt-1 text-xl font-black ${theme.accent}`}>
            {promoBadgeText(product.promo)}
          </h3>
        </div>
      ) : null}

      <div className="mt-6 flex items-center gap-4">
        <span className="text-sm font-black">الكمية</span>
        <div className={`flex items-center gap-2 rounded-2xl border p-1 ${theme.card}`}>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="flex h-10 w-10 items-center justify-center rounded-xl font-black"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-xl font-black">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-xl font-black"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [isEvents ? "رسوم الدخول شاملة الضريبة" : "السعر شامل الضريبة", formatSar(unitPrice)],
          ["الإجمالي", formatSar(total)],
        ].map(([label, val]) => (
          <div key={label} className={`rounded-2xl p-3 text-center ${theme.card}`}>
            <p className={`text-xs font-black ${theme.muted}`}>{label}</p>
            <p className="mt-1 font-black">{val}</p>
          </div>
        ))}
      </div>

      {pickupAvailable ? (
        <div className={`mt-6 space-y-4 rounded-2xl p-4 ${theme.card}`}>
          <p className="text-sm font-black">{isEvents ? "تفاصيل الدخول" : "تفاصيل الاستلام"}</p>

          {activeBranches.length > 1 ? (
            <label className="block">
              <span className={`flex items-center gap-1 text-xs font-black ${theme.muted}`}>
                <MapPin className="h-3.5 w-3.5" />
                {isEvents ? "موقع الفعالية أو بوابة الدخول" : "فرع الاستلام"}
              </span>
              <select value={branchName} onChange={(e) => setBranchName(e.target.value)} className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm font-bold outline-none ${theme.card}`}>
                {activeBranches.map((branch) => (
                  <option key={branch.id} value={branch.name}>{branch.name} {branch.address ? ` - ${branch.address}` : ""}</option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block">
            <span className={`flex items-center gap-1 text-xs font-black ${theme.muted}`}>
              <Clock className="h-3.5 w-3.5" />
              {isEvents ? "وقت الدخول" : "وقت الاستلام"}
            </span>
            <input
              type="datetime-local"
              value={pickupAt}
              onChange={(e) => setPickupAt(e.target.value)}
              className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm font-bold outline-none ${theme.card}`}
            />
          </label>

          <label className="block">
            <span className={`text-xs font-black ${theme.muted}`}>ملاحظات (اختياري)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={isEvents ? "ملاحظات على شراء التذكرة..." : "ملاحظات على الطلب..."}
              className={`mt-2 w-full resize-none rounded-xl border px-4 py-3 text-sm font-bold outline-none ${theme.card}`}
            />
          </label>

          <div className={`rounded-xl border border-dashed p-4 text-sm font-bold ${theme.muted}`}>
            {isEvents ? `سيتم تأكيد شراء التذكرة بعد موافقة ${copy.casualNoun}.` : `الدفع عند الاستلام — لا يتم خصم أي مبلغ الآن. سيتم تأكيد الطلب بعد موافقة ${copy.casualNoun}.`}
          </div>
        </div>
      ) : (
        <div className={`mt-6 rounded-2xl p-4 text-sm font-bold ${theme.card} ${theme.muted}`}>
          {isEvents ? "هذه التذكرة غير متاحة للشراء حاليًا." : "هذا المنتج غير متاح للاستلام حاليًا."}
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-lg font-black">{isEvents ? "تشمل التذكرة" : "المكونات"}</h2>
        <div className="flex flex-wrap gap-2">
          {product.ingredients.map((ing) => (
            <span key={ing} className={`rounded-full px-3 py-1.5 text-sm font-black ${theme.badge}`}>
              {ing}
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void addToOrder()}
        disabled={adding || !pickupAvailable}
        className={`mt-8 flex w-full items-center justify-center gap-2 font-black disabled:opacity-60 ${
          experience.detail === "kiosk" ? "h-16 text-lg rounded-lg" : "h-16 rounded-2xl text-lg"
        } ${theme.button}`}
      >
        <ShoppingBag className="h-6 w-6" />
        {adding ? "جاري الإرسال..." : isEvents ? "شراء تذكرة" : "اطلب للاستلام — الدفع عند الاستلام"}
      </button>
    </>
  );

  return (
    <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
      <div className="barndaksa-cinematic-stage space-y-5">
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <CafeLogo
              name={settings.cafeName || slug}
              logoUrl={logoUrl}
              size="sm"
              className="rounded-[18px]"
            />
            <div className="min-w-0">
              <h1 className={`truncate text-xl font-black leading-tight ${experience.headingTracking}`}>
                {settings.cafeName || slug}
              </h1>
            </div>
          </div>
          <Link
            href={getCafePath(slug, "products/popular", previewThemeId)}
            aria-label={isEvents ? "رجوع للتذاكر" : "رجوع للمنيو"}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-black/5 shadow-sm transition active:scale-95 ${theme.card}`}
          >
            <ArrowRight className={`h-5 w-5 ${theme.accent}`} />
          </Link>
        </header>

        <ThemedProductDetailLayout
          experience={experience}
          imageSlot={imageSlot}
          infoSlot={infoSlot}
          reviewsSlot={
            <div className="rounded-[28px] bg-white/60 p-1 shadow-[0_14px_45px_rgba(23,20,18,0.06)] ring-1 ring-[var(--ci-border,#E7D7C6)]/70">
              <ProductReviews
                slug={slug}
                productId={product.id}
                productName={product.name}
                experience={experience}
                previewThemeId={previewThemeId}
              />
            </div>
          }
        />
      </div>
      <CustomerBottomDock
        {...defaultCustomerDockItems({
          slug,
          previewThemeId,
          active: "menu",
          hasProducts: true,
          hasOrders: true,
          hasRewards: true,
          businessCategory: settings.businessCategory,
        })}
      />
    </CafeLayout>
  );

  return (
    <CafeLayout slug={slug} hideHeader hideFooter hideQuickDock>
      <Link
        href={getCafePath(slug, "products/popular", previewThemeId)}
        className={`mb-6 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-black ${theme.buttonOutline}`}
      >
        <ArrowRight className="h-4 w-4" />
        رجوع للمنيو
      </Link>

      <ThemedProductDetailLayout
        experience={experience}
        imageSlot={imageSlot}
        infoSlot={infoSlot}
        reviewsSlot={
          <div className="space-y-6">
            <ProductReviews
              slug={slug}
              productId={product!.id}
              productName={product!.name}
              experience={experience}
              previewThemeId={previewThemeId}
            />
            <InternalAdPanel
              compact
              title={product!.promo ? promoBadgeText(product!.promo!) : isEvents ? "استكشف تذاكر مشابهة" : "استكشف منتجات مشابهة"}
              eyebrow={isEvents ? "إعلان داخل تفاصيل التذكرة" : "إعلان داخل تفاصيل المنتج"}
              description={isEvents ? "مساحة ذكية تقود العميل إلى قائمة التذاكر أو العروض بعد قراءة التفاصيل والمراجعات." : "مساحة ذكية تقود العميل إلى قائمة المنتجات أو العروض بعد قراءة تفاصيل المنتج والمراجعات."}
              href={getCafePath(slug, product!.promo ? "products/offers" : "products/popular", previewThemeId)}
              cta={product!.promo ? "كل العروض" : isEvents ? "كل التذاكر" : "كل المنتجات"}
            />
          </div>
        }
      />
      <CustomerBottomDock
        {...defaultCustomerDockItems({
          slug,
          previewThemeId,
          active: "menu",
          hasProducts: true,
          hasOrders: true,
          hasRewards: true,
          businessCategory: settings.businessCategory,
        })}
      />
    </CafeLayout>
  );
}
