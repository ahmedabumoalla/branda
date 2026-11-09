import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { getBrandFinanceSnapshot } from '@/lib/data/brand-finance';
import { FinanceAccessDenied } from '@/components/finance/finance-access-denied';
import { LedgerWorkspace } from '@/components/finance/ledger-workspace';
import { ledgerPilotEnabled } from '@/lib/finance/ledger';
import { getFinanceEntryPath } from '@/lib/data/finance-entry';
export default async function Page({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{document?:string;section?:string}>}) {
  const {slug}=await params;
  if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug))notFound();
  if(!await getSessionUser())redirect(`/finance/${slug}/login?access=team`);
  const data=await getBrandFinanceSnapshot(slug).catch(()=>null);
  if(!data||!ledgerPilotEnabled(data.cafe.id)||!['owner','manager','accountant','auditor'].includes(data.role))return <FinanceAccessDenied slug={slug}/>;
  const {document,section}=await searchParams;
  if(await getFinanceEntryPath(slug,data)==='/dashboard/finance') {
    const query=new URLSearchParams();
    if(document)query.set('document',document);
    if(section)query.set('section',section);
    redirect(`/dashboard/finance/ledger${query.size?`?${query}`:''}`);
  }
  return <LedgerWorkspace finance={data} slug={slug} initialDocument={document}/>;
}
