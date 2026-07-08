export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { Castle, LockKeyhole, QrCode, Shield, Sparkles, Swords } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getPublicTableWarsEntry } from "@/lib/data/table-wars";

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
    <div className="rounded-2xl border border-[#E7D7C6] bg-white p-5 text-center shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
      <QrCode className="mx-auto h-9 w-9 text-[#6B3A25]" />
      <p className="mx-auto mt-3 max-w-xl text-sm font-black leading-7 text-[#311912]">{message}</p>
    </div>
  );
}

export default async function PublicTableWarsPage({ params, searchParams }: Props) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  if (!isSupabaseConfigured()) {
    return (
      <main dir="rtl" className="min-h-screen bg-[#FCF8F3] px-4 py-8 text-[#311912]">
        <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-black text-amber-800">
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
      enabled: false,
      tableCode: null,
      table: null,
      currentRound: null,
      errorMessage: "تعذر تحميل حرب الطاولات.",
    };
  }

  const cafeName = entry.cafeName ?? "الفرع";
  const hasTableQuery = Boolean(entry.tableCode);
  const gameStatus = entry.currentRound?.statusLabel ?? "بانتظار التجهيز";

  return (
    <main dir="rtl" className="min-h-screen bg-[#FCF8F3] px-4 py-6 text-[#311912] sm:py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <header className="rounded-3xl border border-[#E7D7C6] bg-white p-6 shadow-[8px_8px_28px_rgba(49,25,18,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <StatusPill>Branda Play</StatusPill>
              <h1 className="mt-4 text-3xl font-black text-[#311912]">حرب الطاولات</h1>
              <p className="mt-2 text-sm font-bold text-[#6B3A25]">{cafeName}</p>
            </div>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4A281D]/10 text-[#4A281D]">
              <Swords className="h-7 w-7" />
            </span>
          </div>
          <p className="mt-5 max-w-2xl text-sm font-bold leading-8 text-[#806A5E]">
            كل طاولة تمثل قلعة داخل الفرع. اجمع فريق الطاولة، راقب حالة الجولة، واستعد للهجوم عند فتح اللعب في المرحلة القادمة.
          </p>
        </header>

        {!entry.cafeFound ? (
          <MessageBox message={entry.errorMessage} />
        ) : !entry.enabled ? (
          <div className="rounded-2xl border border-[#E7D7C6] bg-white p-5 text-center shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
            <LockKeyhole className="mx-auto h-9 w-9 text-[#6B3A25]" />
            <p className="mx-auto mt-3 max-w-xl text-sm font-black leading-7 text-[#311912]">
              {entry.errorMessage ?? "حرب الطاولات غير مفعّلة حاليًا."}
            </p>
          </div>
        ) : !hasTableQuery ? (
          <MessageBox message="امسح QR الطاولة للدخول إلى حرب الطاولات" />
        ) : entry.table ? (
          <section className="grid gap-3 md:grid-cols-3">
            <article className="rounded-2xl border border-[#E7D7C6] bg-white p-5 shadow-[8px_8px_24px_rgba(49,25,18,0.05)] md:col-span-2">
              <Castle className="h-8 w-8 text-[#6B3A25]" />
              <p className="mt-4 text-xs font-black text-[#806A5E]">طاولتك</p>
              <h2 className="mt-1 text-2xl font-black text-[#311912]">{entry.table.label}</h2>
              <p className="mt-3 text-sm font-bold leading-7 text-[#806A5E]">
                تم التحقق من أن رمز الطاولة تابع لهذا الفرع.
              </p>
            </article>
            <article className="rounded-2xl border border-[#D9A33F]/35 bg-[#FFF7E3] p-5 text-[#4A281D]">
              <Shield className="h-8 w-8" />
              <p className="mt-4 text-xs font-black text-[#6B3A25]">حالة اللعبة</p>
              <h2 className="mt-1 text-xl font-black">{gameStatus}</h2>
              <p className="mt-3 text-sm font-bold leading-7 text-[#6B3A25]">
                الدخول للعب سيُفتح قريبًا.
              </p>
            </article>
          </section>
        ) : (
          <MessageBox message={entry.errorMessage ?? "رمز الطاولة غير صالح لهذا الفرع."} />
        )}

        <section className="rounded-2xl border border-[#E7D7C6] bg-white p-5 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black text-[#311912]">نسخة تجريبية آمنة</h2>
              <p className="mt-1 text-sm font-bold leading-7 text-[#806A5E]">
                لا توجد نقاط ولاء أو مكافآت فعلية في هذه المرحلة، واللعبة لا تستخدم الموقع الجغرافي أو الدفع.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled
            className="mt-5 h-12 w-full cursor-not-allowed rounded-xl bg-[#311912]/10 px-4 text-sm font-black text-[#6B3A25] opacity-80"
          >
            الدخول إلى الجولة — قريبًا
          </button>
        </section>
      </div>
    </main>
  );
}
