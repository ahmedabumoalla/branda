import {notFound} from 'next/navigation';
import {z} from 'zod';
import {readCheques} from '@/lib/data/erp-cheques';
import {readOptionalDocumentTemplates} from '@/lib/data/erp-templates';
import {chequeSections} from '@/lib/erp/cheques';
import {ChequesWorkspace} from '@/components/erp/cheques/workspace';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{segments?:string[]}>;searchParams:Promise<{book?:string}>}){const{segments=[]}=await params,{book}=await searchParams,[section='payable',id,mode]=segments;if(segments.length>3||!chequeSections.some(x=>x[0]===section)||section==='settings'&&id||id&&id!=='new'&&!z.uuid().safeParse(id).success||mode&&(mode!=='edit'||id==='new'))notFound();const initial=await readCheques();if(id&&id!=='new'&&!(section==='books'?initial.books.some(x=>x.id===id):initial.cheques.some(x=>x.id===id&&x.kind===section)))notFound();const templates=await readOptionalDocumentTemplates(undefined,initial.slug),today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return <ChequesWorkspace key={segments.join('/')+book} initial={initial} segments={segments} templates={templates} today={today} initialBook={book&&z.uuid().safeParse(book).success?book:undefined}/>;}
