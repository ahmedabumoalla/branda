import { notFound } from "next/navigation";
import { ContractingWorkspace } from "@/components/erp/contracting/contracting-workspace";
import { readContractingSnapshot } from "@/lib/data/erp-contracting";
import { contractingSections } from "@/lib/erp/contracting";
export const dynamic="force-dynamic";
export default async function ContractingPage({params,searchParams}:{params:Promise<{segments?:string[]}>;searchParams:Promise<{source?:string;project?:string;copy?:string}>}){
 const [{segments=[]},query,snapshot]=await Promise.all([params,searchParams,readContractingSnapshot()]);
 const section=contractingSections.find(s=>s.key===(segments[0]??"projects"));
 if(segments.length>3||(!section&&segments[0]!=="settings")||(segments[2]&&segments[2]!=="edit"))notFound();
 if(segments[0]==="settings"&&segments[1]&&!['general','print','statuses','fields','related','actions'].includes(segments[1]))notFound();
 if(section&&segments[1]&&segments[1]!=="new"&&!snapshot.documents.some(d=>d.id===segments[1]&&d.kind===section.kind))notFound();
 return <ContractingWorkspace key={segments.join('/')+JSON.stringify(query)} snapshot={snapshot} segments={segments} sourceId={query.source} projectId={query.project} copyId={query.copy}/>;
}
