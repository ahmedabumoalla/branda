import {notFound} from 'next/navigation';
import {z} from 'zod';
import {readAccounting} from '@/lib/data/erp-accounting';
import {accountingSections} from '@/lib/erp/accounting';
import {AccountingWorkspace} from '@/components/erp/accounting/workspace';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{parts?:string[]}>;searchParams:Promise<{offset?:string}>}){
 const{parts=[]}=await params,{offset='0'}=await searchParams,[section='journals',id,mode]=parts;
 if(parts.length>3||!accountingSections.some(s=>s[0]===section)||id&&(section!=='journals'||id!=='create'&&!z.uuid().safeParse(id).success)||mode&&mode!=='edit'||mode&&id==='create')notFound();
 const pageOffset=z.coerce.number().int().min(0).max(1000000).safeParse(offset);if(!pageOffset.success)notFound();
 const data=await readAccounting(pageOffset.data,undefined,id&&id!=='create'?id:undefined);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return <AccountingWorkspace key={parts.join('/')+offset} initial={data} initialOffset={pageOffset.data} section={section} recordId={id} edit={mode==='edit'} today={today}/>;
}
