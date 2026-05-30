"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Coffee, Minus, Plus, ShoppingBag, MapPin, Clock } from "lucide-react";
import { formatSar } from "@/lib/format";
import {
  mockMenuProducts,
  promoBadgeText,
  type MenuProduct,
} from "@/lib/mock/menu";
import { BRANCHES_KEY, mockBranches, type CafeBranch } from "@/lib/mock/branches";
import { ProductReviews } from "@/components/cafe/product-reviews";
import { CafeLayout, useCafePageContext } from "@/components/cafe/cafe-layout";
import { ThemedProductDetailLayout } from "@/components/cafe/themes/themed-product-detail";
import { getCustomerSession } from "@/lib/customer/session";
import { createCafeOrderFromProduct } from "@/lib/platform/order-flow";
import { appendPreviewToNextPath, getCafePath } from "@/lib/cafe/theme-links";
import { ProductImage } from "@/components/cafe/product-image";
import { resolveProductCategoryLabel } from "@/lib/cafe/menu-category-utils";

const STORAGE_KEY = "branda_qatrah_menu";
const TAX_RATE = 0.15;

function defaultPickupTime(leadMinutes = 30) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + leadMinutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ProductDetailClient({ slug, id }: { slug: string; id: string }) {
  const router = useRouter();
  const { theme, experience, previewThemeId, path } = useCafePageContext(slug);
  const [products, setProducts] = useState<MenuProduct[]>(mockMenuProducts);
  const [branches, setBranches] = useState<CafeBranch[]>(mockBranches);
  const [quantity, setQuantity] = useState(1);
  const [branchName, setBranchName] = useState("");
  const [pickupAt, setPickupAt] = useState("");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setProducts(JSON.parse(saved));

    const savedBranches = localStorage.getItem(BRANCHES_KEY);
    const list: CafeBranch[] = savedBranches ? JSON.parse(savedBranches) : mockBranches;
    setBranches(list);
    const active = list.filter((b) => b.active);
    if (active[0]) setBranchName(active[0].name);
  }, []);

  const product = useMemo(() => products.find((p) => p.id === id), [products, id]);

  useEffect(() => {
    if (!product) return;
    setPickupAt(defaultPickupTime(product.pickupLeadTimeMinutes ?? 30));
  }, [product]);

  const activeBranches = branches.filter((b) => b.active);

  const subtotal = product ? product.price * quantity : 0;
  const taxAmount = Math.round(subtotal * TAX_RATE * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  const loyaltyPoints = Math.floor(total);

  function addToOrder() {
    if (!product) return;
    const customer = getCustomerSession(slug);
    if (!customer) {
      const next = appendPreviewToNextPath(`/c/${slug}/product/${id}`, previewThemeId);
      router.push(`${path("login")}?next=${encodeURIComponent(next)}`);
      return;
    }

    if (!branchName) {
      alert("اختر فرع الاستلام");
      return;
    }

    if (!pickupAt) {
      alert("حدد وقت الاستلام");
      return;
    }

    setAdding(true);
    const pickupLabel = pickupAt.replace("T", " ");
    const result = createCafeOrderFromProduct({
      slug,
      customer,
      product,
      quantity,
      branchName,
      pickupAt: pickupLabel,
      notes: notes.trim() || undefined,
    });
    setAdding(false);
    alert(
      `تم إرسال طلب الاستلام!\nالإجمالي: ${result.total} ر.س\nالدفع عند الاستلام.\nبانتظار موافقة الكوفي.`
    );
    router.push(appendPreviewToNextPath(path("account"), previewThemeId));
  }

  if (!product) {
    return (
      <CafeLayout slug={slug}>
        <div className={`rounded-3xl p-8 text-center ${theme.card}`}>
          <h1 className="text-3xl font-black">المنتج غير موجود</h1>
          <Link href={path()} className={`mt-5 inline-block px-6 py-3 font-black ${theme.button}`}>
            رجوع للمنيو
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
  if (product.redeemableWithPoints && product.redemptionPoints) {
    metaBadges.push({
      text: `يمكن استبداله مقابل ${product.redemptionPoints} نقطة`,
    });
  }
  if (loyaltyPoints > 0) {
    metaBadges.push({
      text: `تكسب +${loyaltyPoints} نقطة عند الطلب`,
    });
  }

  const imageSlot = (
    <div className="relative flex h-[min(420px,50vh)] items-center justify-center overflow-hidden rounded-2xl bg-black/5">
      <ProductImage
        product={product}
        alt={product.name}
        className="relative z-10 max-h-full w-full object-contain p-6"
        fallback={<Coffee className="relative z-10 h-16 w-16 opacity-40" />}
      />
    </div>
  );

  const infoSlot = (
    <>
      <p className={`text-sm font-black ${theme.accent}`}>{categoryLabel}</p>
      <h1
        className={`mt-2 font-black ${experience.detail === "kiosk" ? "text-4xl" : "text-3xl sm:text-4xl"} ${experience.headingTracking}`}
      >
        {product.name}
      </h1>
      <p className={`mt-4 leading-9 ${theme.muted}`}>{product.description}</p>

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
          ["السعر", formatSar(product.price)],
          ["الضريبة", formatSar(taxAmount)],
          ["الإجمالي", formatSar(total)],
          ["نقاط الولاء", `+${loyaltyPoints}`],
        ].map(([label, val]) => (
          <div key={label} className={`rounded-2xl p-3 text-center ${theme.card}`}>
            <p className={`text-xs font-black ${theme.muted}`}>{label}</p>
            <p className="mt-1 font-black">{val}</p>
          </div>
        ))}
      </div>

      {pickupAvailable ? (
        <div className={`mt-6 space-y-4 rounded-2xl p-4 ${theme.card}`}>
          <p className="text-sm font-black">تفاصيل الاستلام</p>

          <label className="block">
            <span className={`flex items-center gap-1 text-xs font-black ${theme.muted}`}>
              <MapPin className="h-3.5 w-3.5" />
              فرع الاستلام
            </span>
            <select
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm font-bold outline-none ${theme.card}`}
            >
              {activeBranches.map((branch) => (
                <option key={branch.id} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={`flex items-center gap-1 text-xs font-black ${theme.muted}`}>
              <Clock className="h-3.5 w-3.5" />
              وقت الاستلام
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
              placeholder="مثال: بدون سكر، ثلج قليل..."
              className={`mt-2 w-full resize-none rounded-xl border px-4 py-3 text-sm font-bold outline-none ${theme.card}`}
            />
          </label>

          <div className={`rounded-xl border border-dashed p-4 text-sm font-bold ${theme.muted}`}>
            الدفع عند الاستلام — لا يتم خصم أي مبلغ الآن. سيتم تأكيد الطلب بعد موافقة الكوفي.
          </div>
        </div>
      ) : (
        <div className={`mt-6 rounded-2xl p-4 text-sm font-bold ${theme.card} ${theme.muted}`}>
          هذا المنتج غير متاح للاستلام حاليًا.
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-lg font-black">المكونات</h2>
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
        onClick={addToOrder}
        disabled={adding || !pickupAvailable}
        className={`mt-8 flex w-full items-center justify-center gap-2 font-black disabled:opacity-60 ${
          experience.detail === "kiosk" ? "h-16 text-lg rounded-lg" : "h-16 rounded-2xl text-lg"
        } ${theme.button}`}
      >
        <ShoppingBag className="h-6 w-6" />
        {adding ? "جاري الإرسال..." : "اطلب للاستلام — الدفع عند الاستلام"}
      </button>
    </>
  );

  return (
    <CafeLayout slug={slug}>
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
          <ProductReviews
            slug={slug}
            productId={product.id}
            productName={product.name}
            experience={experience}
            previewThemeId={previewThemeId}
          />
        }
      />
    </CafeLayout>
  );
}
