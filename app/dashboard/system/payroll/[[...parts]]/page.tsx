import {notFound} from 'next/navigation';
import {z} from 'zod';
import {readPayroll} from '@/lib/data/erp-payroll';
import {payrollSections} from '@/lib/erp/payroll';
import {PayrollWorkspace} from '@/components/erp/payroll/payroll-workspace';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{parts?:string[]}>}){const {parts=[]}=await params;const [section='contracts',id,mode]=parts;if(parts.length>3||!payrollSections.some(s=>s[0]===section)||(id&&id!=='create'&&!z.uuid().safeParse(id).success)||(mode&&mode!=='edit'))notFound();const data=await readPayroll();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return <PayrollWorkspace key={parts.join('/')} initial={data} section={section} recordId={id} edit={mode==='edit'} today={today}/>;}
