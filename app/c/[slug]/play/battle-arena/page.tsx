export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";
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
    <div className="rounded-lg border border-[#E7D7C6] bg-white p-5 text-center shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
      <Trophy className="mx-auto h-9 w-9 text-[#6B3A25]" />
      <p className="mx-auto mt-3 max-w-xl text-sm font-black leading-7 text-[#311912]">{message}</p>
    </div>
  );
}

export default async function PublicBattleArenaPage({ params, searchParams }: Props) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const previewThemeId = firstQueryValue(resolvedSearchParams.previewTheme);
  const productsHref = getCafePath(slug, "products/popular", previewThemeId);

  if (!isSupabaseConfigured()) {
    return (
      <main dir="rtl" className="min-h-screen bg-[#FCF8F3] px-4 py-8 text-[#311912]">
        <div className="mx-auto max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm font-black text-amber-800">
          قم بإعداد Supabase في .env.local
        </div>
      </main>
    );
  }

  let cafe: Awaited<ReturnType<typeof getPublicCafeBySlugAdmin>> | null = null;
  let errorMessage = "لم يتم العثور على الفرع.";

  try {
    cafe = await getPublicCafeBySlugAdmin(slug);
  } catch (error) {
    console.error("[PublicBattleArenaPage]", error);
    errorMessage = "تعذر تحميل صفحة حلبة الأبطال.";
  }

  const cafeName = cafe?.name ? String(cafe.name) : "الفرع";

  return (
    <main dir="rtl" className="min-h-screen bg-[#FCF8F3] px-4 py-6 text-[#311912] sm:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="rounded-lg border border-[#E7D7C6] bg-white p-6 shadow-[8px_8px_28px_rgba(49,25,18,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="inline-flex w-fit items-center rounded-full border border-[#D9A33F]/35 bg-[#FFF7E3] px-4 py-2 text-xs font-black text-[#6B3A25]">
                Branda Play
              </span>
              <h1 className="mt-4 text-3xl font-black text-[#311912]">حلبة الأبطال</h1>
              <p className="mt-2 text-sm font-bold text-[#6B3A25]">{cafeName}</p>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#205B54]/10 text-[#205B54]">
                <Trophy className="h-7 w-7" />
              </span>
              <Link
                href={productsHref}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#E7D7C6] bg-[#FCF8F3] px-4 py-3 text-sm font-black text-[#6B3A25] transition hover:bg-[#FFF7E3] active:scale-95"
              >
                <ArrowRight className="h-4 w-4" />
                رجوع للمنتجات
              </Link>
            </div>
          </div>
        </header>

        {!cafe ? <MessageBox message={errorMessage} /> : <BattleArenaGame />}
      </div>
    </main>
  );
}
