import Link from "next/link";
import {
  Castle,
  Clock3,
  LockKeyhole,
  QrCode,
  Shield,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react";
import type { TableWarsDashboardData, TableWarsRoundSummary } from "@/lib/data/table-wars";

type Props = {
  data: TableWarsDashboardData | null;
  configError?: string;
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#D8C4B3] bg-[#FCF8F3] p-4 text-sm font-bold leading-7 text-[#806A5E]">
      {message}
    </div>
  );
}

function LockedTableWarsPage() {
  return (
    <div dir="rtl" className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-4 sm:px-4 lg:px-5">
      <div className="rounded-3xl border border-[#E7D7C6] bg-white p-6 text-center shadow-[8px_8px_28px_rgba(49,25,18,0.06)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4A281D]/10 text-[#4A281D]">
          <LockKeyhole className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl font-black text-[#311912]">
          حرب الطاولات غير مفعّلة في باقتك الحالية
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-7 text-[#806A5E]">
          فعّل الميزة من الباقة أو من إعدادات الأدمن لتظهر أدوات اللعبة داخل لوحة التحكم.
        </p>
      </div>
    </div>
  );
}

function RoundList({ rounds }: { rounds: TableWarsRoundSummary[] }) {
  if (!rounds.length) {
    return <EmptyState message="لا توجد جولات مسجلة بعد." />;
  }

  return (
    <div className="space-y-2">
      {rounds.map((round) => (
        <div key={round.id} className="rounded-xl bg-[#FCF8F3] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-[#311912]">{round.statusLabel}</p>
              <p className="mt-1 text-xs font-bold text-[#806A5E]">
                مدة الجولة {round.durationSeconds} ثانية
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-black text-[#6B3A25]">
              {round.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableWarsPage({ data, configError }: Props) {
  if (!data) {
    return (
      <div dir="rtl" className="mx-auto min-h-screen w-full max-w-[1180px] px-3 py-4 sm:px-4 lg:px-5">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-black text-amber-800">
          {configError ?? "تعذر تحميل حرب الطاولات"}
        </div>
      </div>
    );
  }

  if (!data.enabled) return <LockedTableWarsPage />;

  return (
    <div dir="rtl" className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:px-5">
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-black text-[#6B3A25]">Branda Play</p>
          <h1 className="mt-1.5 text-2xl font-black text-[#311912] lg:text-3xl">حرب الطاولات</h1>
          <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-[#806A5E]">
            لعبة جماعية داخل الفرع تحول كل طاولة إلى قلعة وتزيد تفاعل العملاء أثناء الانتظار.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D9A33F]/35 bg-[#FFF7E3] px-4 py-2 text-xs font-black text-[#6B3A25]">
          <Sparkles className="h-4 w-4" />
          تجريبية
        </div>
      </header>

      <section className="mb-5 rounded-2xl border border-[#E7D7C6] bg-white p-5 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4A281D]/10 text-[#4A281D]">
              <Swords className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-xl font-black text-[#311912]">كل طاولة قلعة داخل الجولة</h2>
            <p className="mt-2 text-sm font-bold leading-7 text-[#806A5E]">
              v1 للعرض والتجهيز فقط: لا نقاط ولاء، لا مكافآت فعلية، ولا تشغيل realtime معقد في هذه المرحلة.
            </p>
          </div>
          <button
            type="button"
            disabled
            className="h-12 w-full cursor-not-allowed rounded-xl bg-[#311912]/10 px-4 text-sm font-black text-[#6B3A25] opacity-80 lg:w-auto"
          >
            بدء جولة — قريبًا
          </button>
        </div>
      </section>

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
          <Castle className="h-6 w-6 text-[#6B3A25]" />
          <p className="mt-4 text-xs font-black text-[#806A5E]">عدد الطاولات</p>
          <p className="mt-1.5 text-3xl font-black text-[#311912]">{data.tableCount}</p>
        </article>
        <article className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
          <Clock3 className="h-6 w-6 text-[#6B3A25]" />
          <p className="mt-4 text-xs font-black text-[#806A5E]">الجولات الحالية</p>
          <p className="mt-1.5 text-3xl font-black text-[#311912]">{data.activeRoundCount}</p>
        </article>
        <article className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
          <Shield className="h-6 w-6 text-[#6B3A25]" />
          <p className="mt-4 text-xs font-black text-[#806A5E]">الحالة</p>
          <p className="mt-1.5 text-xl font-black text-[#311912]">تجريبية</p>
        </article>
        <article className="rounded-2xl border border-[#D9A33F]/35 bg-[#FFF7E3] p-4 text-[#4A281D]">
          <Trophy className="h-6 w-6" />
          <p className="mt-4 text-xs font-black text-[#6B3A25]">تنبيه</p>
          <p className="mt-1.5 text-sm font-black leading-7">
            النقاط والمكافآت ستفعّل في مرحلة لاحقة.
          </p>
        </article>
      </section>

      <section className="mb-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <article className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
          <h2 className="text-base font-black text-[#311912]">الجولات الحالية</h2>
          <div className="mt-4">
            <RoundList rounds={data.currentRounds} />
          </div>
        </article>
        <article className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
          <h2 className="text-base font-black text-[#311912]">آخر الجولات</h2>
          <div className="mt-4">
            <RoundList rounds={data.recentRounds} />
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-[#E7D7C6] bg-white p-4 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCF8F3] text-[#6B3A25]">
            <QrCode className="h-5 w-5" />
          </span>
          <h2 className="text-base font-black text-[#311912]">روابط QR مبدئية للطاولات</h2>
        </div>

        {data.tableLinks.length ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.tableLinks.map((table) => (
              <Link
                key={table.id}
                href={table.publicPath}
                target="_blank"
                className="block min-w-0 rounded-xl border border-[#F2E7D9] bg-[#FCF8F3] p-3 transition hover:border-[#D9A33F]/50 hover:bg-[#FFF7E3]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#311912]">{table.label}</p>
                    <p className="mt-1 truncate text-xs font-bold text-[#806A5E]">{table.publicPath}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#6B3A25]">
                    {table.isActive ? "نشطة" : "متوقفة"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState message="لم تُضف طاولات حرب الطاولات بعد. ستظهر روابط QR هنا بعد إنشاء الطاولات." />
        )}
      </section>

      {data.missingSources.length ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold leading-6 text-amber-800">
          بعض جداول حرب الطاولات غير متاحة في قاعدة البيانات الحالية، لذلك قد تظهر المؤشرات فارغة حتى تطبيق migration.
        </div>
      ) : null}
    </div>
  );
}
