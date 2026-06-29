import {
  getTrialBalanceColumnsByState,
  getTrialBalanceTotals,
  trialBalanceRows,
  type TrialBalanceAmount,
  type TrialBalanceColumn,
  type TrialBalanceColumnState,
  type TrialBalanceRow,
} from "@/lib/branda-finance/trial-balance";

type TrialBalanceTableProps = {
  columnState: TrialBalanceColumnState[];
};

function isAmount(value: TrialBalanceRow[TrialBalanceColumn["valueKey"]]): value is TrialBalanceAmount {
  return typeof value === "number";
}

function formatAmount(value: TrialBalanceAmount) {
  if (!value) return "-";
  return new Intl.NumberFormat("ar-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCellValue(value: TrialBalanceRow[TrialBalanceColumn["valueKey"]]) {
  return isAmount(value) ? formatAmount(value) : value;
}

function columnWidth(column: TrialBalanceColumn) {
  if (column.id === "accountName") return "min-w-[230px]";
  if (column.id === "mainCategory" || column.id === "subCategory") return "min-w-[170px]";
  if (column.align === "end") return "min-w-[150px]";
  return "min-w-[120px]";
}

function alignClass(column: TrialBalanceColumn) {
  if (column.align === "end") return "text-left font-mono tabular-nums";
  if (column.align === "center") return "text-center";
  return "text-right";
}

function bodyCellClass(column: TrialBalanceColumn) {
  return [
    "whitespace-nowrap border-l border-[#F1E3CE] px-4 py-3 text-sm font-bold text-[#3B2417]",
    columnWidth(column),
    alignClass(column),
    column.align === "start" ? "font-sans" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function footerValue(totals: TrialBalanceRow, column: TrialBalanceColumn) {
  if (column.id === "accountName") return totals.accountName;
  const value = totals[column.valueKey];
  return isAmount(value) ? formatAmount(value) : "";
}

export function TrialBalanceTable({ columnState }: TrialBalanceTableProps) {
  const visibleColumns = getTrialBalanceColumnsByState(columnState)
    .filter(({ state }) => state.visible)
    .map(({ column }) => column);
  const totals = getTrialBalanceTotals();
  const minWidth = Math.max(720, visibleColumns.length * 150);

  return (
    <section className="overflow-hidden rounded-[26px] border border-[#E3CFB0] bg-[#FFFDF8] shadow-[0_18px_42px_rgba(86,52,31,0.10)]">
      <div className="flex flex-col gap-2 border-b border-[#E6D5BD] bg-[#FBF5EC] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-[#3B2417]">جدول ميزان المراجعة</h2>
          <p className="mt-1 text-sm font-bold text-[#806851]">الأرصدة والحركات بالريال السعودي SAR</p>
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
              {trialBalanceRows.map((row, rowIndex) => (
                <tr
                  key={row.accountNumber}
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
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#3B2417] text-white">
                {visibleColumns.map((column, index) => (
                  <td
                    key={column.id}
                    className={`${columnWidth(column)} px-4 py-4 text-sm font-black ${
                      index === visibleColumns.length - 1 ? "" : "border-l border-white/10"
                    } ${alignClass(column)}`}
                  >
                    {footerValue(totals, column)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        ) : (
          <div className="flex min-h-[220px] items-center justify-center px-6 py-12 text-center">
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
