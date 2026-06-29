import { Plus, Tag } from "lucide-react";
import { formatFinanceAmount } from "@/components/branda-finance/invoice-totals";
import type { FinanceProduct } from "@/lib/branda-finance/invoice-types";

type ProductCardProps = {
  product: FinanceProduct;
  showTranslationPreview: boolean;
  onAdd: (product: FinanceProduct) => void;
};

export function ProductCard({ product, showTranslationPreview, onAdd }: ProductCardProps) {
  const available = product.stock > 0;

  return (
    <button
      type="button"
      onClick={() => onAdd(product)}
      disabled={!available}
      className="group flex min-h-[270px] min-w-0 flex-col overflow-hidden rounded-[8px] border border-[#E0D0BB] bg-[#FFFDF8] text-right shadow-[0_14px_28px_rgba(69,43,28,0.08)] transition hover:-translate-y-0.5 hover:border-[#C99A4D] hover:shadow-[0_18px_38px_rgba(69,43,28,0.13)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#EFE2D0]">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#E7D6BD] text-2xl font-black text-[#6B3F22]">
            B
          </div>
        )}
        <span className={`absolute right-3 top-3 rounded-[8px] px-2.5 py-1 text-[11px] font-black text-white ${available ? "bg-[#2F5D50]" : "bg-[#9B3327]"}`}>
          {available ? "متاح" : "غير متاح"}
        </span>
        <span className="absolute left-3 top-3 rounded-[8px] bg-[#FFFDF8] px-2.5 py-1 text-[11px] font-black text-[#6B431C] shadow-sm">
          VAT {product.vatRate}%
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[14px] font-black leading-5 text-[#2F241D]">{product.name}</h3>
            <p className="mt-1 min-h-5 text-xs font-bold text-[#806A58]">
              {product.englishName || (showTranslationPreview ? "الترجمة الذكية ستعمل لاحقًا عند ربط مزود الترجمة" : "")}
            </p>
          </div>
          <span className="shrink-0 text-sm font-black text-[#2F5D50]" dir="ltr">
            {formatFinanceAmount(product.price)}
          </span>
        </div>
        <p className="mt-3 line-clamp-2 min-h-10 text-xs font-bold leading-5 text-[#7D6654]">{product.details}</p>
        <div className="mt-auto flex min-w-0 flex-wrap gap-1.5 pt-3">
          <span className="inline-flex items-center gap-1 rounded-[8px] bg-[#F4E8D8] px-2.5 py-1 text-[11px] font-black text-[#6B431C]">
            <Tag className="h-3.5 w-3.5" />
            {product.category}
          </span>
          <span className="rounded-[8px] bg-[#EDF4F1] px-2.5 py-1 text-[11px] font-black text-[#2F5D50]">
            المخزون {product.stock}
          </span>
          <span className="rounded-[8px] bg-[#F7F2EA] px-2.5 py-1 text-[11px] font-black text-[#755D49]" dir="ltr">
            {product.sku}
          </span>
          <span className="rounded-[8px] bg-[#F7F2EA] px-2.5 py-1 text-[11px] font-black text-[#755D49]" dir="ltr">
            {product.barcode}
          </span>
          <span className="rounded-[8px] bg-[#FFF8EA] px-2.5 py-1 text-[11px] font-black text-[#6B431C]">
            يكسب {product.loyaltyPointsEarned ?? Math.max(1, Math.round(product.price / 10))} نقطة
          </span>
          <span className={`rounded-[8px] px-2.5 py-1 text-[11px] font-black ${product.loyaltyRedeemEligible ?? true ? "bg-[#EDF7F2] text-[#2F5D50]" : "bg-[#FFF7F4] text-[#9B3327]"}`}>
            {product.loyaltyRedeemEligible ?? true ? "قابل للاستبدال" : "غير قابل للاستبدال"}
          </span>
        </div>
        <span className="mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-[8px] bg-[#5B3926] text-[12px] font-black text-white">
          <Plus className="h-4 w-4" />
          إضافة
        </span>
      </div>
    </button>
  );
}
