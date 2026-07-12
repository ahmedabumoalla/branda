export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, LockKeyhole, QrCode, Swords } from "lucide-react";
import { getTableWarsV2SnapshotAction } from "@/app/actions/table-wars";
import { TableWarsMultiplayerGame } from "@/components/cafe/table-wars-multiplayer-game";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getCafePath, getCustomerLoginHref } from "@/lib/cafe/theme-links";
import { getCustomerProfileForActiveSession } from "@/lib/data/customers";
import { getPublicTableWarsEntry } from "@/lib/data/table-wars";
import type { TableWarsV2Snapshot } from "@/lib/table-wars/v2-types";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function StatusPill({ children }: { children: string }) {
  return (
    <span className="inline-flex w-fit items-center rounded-full border border-[#D9A33F]/35 bg-[#FFF7E3] px-4 py-2 text-xs font-black text-[#6B3A25]">
      {children}
    </span>
  );
}

function MessageBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-[#E7D7C6] bg-white p-5 text-center shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
      <QrCode className="mx-auto h-9 w-9 text-[#6B3A25]" />
      <p className="mx-auto mt-3 max-w-xl text-sm font-black leading-7 text-[#311912]">{message}</p>
    </div>
  );
}

function GameUnavailablePage({ slug, previewThemeId }: { slug: string; previewThemeId?: string | null }) {
  const productsHref = getCafePath(slug, "products/popular", previewThemeId);

  return (
    <main dir="rtl" className="grid min-h-screen place-items-center bg-[#FCF8F3] px-4 text-[#311912]">
      <div className="w-full max-w-xl rounded-lg border border-[#E7D7C6] bg-white p-5 text-center shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
        <LockKeyhole className="mx-auto h-9 w-9 text-[#6B3A25]" />
        <p className="mx-auto mt-3 max-w-xl text-sm font-black leading-7 text-[#311912]">
          هذه اللعبة غير متاحة لهذه العلامة حاليًا
        </p>
        <Link
          href={productsHref}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[#4A281D] px-4 text-xs font-black text-white transition active:scale-95"
        >
          رجوع إلى العلامة
        </Link>
      </div>
    </main>
  );
}

export default async function PublicTableWarsPage({ params, searchParams }: Props) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  if (!isSupabaseConfigured()) {
    return (
      <main dir="rtl" className="min-h-screen bg-[#FCF8F3] px-4 py-8 text-[#311912]">
        <div className="mx-auto max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm font-black text-amber-800">
          قم بإعداد Supabase في .env.local
        </div>
      </main>
    );
  }

  let entry;
  try {
    entry = await getPublicTableWarsEntry(slug, resolvedSearchParams);
  } catch (error) {
    console.error("[PublicTableWarsPage]", error);
    entry = {
      cafeFound: false as const,
      cafeName: null,
      featureEnabled: false,
      gameEnabled: false,
      tableCode: null,
      table: null,
      currentRound: null,
      errorMessage: "تعذر تحميل حرب الطاولات.",
    };
  }

  const cafeName = entry.cafeName ?? "الفرع";
  const hasTableQuery = Boolean(entry.tableCode);
  const previewThemeId = Array.isArray(resolvedSearchParams.previewTheme)
    ? resolvedSearchParams.previewTheme[0]
    : resolvedSearchParams.previewTheme;
  const productsHref = getCafePath(slug, "products/popular", previewThemeId);
  let initialSnapshot: TableWarsV2Snapshot | null = null;

  if (!entry.cafeFound || !entry.featureEnabled || !entry.gameEnabled) {
    return <GameUnavailablePage slug={slug} previewThemeId={previewThemeId} />;
  }

  if (entry.cafeFound && entry.featureEnabled && entry.gameEnabled) {
    const customer = await getCustomerProfileForActiveSession(slug);
    if (!customer) {
      redirect(getCustomerLoginHref(slug, `/c/${slug}/play/table-wars`, previewThemeId));
    }
    initialSnapshot = await getTableWarsV2SnapshotAction(slug);
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#FCF8F3] px-4 py-6 text-[#311912] sm:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="rounded-lg border border-[#E7D7C6] bg-white p-6 shadow-[8px_8px_28px_rgba(49,25,18,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <StatusPill>Branda Play</StatusPill>
              <h1 className="mt-4 text-3xl font-black text-[#311912]">حرب الطاولات</h1>
              <p className="mt-2 text-sm font-bold text-[#6B3A25]">{cafeName}</p>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#4A281D]/10 text-[#4A281D]">
                <Swords className="h-7 w-7" />
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

        {!entry.cafeFound ? (
          <MessageBox message={entry.errorMessage ?? "هذه اللعبة غير متاحة لهذه العلامة حاليًا"} />
        ) : !entry.featureEnabled ? (
          <div className="rounded-lg border border-[#E7D7C6] bg-white p-5 text-center shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
            <LockKeyhole className="mx-auto h-9 w-9 text-[#6B3A25]" />
            <p className="mx-auto mt-3 max-w-xl text-sm font-black leading-7 text-[#311912]">
              {entry.errorMessage ?? "الميزة غير مفعلة لهذا الفرع."}
            </p>
          </div>
        ) : !entry.gameEnabled ? (
          <div className="rounded-lg border border-[#E7D7C6] bg-white p-5 text-center shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
            <LockKeyhole className="mx-auto h-9 w-9 text-[#6B3A25]" />
            <p className="mx-auto mt-3 max-w-xl text-sm font-black leading-7 text-[#311912]">
              {entry.errorMessage ?? "اللعبة غير متاحة حاليًا"}
            </p>
          </div>
        ) : hasTableQuery && !entry.table ? (
          <MessageBox message={entry.errorMessage ?? "رمز الطاولة غير صالح لهذا الفرع."} />
        ) : (
          initialSnapshot ? <TableWarsMultiplayerGame slug={slug} initialSnapshot={initialSnapshot} /> : null
        )}
      </div>
    </main>
  );
}
