import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { getBrandFinanceSnapshot } from '@/lib/data/brand-finance';
import { FinanceAccessDenied } from '@/components/finance/finance-access-denied';
import { LedgerWorkspace } from '@/components/finance/ledger-workspace';
import { ledgerPilotEnabled } from '@/lib/finance/ledger';
export default async function Page({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{document?:string}>}) {
  const {slug}=await params;
  if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug))notFound();
  if(!await getSessionUser())redirect(`/finance/${slug}/login`);
  const data=await getBrandFinanceSnapshot(slug).catch(()=>null);
  if(!data||!ledgerPilotEnabled(data.cafe.id)||!['owner','manager','accountant','auditor'].includes(data.role))return <FinanceAccessDenied slug={slug}/>;
  const {document}=await searchParams;
  return <LedgerWorkspace finance={data} slug={slug} initialDocument={document}/>;
}
