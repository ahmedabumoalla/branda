import {notFound} from 'next/navigation';
import {z} from 'zod';
import {readTime} from '@/lib/data/erp-time';
import {TimeWorkspace} from '@/components/erp/time/workspace';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{segments?:string[]}>;searchParams:Promise<{workOrder?:string;workflow?:string}>}){const {segments=[]}=await params,query=await searchParams;if(segments.length>2||segments[0]&&!['new','list','billing','settings','import','reports'].includes(segments[0])||segments[1]&&(segments[0]!=='settings'||!['projects','activities','rates'].includes(segments[1])))notFound();const initial=await readTime();const id=query.workOrder??query.workflow,kind=query.workOrder?'work_order':'workflow';const source=id&&z.uuid().safeParse(id).success&&initial.sources.some(x=>x.id===id&&x.kind===kind)?{id,kind:kind as 'work_order'|'workflow'}:undefined;return <TimeWorkspace key={segments.join('/')+id} initial={initial} segments={segments} source={source}/>}
