import { ProductDetailClient } from "@/components/cafe/product-detail-client";

type Props = {
  params: Promise<{
    slug: string;
    id: string;
  }>;
};

export default async function ProductDetailPage({ params }: Props) {
  const { slug, id } = await params;

  return <ProductDetailClient slug={slug} id={id} />;
}