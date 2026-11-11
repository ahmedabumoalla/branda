import { getBrandFinanceSnapshot } from '@/lib/data/brand-finance';
import { LedgerWorkspace } from '@/components/finance/ledger-workspace';
import { FinanceAccessDenied } from '@/components/finance/finance-access-denied';
import { ledgerPilotEnabled } from '@/lib/finance/ledger';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{document?:string;draft?:string}>}) {
  const data=await getBrandFinanceSnapshot();
  if(!ledgerPilotEnabled(data.cafe.id)||!['owner','manager','accountant','auditor'].includes(data.role))return <FinanceAccessDenied slug={data.cafe.slug}/>;
  const {document,draft}=await searchParams;
  return <LedgerWorkspace finance={data} initialDocument={document} initialDraft={draft}/>;
}
