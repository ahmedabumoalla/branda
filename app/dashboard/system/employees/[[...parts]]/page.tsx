import {notFound} from 'next/navigation';
import {z} from 'zod';
import {hrQuerySchema} from '@/lib/erp/hr';
import {readHr} from '@/lib/data/erp-hr';
import {HrWorkspace} from '@/components/erp/hr/hr-workspace';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{parts?:string[]}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {parts=[]}=await params;const [first,mode]=parts;const employee=first&&z.uuid().safeParse(first).success;
 if(parts.length>2||(first&&!['create','settings','documents'].includes(first)&&!employee)||(mode&&(!employee||mode!=='edit')))notFound();
 const parsed=hrQuerySchema.safeParse({...await searchParams,id:employee?first:null});if(!parsed.success)notFound();const data=await readHr(parsed.data);if(employee&&!data.snapshot.employees.length)notFound();if((first==='create'||mode==='edit')&&!data.snapshot.canWrite)notFound();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return <HrWorkspace key={parts.join('/')+JSON.stringify(parsed.data)} initial={data.snapshot} slug={data.slug} parts={parts} query={parsed.data} today={today}/>;
}
