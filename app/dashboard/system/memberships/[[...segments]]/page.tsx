import {notFound} from "next/navigation";
import {readErpMemberships} from "@/lib/data/erp-memberships";
import {MembershipsWorkspace} from "@/components/erp/memberships/workspace";
export default async function Page({params,searchParams}:{params:Promise<{segments?:string[]}>;searchParams:Promise<{customer?:string;package?:string}>}){const [{segments=[]},query,snapshot]=await Promise.all([params,searchParams,readErpMemberships()]);if(segments.length>2)notFound();return <MembershipsWorkspace snapshot={snapshot} segments={segments} customerId={query.customer} packageId={query.package}/>;}
