'use client';
import type { CustomerSnapshot, ErpCustomer } from '@/lib/erp/customers';
import { PartyAccountStatement } from '@/components/finance/party-account-statement';
export function CustomerStatement({ snapshot, customer }: { snapshot: CustomerSnapshot; customer: ErpCustomer }) {
  return <PartyAccountStatement slug={snapshot.slug} partyId={customer.id} kind="customer" contextKey={JSON.stringify([snapshot.finance.userId, snapshot.finance.documents])} />;
}
