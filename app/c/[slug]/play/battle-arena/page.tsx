export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BattleArenaGame } from "@/components/cafe/battle-arena-game";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getCafePath } from "@/lib/cafe/theme-links";
import { getPublicCafeBySlugAdmin } from "@/lib/data/cafes";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function MessageBox({ message }: { message: string }) {
  return (
    <div className="mx-auto grid h-full min-h-[60dvh] max-w-xl place-items-center px-4">
      <p className="rounded-lg border border-[#E7D7C6]/70 bg-white/95 p-5 text-center text-sm font-black leading-7 text-[#311912] shadow-[0_18px_44px_rgba(12,7,5,0.22)]">
        {message}
      </p>
    </div>
  );
}

export default async function PublicBattleArenaPage({ params, searchParams }: Props) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const previewThemeId = firstQueryValue(resolvedSearchParams.previewTheme);
  const gamesHref = getCafePath(slug, "games", previewThemeId);

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
  let errorMessage = "لم يتم العثور على الفرع.";

  try {
    cafe = await getPublicCafeBySlugAdmin(slug);
  } catch (error) {
    console.error("[PublicBattleArenaPage]", error);
    errorMessage = "تعذر تحميل صفحة حلبة براندا.";
  }

  return (
    <main
      dir="rtl"
      className="relative h-[100dvh] max-h-[100dvh] w-screen overflow-hidden overscroll-none bg-[#160F0C] text-[#FFF3D3] sm:grid sm:place-items-center sm:p-5"
    >
      <Link
        href={gamesHref}
        className="fixed right-3 top-3 z-50 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#FFE0A2]/25 bg-[#24140F]/78 px-3 text-xs font-black text-[#FFF3D3] shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-md transition hover:bg-[#3A2117] active:scale-95 sm:right-5 sm:top-5"
      >
        <ArrowRight className="h-4 w-4" />
        رجوع للألعاب
      </Link>

      <div className="min-h-0 h-full max-h-[100dvh] w-full overflow-hidden sm:h-[min(100dvh-40px,920px)] sm:max-w-[520px] sm:rounded-xl sm:border sm:border-[#FFE0A2]/18 sm:shadow-[0_30px_80px_rgba(0,0,0,0.34)]">
        {!cafe ? <MessageBox message={errorMessage} /> : <BattleArenaGame />}
      </div>
    </main>
  );
}
