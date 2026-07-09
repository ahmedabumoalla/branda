export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Castle, LockKeyhole, QrCode, Shield, Swords } from "lucide-react";
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

function roundStatusLabel(snapshot: TableWarsV2Snapshot | null, fallback: string) {
  const status = snapshot?.round?.status;
  if (status === "active") return "نشطة";
  if (status === "waiting") return "بانتظار اللاعبين";
  if (status === "finished") return "منتهية";
  if (status === "cancelled") return "ملغاة";
  return fallback;
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
          <MessageBox message={entry.errorMessage} />
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
          <>
            <section className="grid gap-3 md:grid-cols-3">
              <article className="rounded-lg border border-[#E7D7C6] bg-white p-5 shadow-[8px_8px_24px_rgba(49,25,18,0.05)] md:col-span-2">
                <Castle className="h-8 w-8 text-[#6B3A25]" />
                <p className="mt-4 text-xs font-black text-[#806A5E]">
                  {entry.table ? "طاولتك" : "دخول عام"}
                </p>
                <h2 className="mt-1 text-2xl font-black text-[#311912]">
                  {entry.table?.label ?? "جولة متعددة اللاعبين"}
                </h2>
                <p className="mt-3 text-sm font-bold leading-7 text-[#806A5E]">
                  انضم إلى فريق، راقب الخريطة، وسيطر على الطاولات من خلال محرك الجولة على الخادم.
                </p>
              </article>
              <article className="rounded-lg border border-[#D9A33F]/35 bg-[#FFF7E3] p-5 text-[#4A281D]">
                <Shield className="h-8 w-8" />
                <p className="mt-4 text-xs font-black text-[#6B3A25]">حالة الجولة</p>
                <h2 className="mt-1 text-xl font-black">
                  {roundStatusLabel(initialSnapshot, entry.currentRound?.statusLabel ?? "بانتظار التجهيز")}
                </h2>
                <p className="mt-3 text-sm font-bold leading-7 text-[#6B3A25]">
                  الواجهة تعرض بيانات الجولة الحالية من نظام Multiplayer v2.
                </p>
              </article>
            </section>

            {initialSnapshot ? <TableWarsMultiplayerGame slug={slug} initialSnapshot={initialSnapshot} /> : null}
          </>
        )}
      </div>
    </main>
  );
}
