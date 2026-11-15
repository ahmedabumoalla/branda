import {readPurchases} from '@/lib/data/erp-purchases';
import {readOptionalDocumentTemplates} from '@/lib/data/erp-templates';
import {PurchasesWorkspace} from '@/components/erp/purchases/workspace';
export default async function Page({params,searchParams}:{params:Promise<{segments?:string[]}>;searchParams?:Promise<{supplier?:string;tab?:string}>}){
  const {segments=[]}=await params;
  const [section='invoices',id]=segments;
  // Credit notes open their printable details in place; other lists navigate to a record.
  const needsTemplates=section==='credit-notes'||Boolean(id&&id!=='new'&&id!=='import');
  const [query,snapshot,templates]=await Promise.all([
    searchParams,
    readPurchases(),
    needsTemplates?readOptionalDocumentTemplates():Promise.resolve([]),
  ]);
  return <PurchasesWorkspace key={segments.join('/')} snapshot={snapshot} segments={segments} templates={templates} initialSupplier={query?.supplier} initialTab={query?.tab}/>;
}
