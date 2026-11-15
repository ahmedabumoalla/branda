'use client';
import type { PurchaseSnapshot, SupplierInput } from '@/lib/erp/purchases';
import type { DocumentTemplate } from '@/lib/erp/templates';
import { PartyAccountStatement } from '@/components/finance/party-account-statement';
export function SupplierStatement({ snapshot, supplier }: { snapshot: PurchaseSnapshot; supplier: SupplierInput; template?: DocumentTemplate }) {
  return <PartyAccountStatement slug={snapshot.slug} partyId={supplier.id} kind="supplier" contextKey={JSON.stringify([snapshot.finance.userId, snapshot.statements, snapshot.invoices, snapshot.payments])} />;
}
