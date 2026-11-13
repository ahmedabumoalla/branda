import {notFound} from 'next/navigation';
import {z} from 'zod';
import {readReports,runReport} from '@/lib/data/erp-reports';
import {initialReportQuery} from '@/lib/erp/reports';
import {reportFamilies} from '@/lib/erp/report-catalog';
import {ReportsWorkspace} from '@/components/erp/reports/workspace';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{parts?:string[]}>;searchParams:Promise<{source?:string}>}){const{parts=[]}=await params,{source}=await searchParams,[family,id]=parts;if(parts.length>2||family&&!['custom','builder',...reportFamilies.map(x=>x[0])].includes(family)||id&&['custom','builder'].includes(family)&&!z.uuid().safeParse(id).success)notFound();const data=await readReports(),builder=family==='builder',savedId=['custom','builder'].includes(family)?id:undefined,saved=data.saved.find(x=>x.id===savedId),definition=data.catalog.find(x=>builder?x.id===source:x.id===id&&x.family===family);if(savedId&&!saved||id&&!['custom','builder'].includes(family)&&!definition||family==='custom'&&!id)notFound();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),query=saved?.query??(definition?initialReportQuery(definition,today):undefined),initialResult=query?await runReport(query,data.slug):undefined;return <ReportsWorkspace key={parts.join('/')+source} data={data} family={family} definition={definition} savedId={savedId} builder={builder} initialResult={initialResult} today={today}/>;}
