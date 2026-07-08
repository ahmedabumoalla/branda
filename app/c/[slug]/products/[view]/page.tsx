import { Suspense } from "react";
import { ProductCollectionPage } from "@/components/cafe/product-collection-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicTableWarsVisibilityBySlug } from "@/lib/data/table-wars";

type Props = {
  params: Promise<{
    slug: string;
    view: string;
  }>;
};

export default async function CafeProductCollection({ params }: Props) {
  const { slug, view } = await params;
  const tableWarsVisibility =
    isSupabaseConfigured()
      ? await getPublicTableWarsVisibilityBySlug(slug).catch(() => null)
      : null;

  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ProductCollectionPage
        slug={slug}
        view={view}
        tableWarsEntryHref={tableWarsVisibility?.entryHref ?? null}
      />
    </Suspense>
  );
}
