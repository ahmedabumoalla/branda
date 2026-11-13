import { notFound } from "next/navigation";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { readTasks } from "@/lib/data/erp-tasks";
import { taskQuerySchema } from "@/lib/erp/tasks";
import { TasksWorkspace } from "@/components/erp/tasks/tasks-workspace";
import { z } from "zod";
export const dynamic="force-dynamic";
export default async function TasksPage({params,searchParams}:{params:Promise<{parts?:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const [{parts=[]},search]=await Promise.all([params,searchParams]);
 const [section,id,mode]=parts;
 if(parts.length>3||section&&!['create','task','types','flows','templates','settings','targets'].includes(section)||id&&id!=='create'&&!z.uuid().safeParse(id).success||mode&&mode!=='edit')notFound();
 if((['create','settings','targets'].includes(section)&&parts.length!==1)||(section==='task'&&(!id||id==='create'))||(mode&&id==='create'))notFound();
 const raw=Object.fromEntries(Object.entries(search).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
 const query=taskQuerySchema.safeParse({...raw,page:raw.page?Number(raw.page):1,...(section==='task'&&id?{id}:{}),...(section==='flows'&&id&&id!=='create'?{flowId:id}:{})});
 if(!query.success)notFound();
 const {cafe}=await getBrandFinanceContext();
 const snapshot=await readTasks(query.data,cafe.slug);
 if(id&&id!=='create'&&!(section==='task'?snapshot.tasks:section==='flows'?snapshot.flows:section==='templates'?snapshot.templates:snapshot.types).some(row=>row.id===id))notFound();
 return <TasksWorkspace key={parts.join('/')+JSON.stringify(query.data)} initial={snapshot} slug={cafe.slug} segments={parts} query={query.data}/>;
}
