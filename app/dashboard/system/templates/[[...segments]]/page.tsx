import {notFound} from "next/navigation";
import {TemplatesWorkspace} from "@/components/erp/templates/templates-workspace";
import {readTemplatesSnapshot,documentTemplateContext} from "@/lib/data/erp-templates";
import {branchFinanceSnapshot} from "@/lib/data/erp-branches";
import {templateSections} from "@/lib/erp/templates";
export default async function TemplatesPage({params,searchParams}:{params:Promise<{segments?:string[]}>;searchParams:Promise<{kind?:string}>}){const [{segments=[]},search,snapshot]=await Promise.all([params,searchParams,readTemplatesSnapshot()]);if(segments.length>2||segments[0]&&!templateSections.some(s=>s.key===segments[0]))notFound();const finance=segments[0]==="invoices"?await branchFinanceSnapshot(await documentTemplateContext()):null;return <TemplatesWorkspace snapshot={snapshot} segments={segments} kind={search.kind} customers={finance?.parties.filter(p=>p.kind==="customer"&&p.active).map(p=>({id:p.id,name:p.name}))??[]}/>;}
