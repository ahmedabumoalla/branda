import { Plus } from "lucide-react";
import type { BrandaFinanceProduct } from "@/lib/branda-finance/invoice-types";

type ProductCardProps = {
  product: BrandaFinanceProduct;
  onAdd: (product: BrandaFinanceProduct) => void;
};

export function ProductCard({ product, onAdd }: ProductCardProps) {
  return (
    <button
      type="button"
      onClick={() => onAdd(product)}
      className="group overflow-hidden rounded-[18px] border border-[#E7D7C6] bg-white text-right shadow-[0_12px_34px_rgba(49,25,18,0.06)] transition hover:-translate-y-0.5 hover:border-[#D9A33F]"
    >
      <div className="aspect-[4/3] bg-[#F8F1E7]">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-black text-[#806A5E]">Branda</div>
        )}
      </div>
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 className="line-clamp-1 font-black text-[#311912]">{product.name}</h3>
            {product.englishName ? <p className="mt-1 text-xs font-bold text-[#806A5E]">{product.englishName}</p> : null}
          </div>
          <span className="rounded-full bg-[#F7E6C3] px-2 py-1 text-[11px] font-black text-[#6B3A25]">VAT</span>
        </div>
        <p className="line-clamp-2 min-h-10 text-xs font-bold leading-5 text-[#806A5E]">{product.description}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-lg font-black text-[#3A2117]">{product.price.toLocaleString("ar-SA")} ر.س</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#3A2117] px-3 py-2 text-xs font-black text-white">
            <Plus className="h-3.5 w-3.5" />
            إضافة
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-[#806A5E]">
          <span>{product.sku}</span>
          <span>{product.barcode}</span>
          <span className={product.available ? "text-emerald-700" : "text-red-700"}>{product.available ? `متاح ${product.stock}` : "غير متاح"}</span>
        </div>
      </div>
    </button>
  );
}
