import {notFound} from 'next/navigation';
import {z} from 'zod';
import {readCommissions} from '@/lib/data/erp-commissions';
import {commissionListQuerySchema} from '@/lib/erp/commissions';
import {CommissionsWorkspace} from '@/components/erp/commissions/commissions-workspace';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{parts?:string[]}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {parts=[]}=await params;const [section='rules',id,mode]=parts;
 if(parts.length>3||!['rules','periods','commissions','sales'].includes(section)||(id&&id!=='create'&&!z.uuid().safeParse(id).success)||(mode&&!(section==='rules'&&mode==='edit'&&id!=='create'))||(['sales','commissions'].includes(section)&&parts.length!==1))notFound();
 const query=commissionListQuerySchema.safeParse(await searchParams);if(!query.success)notFound();
 const data=await readCommissions(section==='periods'&&id&&id!=='create'?id:null,undefined,query.data);if(id&&id!=='create'&&!(section==='rules'?data.snapshot.rules:data.snapshot.periods).some(r=>r.id===id))notFound();
 const today=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Riyadh'})),year=today.getFullYear(),month=today.getMonth()+1;
 const from=`${year}-${String(month).padStart(2,'0')}-01`,to=`${year}-${String(month).padStart(2,'0')}-${new Date(year,month,0).getDate()}`;
 return <CommissionsWorkspace key={parts.join('/')+JSON.stringify(query.data)} initial={data.snapshot} listQuery={query.data} slug={data.slug} segments={parts} monthFrom={from} monthTo={to}/>;
}
