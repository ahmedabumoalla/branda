import {readPurchases} from '@/lib/data/erp-purchases';
import {readOptionalDocumentTemplates} from '@/lib/data/erp-templates';
import {PurchasesWorkspace} from '@/components/erp/purchases/workspace';
export default async function Page({params,searchParams}:{params:Promise<{segments?:string[]}>;searchParams?:Promise<{supplier?:string}>}){const {segments=[]}=await params;const query=await searchParams;const snapshot=await readPurchases();const templates=await readOptionalDocumentTemplates(undefined,snapshot.slug);return <PurchasesWorkspace key={segments.join('/')} snapshot={snapshot} segments={segments} templates={templates} initialSupplier={query?.supplier}/>;}
