import { Suspense } from "react";
import { ProductCollectionPage } from "@/components/cafe/product-collection-page";
import { PublicOffersPage } from "@/components/cafe/public-offers-page";

type Props = {
  params: Promise<{
    slug: string;
    view: string;
  }>;
};

export default async function CafeProductCollection({ params }: Props) {
  const { slug, view } = await params;
  if (view === "offers") {
    return <PublicOffersPage slug={slug} />;
  }

  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ProductCollectionPage slug={slug} view={view} />
    </Suspense>
  );
}
