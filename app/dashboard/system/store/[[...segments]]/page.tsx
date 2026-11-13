import { StoreWorkspace } from "@/components/erp/store/store-workspace";
import { readStoreSnapshot } from "@/lib/data/erp-store";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function StorePage({params,searchParams}:{params:Promise<{segments?:string[]}>;searchParams:Promise<{template?:string}>}) {
  const {segments=[]}=await params;
  if(segments.length>3||!['content','settings','pages','media','menus','templates','inventory','preview'].includes(segments[0]||'content'))notFound();
  const [snapshot,query]=await Promise.all([readStoreSnapshot(),searchParams]);
  const previewTemplate=query.template==="arabic"||query.template==="english"?query.template:undefined;
  return <StoreWorkspace key={segments.join('/')+(previewTemplate??'')} snapshot={snapshot} segments={segments} previewTemplate={previewTemplate}/>;
}
