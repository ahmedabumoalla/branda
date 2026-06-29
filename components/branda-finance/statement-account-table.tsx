import {
  getStatementAccountColumnsByState,
  statementAccountRows,
  type StatementAccountAmount,
  type StatementAccountColumn,
  type StatementAccountColumnState,
  type StatementAccountRow,
  type StatementAccountView,
} from "@/lib/branda-finance/statement-account";

type StatementAccountTableProps = {
  columnState: StatementAccountColumnState[];
  view: StatementAccountView;
};

function isAmount(value: StatementAccountRow[StatementAccountColumn["valueKey"]]): value is StatementAccountAmount {
  return typeof value === "number";
}

function formatAmount(value: StatementAccountAmount) {
  if (!value) return "-";
  return new Intl.NumberFormat("ar-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCellValue(value: StatementAccountRow[StatementAccountColumn["valueKey"]]) {
  return isAmount(value) ? formatAmount(value) : value;
}

function columnWidth(column: StatementAccountColumn) {
  if (column.id === "account" || column.id === "relatedAccount") return "min-w-[220px]";
  if (column.id === "reference" || column.id === "costCenter" || column.id === "project") return "min-w-[170px]";
  if (column.align === "end") return "min-w-[150px]";
  return "min-w-[130px]";
}

function alignClass(column: StatementAccountColumn) {
  if (column.align === "end") return "text-left font-mono tabular-nums";
  if (column.align === "center") return "text-center";
  return "text-right";
}

function bodyCellClass(column: StatementAccountColumn) {
  return [
    "whitespace-nowrap border-l border-[#F1E3CE] px-4 py-3 text-sm font-bold text-[#3B2417]",
    columnWidth(column),
    alignClass(column),
    column.align === "start" ? "font-sans" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function StatementAccountTable({ columnState, view }: StatementAccountTableProps) {
  const visibleColumns = getStatementAccountColumnsByState(columnState)
    .filter(({ state }) => state.visible)
    .map(({ column }) => column);
  const minWidth = Math.max(860, visibleColumns.length * 150);
  const viewLabel = view === "details" ? "تفاصيل" : "ملخص";

  return (
    <section className="overflow-hidden rounded-[26px] border border-[#E3CFB0] bg-[#FFFDF8] shadow-[0_18px_42px_rgba(86,52,31,0.10)]">
      <div className="flex flex-col gap-2 border-b border-[#E6D5BD] bg-[#FBF5EC] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-[#3B2417]">جدول كشف الحساب</h2>
          <p className="mt-1 text-sm font-bold text-[#806851]">
            عرض {viewLabel} للحركات والأرصدة حسب الأعمدة المختارة
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
              {statementAccountRows.length ? (
                statementAccountRows.map((row, rowIndex) => (
                  <tr
                    key={`${row.serialNumber}-${row.date}`}
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
                  <td colSpan={visibleColumns.length} className="bg-[#FFFDF8] px-6 py-16 text-center">
                    <div className="mx-auto max-w-sm">
                      <p className="text-lg font-black text-[#3B2417]">لا يوجد أي نتيجة</p>
                      <p className="mt-2 text-sm font-bold leading-7 text-[#806851]">
                        غيّر التصفيات أو امسحها لعرض حركة الحساب المطلوبة.
                      </p>
                      <button
                        type="button"
                        className="mt-5 rounded-2xl border border-[#D8B46E] bg-[#F7E7C8] px-5 py-2.5 text-sm font-black text-[#6B3F22] transition hover:bg-[#E9D0A4]"
                      >
                        مسح التصفيات
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
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
