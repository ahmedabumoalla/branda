export type PartyStatementRow = {
  id: string; number: number; kind: string; date: string; day: string;
  referenceId: string | null; memo: string; amount: number; initialPaid: number;
  debit: number; credit: number; paidToDate: number; outstanding: number;
  refunded: number; hasJournal: boolean;
};
export type PartyStatement = {
  party: { id: string; name: string; kind: 'supplier' | 'customer' };
  branch: { name?: string; branchId?: string | null }; rows: PartyStatementRow[]; generatedAt: string;
};
export const statementKinds: Record<string, string> = {
  sale: 'فاتورة مبيعات', purchase: 'فاتورة مشتريات', refund: 'مرتجع', settlement: 'دفعة',
  opening: 'رصيد افتتاحي', journal: 'قيد محاسبي', treasury: 'حركة خزينة',
  receipt: 'سند قبض', expense: 'سند صرف', transfer: 'تحويل',
};
export const statementMoney = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function selectStatement(data: PartyStatement, from = '', to = '') {
  const direction = data.party.kind === 'supplier' ? -1 : 1;
  const delta = (row: PartyStatementRow) => direction * (row.debit - row.credit);
  const opening = round(data.rows.filter(row => from && row.day < from).reduce((sum, row) => sum + delta(row), 0));
  let balance = opening;
  const rows = data.rows.filter(row => (!from || row.day >= from) && (!to || row.day <= to)).map(row => {
    balance = round(balance + delta(row));
    return { ...row, balance };
  });
  const invoices = rows.filter(row => row.kind === (data.party.kind === 'supplier' ? 'purchase' : 'sale'));
  return { rows, opening, balance,
    debit: round(rows.reduce((sum, row) => sum + row.debit, 0)), credit: round(rows.reduce((sum, row) => sum + row.credit, 0)),
    invoiced: round(invoices.reduce((sum, row) => sum + row.amount, 0)),
    paid: round(invoices.reduce((sum, row) => sum + row.paidToDate, 0)),
    outstanding: round(invoices.reduce((sum, row) => sum + row.outstanding, 0)),
    refunded: round(invoices.reduce((sum, row) => sum + row.refunded, 0)),
  };
}
export const statementHead = ['التاريخ', 'المستند / القيد', 'البيان', 'قيمة المستند', 'المدفوع من الفاتورة', 'المتبقي الآجل', 'مدين', 'دائن', 'الرصيد'];
export function statementTable(rows: ReturnType<typeof selectStatement>['rows']) {
  return rows.map(row => [row.day, `${statementKinds[row.kind] || 'مستند'} #${row.number}`, row.memo,
    statementMoney(row.amount), ...(['sale', 'purchase'].includes(row.kind) ? [statementMoney(row.paidToDate), statementMoney(row.outstanding)] : ['—', '—']),
    statementMoney(row.debit), statementMoney(row.credit), statementMoney(row.balance)]);
}
