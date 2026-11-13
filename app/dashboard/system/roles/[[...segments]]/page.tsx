import {notFound} from "next/navigation";
import {readErpRoles} from "@/lib/data/erp-roles";
import {RolesWorkspace} from "@/components/erp/roles/workspace";
export default async function RolesPage({params,searchParams}:{params:Promise<{segments?:string[]}>;searchParams:Promise<{copy?:string}>}){const [{segments=[]},query,snapshot]=await Promise.all([params,searchParams,readErpRoles()]);if(segments.length>2||segments[1]&&!['edit','blocked'].includes(segments[1]))notFound();return <RolesWorkspace snapshot={snapshot} segments={segments} copyId={query.copy}/>;}
