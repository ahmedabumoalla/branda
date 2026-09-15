import { Suspense } from "react";
import { PublicGamesPage } from "@/components/cafe/public-games-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicGamesVisibilityBySlug } from "@/lib/data/feature-entitlements";

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

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

  const gamesVisibility = await getPublicGamesVisibilityBySlug(slug).catch(() => null);
  if (!gamesVisibility?.showPublicGamesSection) return <GamesUnavailableState />;

  const battleArenaEntryHref = gamesVisibility.battleArenaEnabled
    ? `/c/${encodeURIComponent(slug)}/play/battle-arena`
    : null;
  const tableWarsEntryHref = gamesVisibility.tableWarsEnabled
    ? `/c/${encodeURIComponent(slug)}/play/table-wars`
    : null;

  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <PublicGamesPage
        slug={slug}
        battleArenaEntryHref={battleArenaEntryHref}
        tableWarsEntryHref={tableWarsEntryHref}
      />
    </Suspense>
  );
}
