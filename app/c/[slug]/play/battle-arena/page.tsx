export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getCafePath } from "@/lib/cafe/theme-links";
import { isBattleArenaEnabledForCafe } from "@/lib/data/brand-games";
import { getPublicCafeBySlugAdmin } from "@/lib/data/cafes";
import { hasBrandFeature } from "@/lib/data/feature-entitlements";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PUBLIC_GAMES_FEATURE_KEY = "in_store_table_wars";

function firstQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function GameUnavailablePage({ slug, previewThemeId }: { slug: string; previewThemeId?: string | null }) {
  const productsHref = getCafePath(slug, "products/popular", previewThemeId);

  return (
    <main dir="rtl" className="grid min-h-screen place-items-center bg-[#160F0C] px-4 text-[#311912]">
      <div className="w-full max-w-xl rounded-lg border border-[#E7D7C6]/70 bg-white/95 p-5 text-center shadow-[0_18px_44px_rgba(12,7,5,0.22)]">
        <p className="text-sm font-black leading-7">هذه اللعبة غير متاحة لهذه العلامة حاليًا</p>
        <Link
          href={productsHref}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[#24140F] px-4 text-xs font-black text-[#FFF3D3] transition active:scale-95"
        >
          رجوع إلى العلامة
        </Link>
      </div>
    </main>
  );
}

export default async function PublicBattleArenaPage({ params, searchParams }: Props) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const previewThemeId = firstQueryValue(resolvedSearchParams.previewTheme);

  if (!isSupabaseConfigured()) {
    return (
      <main dir="rtl" className="grid h-[100dvh] w-screen place-items-center overflow-hidden bg-[#160F0C] px-4 text-[#311912]">
        <p className="max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm font-black text-amber-800">
          قم بإعداد Supabase في .env.local
        </p>
      </main>
    );
  }

  let cafe: Awaited<ReturnType<typeof getPublicCafeBySlugAdmin>> | null = null;
  let gameEnabled = false;

  try {
    cafe = await getPublicCafeBySlugAdmin(slug);
    if (cafe) {
      const [gamesFeatureEnabled, battleArenaEnabled] = await Promise.all([
        hasBrandFeature(String(cafe.id), PUBLIC_GAMES_FEATURE_KEY),
        isBattleArenaEnabledForCafe(String(cafe.id)),
      ]);
      gameEnabled = gamesFeatureEnabled && battleArenaEnabled;
    }
  } catch (error) {
    console.error("[PublicBattleArenaPage]", error);
  }

  if (!cafe || !gameEnabled) {
    return <GameUnavailablePage slug={slug} previewThemeId={previewThemeId} />;
  }

  return (
    <main className="h-[100dvh] w-screen overflow-hidden bg-[#090716]">
      <iframe
        src="/battle-arena/game-play-live-v1/index.html?v=20260718-2"
        title="حلبة الأبطال — Mythic Rift"
        className="block h-full w-full border-0"
        allow="autoplay"
      />
    </main>
  );
}
