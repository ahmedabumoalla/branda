import { Suspense } from "react";
import { PublicGamesPage } from "@/components/cafe/public-games-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicTableWarsVisibilityBySlug } from "@/lib/data/table-wars";

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function CafeGamesPage({ params }: Props) {
  const { slug } = await params;
  const tableWarsVisibility =
    isSupabaseConfigured()
      ? await getPublicTableWarsVisibilityBySlug(slug).catch(() => null)
      : null;

  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <PublicGamesPage slug={slug} tableWarsEntryHref={tableWarsVisibility?.entryHref ?? null} />
    </Suspense>
  );
}
