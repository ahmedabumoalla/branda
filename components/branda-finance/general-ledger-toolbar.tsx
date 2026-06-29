"use client";

import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  Columns3,
  Download,
  Filter,
  GripVertical,
  MoveDown,
  MoveUp,
  Search,
} from "lucide-react";
import {
  generalLedgerDateRanges,
  generalLedgerExportOptions,
  generalLedgerFilters,
  getGeneralLedgerColumnsByState,
  type GeneralLedgerColumnId,
  type GeneralLedgerColumnState,
} from "@/lib/branda-finance/general-ledger";

type OpenMenu = "date" | "filter" | "columns" | "export" | null;

type GeneralLedgerToolbarProps = {
  columnState: GeneralLedgerColumnState[];
  onToggleColumn: (columnId: GeneralLedgerColumnId) => void;
  onMoveColumn: (columnId: GeneralLedgerColumnId, direction: "up" | "down") => void;
  onResetColumns: () => void;
};

const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#E3CFB0] bg-[#FFFDF8] px-4 py-2.5 text-sm font-black text-[#4C2D1E] shadow-[0_8px_20px_rgba(86,52,31,0.08)] transition hover:border-[#C99A4D] hover:bg-[#FFF9F0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B88334]";

function DropdownShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={`absolute right-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-[22px] border border-[#E3CFB0] bg-[#FFFDF8] p-3 text-right shadow-[0_24px_60px_rgba(86,52,31,0.18)] ${
        wide ? "w-[min(94vw,540px)]" : "w-[min(88vw,300px)]"
      }`}
    >
      {children}
    </div>
  );
}

