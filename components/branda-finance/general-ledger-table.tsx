import { Landmark, ReceiptText, ScrollText, WalletCards } from "lucide-react";
import {
  generalLedgerEmptyActions,
  generalLedgerRows,
  getGeneralLedgerColumnsByState,
  type GeneralLedgerAmount,
  type GeneralLedgerColumn,
  type GeneralLedgerColumnState,
  type GeneralLedgerRow,
} from "@/lib/branda-finance/general-ledger";

type GeneralLedgerTableProps = {
  columnState: GeneralLedgerColumnState[];
};

const actionIcons = [ReceiptText, ScrollText, WalletCards, Landmark];

function isAmount(value: GeneralLedgerRow[GeneralLedgerColumn["valueKey"]]): value is GeneralLedgerAmount {
  return typeof value === "number";
}

function formatAmount(value: GeneralLedgerAmount) {
  if (!value) return "-";
  return new Intl.NumberFormat("ar-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCellValue(value: GeneralLedgerRow[GeneralLedgerColumn["valueKey"]]) {
  return isAmount(value) ? formatAmount(value) : value;
}

function columnWidth(column: GeneralLedgerColumn) {
  if (column.id === "journalDocumentId" || column.id === "relatedAccounts") return "min-w-[230px]";
  if (column.id === "description" || column.id === "entryNotes") return "min-w-[260px]";
  if (column.id === "account" || column.id === "costCenter" || column.id === "project") return "min-w-[180px]";
  if (column.align === "end") return "min-w-[150px]";
  return "min-w-[135px]";
}

function alignClass(column: GeneralLedgerColumn) {
  if (column.align === "end") return "text-left font-mono tabular-nums";
  if (column.align === "center") return "text-center";
  return "text-right";
}

function bodyCellClass(column: GeneralLedgerColumn) {
  return [
    "whitespace-nowrap border-l border-[#F1E3CE] px-4 py-3 text-sm font-bold text-[#3B2417]",
    columnWidth(column),
    alignClass(column),
    column.align === "start" ? "font-sans" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function GeneralLedgerTable({ columnState }: GeneralLedgerTableProps) {
  const visibleColumns = getGeneralLedgerColumnsByState(columnState)
    .filter(({ state }) => state.visible)
    .map(({ column }) => column);
  const minWidth = Math.max(980, visibleColumns.length * 150);

  return (
    <section className="overflow-hidden rounded-[26px] border border-[#E3CFB0] bg-[#FFFDF8] shadow-[0_18px_42px_rgba(86,52,31,0.10)]">
      <div className="flex flex-col gap-2 border-b border-[#E6D5BD] bg-[#FBF5EC] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-[#3B2417]">جدول دفتر الأستاذ العام</h2>
          <p className="mt-1 text-sm font-bold text-[#806851]">
            الحركات المحاسبية مرتبة حسب الأعمدة الظاهرة والفلترة الحالية
          </p>
        </div>
        <span className="w-fit rounded-full border border-[#E2C690] bg-[#F7E7C8] px-3 py-1.5 text-xs font-extrabold text-[#7A4D1F]">
          {visibleColumns.length} أعمدة ظاهرة
        </span>
      </div>

      <div className="overflow-x-auto">
        {visibleColumns.length ? (
          <table className="w-full border-collapse text-right" style={{ minWidth }}>
            <thead>
              <tr className="border-b border-[#E6D5BD] bg-[#F6E9D4] text-xs font-black text-[#6B3F22]">
                {visibleColumns.map((column, index) => (
                  <th
                    key={column.id}
                    className={`${columnWidth(column)} px-4 py-4 ${alignClass(column)} ${
                      index === visibleColumns.length - 1 ? "" : "border-l border-[#E1C9A6]"
                    }`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {generalLedgerRows.length ? (
                generalLedgerRows.map((row, rowIndex) => (
                  <tr
                    key={`${row.journalDocumentId}-${row.date}`}
                    className={`border-b border-[#EFE2CF] ${rowIndex % 2 === 0 ? "bg-[#FFFDF8]" : "bg-[#FFFAF2]"}`}
                  >
                    {visibleColumns.map((column, columnIndex) => (
                      <td
                        key={column.id}
                        className={`${bodyCellClass(column)} ${
                          columnIndex === visibleColumns.length - 1 ? "border-l-0" : ""
                        }`}
                      >
                        {formatCellValue(row[column.valueKey])}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={visibleColumns.length} className="bg-[#FFFDF8] px-5 py-12 text-center">
                    <div className="mx-auto max-w-5xl">
                      <p className="text-xl font-black text-[#3B2417]">
                        سجل معاملة لعرض هذا التقرير
                      </p>
                      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {generalLedgerEmptyActions.map((action, index) => {
                          const Icon = actionIcons[index] ?? ReceiptText;
                          return (
                            <button
                              key={action.id}
                              type="button"
                              className="min-h-[150px] rounded-[20px] border border-[#E6D5BD] bg-[#FBF5EC] p-4 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition hover:border-[#C99A4D] hover:bg-[#FFF9F0]"
                            >
                              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F6E9D4] text-[#6B3F22]">
                                <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
                              </span>
                              <span className="mt-4 block text-sm font-black leading-6 text-[#3B2417]">
                                {action.title}
                              </span>
                              <span className="mt-2 block text-xs font-bold leading-6 text-[#806851]">
                                {action.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <div className="flex min-h-[260px] items-center justify-center px-6 py-12 text-center">
            <div>
              <p className="text-lg font-black text-[#3B2417]">لا توجد أعمدة ظاهرة</p>
              <p className="mt-2 text-sm font-bold text-[#806851]">
                أعد إظهار عمود واحد على الأقل من قائمة تعديل الأعمدة.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
