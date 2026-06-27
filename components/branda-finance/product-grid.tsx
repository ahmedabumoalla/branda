import type { BrandaFinanceProduct } from "@/lib/branda-finance/invoice-types";
import { ProductCard } from "@/components/branda-finance/product-card";

type ProductGridProps = {
  products: BrandaFinanceProduct[];
  onAdd: (product: BrandaFinanceProduct) => void;
};

export function ProductGrid({ products, onAdd }: ProductGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onAdd={onAdd} />
      ))}
      {!products.length ? (
        <div className="col-span-full rounded-[20px] border border-dashed border-[#D9C5AE] bg-white p-8 text-center font-black text-[#806A5E]">
          لا توجد نتائج مطابقة للبحث الحالي.
        </div>
      ) : null}
    </div>
  );
}