export function GeneralLedgerToolbar({
  columnState,
  onToggleColumn,
  onMoveColumn,
  onResetColumns,
}: GeneralLedgerToolbarProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [selectedRange, setSelectedRange] = useState("كل الوقت");
  const orderedColumns = getGeneralLedgerColumnsByState(columnState);

  function toggleMenu(menu: OpenMenu) {
    setOpenMenu((current) => (current === menu ? null : menu));
  }

  return (
    <div className="rounded-[24px] border border-[#E3CFB0] bg-[#FBF4EA] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-11 min-w-[220px] flex-1 items-center gap-2 rounded-2xl border border-[#E3CFB0] bg-[#FFFDF8] px-4 py-2.5 text-[#4C2D1E] shadow-[0_8px_20px_rgba(86,52,31,0.08)] sm:flex-none">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-[#8A5B24]" />
          <input
            type="search"
            placeholder="البحث"
            className="h-7 min-w-0 flex-1 bg-transparent text-sm font-bold text-[#3B2417] outline-none placeholder:text-[#A89077]"
          />
        </label>

        <div className="relative">
          <button type="button" onClick={() => toggleMenu("date")} className={buttonClass}>
            {selectedRange}
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          </button>
          {openMenu === "date" ? (
            <DropdownShell wide>
              <div className="grid gap-1">
                {generalLedgerDateRanges.map((range) => (
                  <button
                    key={range.id}
                    type="button"
                    onClick={() => {
                      setSelectedRange(range.label);
                      setOpenMenu(null);
                    }}
                    className="rounded-2xl px-3 py-2.5 text-right text-sm font-bold text-[#4C2D1E] transition hover:bg-[#FBF5EC]"
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </DropdownShell>
          ) : null}
        </div>

        <div className="relative">
          <button type="button" onClick={() => toggleMenu("filter")} className={buttonClass}>
            <Filter aria-hidden="true" className="h-4 w-4" />
            أضف فلتر
          </button>
          {openMenu === "filter" ? (
            <DropdownShell wide>
              <label className="mb-3 flex items-center gap-2 rounded-2xl border border-[#E6D5BD] bg-[#FBF5EC] px-3 py-2">
                <Search aria-hidden="true" className="h-4 w-4 text-[#8A5B24]" />
                <input
                  type="search"
                  placeholder="ابحث عن فلتر"
                  className="h-8 min-w-0 flex-1 bg-transparent text-sm font-bold text-[#3B2417] outline-none placeholder:text-[#A89077]"
                />
              </label>
              <div className="grid gap-1 sm:grid-cols-2">
                {generalLedgerFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    className="rounded-2xl px-3 py-2.5 text-right text-sm font-bold text-[#4C2D1E] transition hover:bg-[#FBF5EC]"
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </DropdownShell>
          ) : null}
        </div>

        <div className="relative">
          <button type="button" onClick={() => toggleMenu("columns")} className={buttonClass}>
            <Columns3 aria-hidden="true" className="h-4 w-4" />
            تعديل الأعمدة
          </button>
          {openMenu === "columns" ? (
            <DropdownShell wide>
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-[#E6D5BD] pb-3">
                <h3 className="text-base font-black text-[#3B2417]">كل الأعمدة</h3>
                <button
                  type="button"
                  onClick={onResetColumns}
                  className="rounded-xl bg-[#F6E9D4] px-3 py-2 text-xs font-black text-[#6B3F22] transition hover:bg-[#E9D0A4]"
                >
                  إعادة الضبط
                </button>
              </div>

              <div className="rounded-2xl border border-dashed border-[#D8C3A4] bg-[#FFF9F0] p-3">
                <p className="text-xs font-black text-[#7A4D1F]">أعمدة مثبتة</p>
                <p className="mt-1 text-xs font-bold text-[#806851]">لا توجد أعمدة مثبتة</p>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-black text-[#7A4D1F]">أعمدة أخرى</p>
                <div className="grid gap-2">
                  {orderedColumns.map(({ column, state }, index) => {
                    const first = index === 0;
                    const last = index === orderedColumns.length - 1;
                    return (
                      <div
                        key={column.id}
                        className={`rounded-2xl border px-3 py-2.5 transition ${
                          state.visible
                            ? "border-[#E6D5BD] bg-white"
                            : "border-[#E6D5BD]/70 bg-[#FBF5EC] opacity-70"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <GripVertical aria-hidden="true" className="h-4 w-4 shrink-0 text-[#A89077]" />
                          <button
                            type="button"
                            onClick={() => onToggleColumn(column.id)}
                            className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                              state.visible ? "bg-[#B88334]" : "bg-[#E6D5BD]"
                            }`}
                            aria-label={state.visible ? "إخفاء" : "إظهار"}
                            title={state.visible ? "إخفاء" : "إظهار"}
                          >
                            <span
                              className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${
                                state.visible ? "right-6" : "right-1"
                              }`}
                            />
                          </button>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-black text-[#4C2D1E]">{column.label}</p>
                            <p className="mt-0.5 text-[11px] font-bold text-[#8F765F]">
                              {state.visible ? "إظهار" : "إخفاء"}
                            </p>
                          </div>

                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => onMoveColumn(column.id, "up")}
                              disabled={first}
                              aria-label="تحريك للأعلى"
                              title="تحريك للأعلى"
                              className="rounded-xl border border-[#E6D5BD] bg-[#FBF5EC] p-2 text-[#6B3F22] transition hover:bg-[#F6E9D4] disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              <MoveUp aria-hidden="true" className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onMoveColumn(column.id, "down")}
                              disabled={last}
                              aria-label="تحريك للأسفل"
                              title="تحريك للأسفل"
                              className="rounded-xl border border-[#E6D5BD] bg-[#FBF5EC] p-2 text-[#6B3F22] transition hover:bg-[#F6E9D4] disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              <MoveDown aria-hidden="true" className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="mt-4 rounded-2xl border border-[#E6D5BD] bg-[#FBF5EC] px-3 py-2 text-xs font-bold text-[#806851]">
                سيتم حفظ تفضيلات الأعمدة لكل علامة لاحقًا
              </p>
            </DropdownShell>
          ) : null}
        </div>

        <div className="relative">
          <button type="button" onClick={() => toggleMenu("export")} className={buttonClass}>
            <Download aria-hidden="true" className="h-4 w-4" />
            التصدير
          </button>
          {openMenu === "export" ? (
            <DropdownShell>
              <div className="grid gap-1">
                {generalLedgerExportOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="rounded-2xl px-3 py-2.5 text-right text-sm font-bold text-[#4C2D1E] transition hover:bg-[#FBF5EC]"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </DropdownShell>
          ) : null}
        </div>
      </div>
    </div>
  );
}
