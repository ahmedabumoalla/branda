export type FinanceControlReport = {
  generatedAt: string; debit: number; credit: number; inventoryLedger: number; inventoryStock: number;
  revenue: number; cost: number; otherExpenses: number; bookProfit: number; vatInput: number; vatOutput: number;
  costLines: number; unknownCostLines: number; estimatedCostLines: number; legacyCostLines: number; closedThrough: string | null;
};
export type JournalExportRow = { id: string; created_at: string; document_id: string; document_number: number; account_code: string; account_name: string; memo: string; debit: number; credit: number };
export type JournalExportPage = { asOf: string; total: number; debit: number; credit: number; rows: JournalExportRow[]; next: { time: string; id: string } | null };
export type JournalExportFilter = { from: string; to: string; query: string; asOf?: string; afterTime?: string; afterId?: string };
export function controlReportDifferences(report: FinanceControlReport) {
  return { trial: Math.round((report.debit-report.credit)*100)/100, inventory: Math.round((report.inventoryLedger-report.inventoryStock)*100)/100, costComplete: report.unknownCostLines===0 && report.estimatedCostLines===0 && report.legacyCostLines===0 };
}
/** Never download a partial ledger or silently skip a concurrent change. */
export async function collectJournalExport(filter: JournalExportFilter, fetchPage: (filter: JournalExportFilter) => Promise<JournalExportPage>, onProgress: (count: number, total: number) => void = () => {}) {
  let next: JournalExportFilter = { ...filter }, expected: JournalExportPage | undefined;
  const rows: JournalExportRow[] = [], ids = new Set<string>();
  let debitCents = 0, creditCents = 0;
  const cents = (value: number) => {
    const amount = Math.round(value * 100);
    if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(amount)) throw new Error("تعذر التحقق من مبالغ التصدير أعد المحاولة");
    return amount;
  };
  while (true) {
    const page = await fetchPage(next);
    expected ??= page;
    if (!Number.isSafeInteger(page.total) || page.total < 0 || !Number.isFinite(Date.parse(page.asOf)) || !Array.isArray(page.rows) || page.rows.length > 500) throw new Error("بيانات التصدير غير صالحة أعد المحاولة");
    if (page.total > 50000) throw new Error("الفترة تحتوي أكثر من ٥٠ ألف سطر اختر فترة أقصر لتصديرها كاملة");
    if (page.asOf !== expected.asOf || page.total !== expected.total || page.debit !== expected.debit || page.credit !== expected.credit) throw new Error("تغيرت القيود أثناء التصدير أعد المحاولة للحصول على تقرير كامل");
    const expectedDebit = cents(expected.debit), expectedCredit = cents(expected.credit);
    for (const row of page.rows) {
      if (!row.id || ids.has(row.id)) throw new Error("تعذر ضمان اكتمال التصدير أعد المحاولة");
      ids.add(row.id); rows.push(row);
      debitCents += cents(row.debit); creditCents += cents(row.credit);
      if (!Number.isSafeInteger(debitCents) || !Number.isSafeInteger(creditCents)) throw new Error("اختر فترة أقصر للتحقق من مبالغ التصدير بدقة");
    }
    onProgress(rows.length,expected.total);
    if (rows.length===expected.total) {
      if (debitCents !== expectedDebit || creditCents !== expectedCredit) throw new Error("مبالغ الصفوف لا تطابق إجمالي التصدير أعد المحاولة");
      return { ...expected,rows };
    }
    if (!page.rows.length || !page.next || rows.length>expected.total) throw new Error("التصدير غير مكتمل أعد المحاولة");
    const last = page.rows[page.rows.length - 1];
    if (page.next.id !== last.id || page.next.time !== last.created_at || (page.next.id === next.afterId && page.next.time === next.afterTime)) throw new Error("تعذر متابعة صفحات التصدير أعد المحاولة");
    next={...filter,asOf:expected.asOf,afterTime:page.next.time,afterId:page.next.id};
  }
}
