import { ProductDetailClient } from "@/components/cafe/product-detail-client";
import { getPublicProductBySlug } from "@/lib/data/menu";

type Props = {
  params: Promise<{
    slug: string;
    id: string;
  }>;
};

export default async function ProductDetailPage({ params }: Props) {
  const { slug, id } = await params;
  const initialProduct = await getPublicProductBySlug(slug, id);

  return (
    <ProductDetailClient
      slug={slug}
      id={id}
      initialProduct={initialProduct}
    />
  );
}
