import {notFound} from 'next/navigation';
import {z} from 'zod';
import {readWorkOrders} from '@/lib/data/erp-work-orders';
import {readOptionalDocumentTemplates} from '@/lib/data/erp-templates';
import {WorkOrderWorkspace} from '@/components/erp/work-orders/workspace';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{segments?:string[]}>}){const {segments=[]}=await params;if(segments.length>2||segments.length===2&&segments[0]!=='settings'||segments[0]&&!['new','settings'].includes(segments[0])&&!z.uuid().safeParse(segments[0]).success||segments[0]==='settings'&&segments[1]&&!['general','statuses','actions','fields'].includes(segments[1]))notFound();const initial=await readWorkOrders();if(segments[0]&&z.uuid().safeParse(segments[0]).success&&!initial.records.some(x=>x.id===segments[0]))notFound();const templates=await readOptionalDocumentTemplates('work_order',initial.slug);return <WorkOrderWorkspace key={segments.join('/')} initial={initial} segments={segments} templates={templates}/>}
