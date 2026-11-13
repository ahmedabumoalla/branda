import{notFound}from'next/navigation';
import{z}from'zod';
import{readRequests}from'@/lib/data/erp-requests';
import{readOptionalDocumentTemplates}from'@/lib/data/erp-templates';
import{RequestsWorkspace}from'@/components/erp/requests/workspace';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{segments?:string[]}>;searchParams:Promise<{type?:string}>}){const{segments=[]}=await params,{type}=await searchParams,[first,second]=segments,types=first==='types',id=types?second:first;if(segments.length>2||!types&&second&&second!=='edit'||id&&id!=='new'&&!z.uuid().safeParse(id).success||first==='new'&&second)notFound();const initial=await readRequests();if(id&&id!=='new'&&!(types?initial.types.some(t=>t.id===id):initial.records.some(r=>r.id===id)))notFound();const templates=await readOptionalDocumentTemplates('staff_request',initial.slug),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return <RequestsWorkspace key={segments.join('/')+type} initial={initial} segments={segments} initialType={type&&z.uuid().safeParse(type).success?type:undefined} today={today} templates={templates}/>;}
