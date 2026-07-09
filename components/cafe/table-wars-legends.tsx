import { Crown } from "lucide-react";
import type { TableWarsV2LegendPreview } from "@/lib/table-wars/v2-types";

type Props = {
  legends: TableWarsV2LegendPreview[];
};

function teamLabel(team: TableWarsV2LegendPreview["team"]) {
  return team === "blue" ? "الأزرق" : "الأحمر";
}

function teamClass(team: TableWarsV2LegendPreview["team"]) {
  return team === "blue"
    ? "border-sky-200 bg-sky-50 text-sky-800"
    : "border-rose-200 bg-rose-50 text-rose-800";
}

export function TableWarsLegends({ legends }: Props) {
  return (
    <section className="rounded-lg border border-[#E7D7C6] bg-white p-5 shadow-[8px_8px_24px_rgba(49,25,18,0.05)]">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF7E3] text-[#6B3A25]">
          <Crown className="h-5 w-5" />
        </span>
        <h2 className="text-base font-black text-[#311912]">أساطير الحرب اليوم</h2>
      </div>

      {legends.length === 0 ? (
        <p className="mt-4 rounded-lg border border-[#F2E7D9] bg-[#FCF8F3] p-4 text-sm font-bold text-[#806A5E]">
          لم يتوج أحد بعد اليوم.
        </p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {legends.map((legend, index) => (
            <article
              key={`${legend.customerId}-${legend.team}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-[#F2E7D9] bg-[#FCF8F3] p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[#311912]">
                  {index === 0 ? "المتصدر: " : ""}
                  {legend.displayName}
                </p>
                <p className="mt-1 text-xs font-bold text-[#806A5E]">{legend.wins} انتصار</p>
              </div>
              <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${teamClass(legend.team)}`}>
                {teamLabel(legend.team)}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
