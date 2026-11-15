import type { PurchaseSnapshot } from './purchases';
import { displayRecordNumber } from './settings-numbering';

/** Initial cash settlement is already posted with its invoice, never insert it twice. */
export function supplierPayments(snapshot: PurchaseSnapshot) {
  return [
    ...snapshot.invoices.filter(row => row.kind === 'purchase' && row.party_id && row.paid > 0).map(row => ({
      id: `invoice:${row.id}`, documentId: row.id, number: displayRecordNumber(row), supplierId: row.party_id!,
      date: row.created_at, amount: row.paid, accountId: row.account_id, initial: true,
      invoiceId: row.id, note: 'سداد عند إصدار فاتورة الشراء', href: `/dashboard/system/purchases/invoices/${row.id}`,
    })),
    ...snapshot.payments.filter(row => row.total > 0 && row.party_id && row.account_id).map(row => ({
      id: row.id, documentId: row.id, number: displayRecordNumber(row), supplierId: row.party_id!,
      date: row.created_at, amount: row.total, accountId: row.account_id, initial: false,
      invoiceId: row.reference_id, note: row.note, href: `/dashboard/system/purchases/payments/${row.id}`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
export function supplierAccountBalance(snapshot: PurchaseSnapshot, id: string) {
  // The complete purchase statement, unlike the limited general finance snapshot.
  return Math.round(snapshot.statements.filter(row => row.supplierId === id)
    .reduce((sum, row) => sum + row.credit - row.debit, 0) * 100) / 100;
}
