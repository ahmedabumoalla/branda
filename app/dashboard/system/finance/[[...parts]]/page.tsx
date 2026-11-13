import {notFound} from 'next/navigation';
import {z} from 'zod';
import {readErpFinance,erpFinanceError} from '@/lib/data/erp-finance';
import {getBrandFinanceContext} from '@/lib/data/brand-finance';
import {readErpBranchFinanceSnapshot} from '@/lib/data/erp-branches';
import {branchScopeOf} from '@/lib/erp/branches';
import {financeSections,type BankStatementDetail} from '@/lib/erp/finance';
import {FinanceWorkspace} from '@/components/erp/finance/workspace';
import {ErpTreasury} from '@/components/erp/finance/treasury';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{parts?:string[]}>;searchParams:Promise<{offset?:string}>}){
 const{parts=[]}=await params,{offset='0'}=await searchParams,[section='expenses',id,mode]=parts;
 if(parts.length>3||!financeSections.some(s=>s[0]===section)||id&&(!['expenses','receipts','custodies','bank-statements'].includes(section)||id!=='create'&&!z.uuid().safeParse(id).success)||mode&&(mode!=='edit'||id==='create'||section==='bank-statements'))notFound();
 const page=z.coerce.number().int().min(0).max(1000000).safeParse(offset);if(!page.success)notFound();
 const data=await readErpFinance({offset:page.data,kind:section==='expenses'?'expense':section==='receipts'?'receipt':undefined,id:id&&id!=='create'?id:undefined});let bank:BankStatementDetail|undefined;
 if(section==='bank-statements'&&id&&id!=='create'){const{client,cafe}=await getBrandFinanceContext(data.slug);const r=await client.rpc('erp_finance_detail',{p_cafe_id:cafe.id,p_kind:'bank',p_id:id});erpFinanceError(r.error);bank=r.data;}
 const treasury=section==='treasury'?await readErpBranchFinanceSnapshot(data.slug):null,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return <FinanceWorkspace key={parts.join('/')+offset} initial={data} section={section} recordId={id} edit={mode==='edit'} initialOffset={page.data} today={today} bankDetail={bank}>{treasury&&<ErpTreasury snapshot={treasury} canApprove={data.canApprove} scope={branchScopeOf(data)}/>}</FinanceWorkspace>;
}
