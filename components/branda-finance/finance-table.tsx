import type { ReactNode } from "react";

type FinanceTableProps = {
  headers: string[];
  rows: ReactNode[][];
  minWidth?: string;
};

export function FinanceTable({ headers, rows, minWidth = "760px" }: FinanceTableProps) {
  return (
    <div className="w-full max-w-full min-w-0 overflow-hidden rounded-[8px] border border-[#E1D1BD] bg-white">
      <div className="max-w-full overflow-x-auto">
        <table className="w-full table-fixed text-right text-[12px]" style={{ minWidth }}>
          <thead className="bg-[#F4E8D8] text-[11px] font-black text-[#674C38]">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-2.5 py-2.5">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFE3D2]">
            {rows.map((row, index) => (
              <tr key={index} className="align-top hover:bg-[#FFF8EA]">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-2.5 py-2.5 font-bold text-[#4A3528]">
                    <div className="min-w-0 truncate">{cell}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
