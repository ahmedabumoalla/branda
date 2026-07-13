import { Suspense } from "react";
import { PublicGamesPage } from "@/components/cafe/public-games-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { isBattleArenaEnabledForCafe } from "@/lib/data/brand-games";
import { getPublicCafeBySlugAdmin } from "@/lib/data/cafes";
import { getPublicTableWarsVisibilityBySlug } from "@/lib/data/table-wars";
import { getPublicCafeFeatureCodesBySlug } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

const PUBLIC_GAMES_FEATURE_KEY = "in_store_table_wars";

function GamesUnavailableState() {
  return (
    <main dir="rtl" className="grid min-h-screen place-items-center bg-[#FCF8F3] px-4 text-[#311912]">
      <p className="max-w-xl rounded-lg border border-[#E7D7C6] bg-white p-5 text-center text-sm font-black leading-7 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
        الألعاب غير متاحة لهذه العلامة حاليًا
      </p>
    </main>
  );
}

export default async function CafeGamesPage({ params }: Props) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) return <GamesUnavailableState />;

  const features = await getPublicCafeFeatureCodesBySlug(slug).catch(() => []);
  const gamesFeatureEnabled = featureCodesAllow(features, PUBLIC_GAMES_FEATURE_KEY);
  if (!gamesFeatureEnabled) return <GamesUnavailableState />;

  const cafe = await getPublicCafeBySlugAdmin(slug).catch(() => null);
  const [tableWarsVisibility, battleArenaEnabled] = await Promise.all([
    getPublicTableWarsVisibilityBySlug(slug).catch(() => null),
    cafe ? isBattleArenaEnabledForCafe(String(cafe.id)).catch(() => false) : Promise.resolve(false),
  ]);
  const battleArenaEntryHref = battleArenaEnabled
    ? `/c/${encodeURIComponent(slug)}/play/battle-arena`
    : null;

  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <PublicGamesPage
        slug={slug}
        battleArenaEntryHref={battleArenaEntryHref}
        tableWarsEntryHref={tableWarsVisibility?.entryHref ?? null}
      />
    </Suspense>
  );
}
