import {notFound} from "next/navigation";
import {readErpCredits} from "@/lib/data/erp-credits";
import {CreditsWorkspace} from "@/components/erp/credits/workspace";
export default async function Page({params,searchParams}:{params:Promise<{segments?:string[]}>;searchParams:Promise<{customer?:string;type?:string;charge?:string}>}){const [{segments=[]},query,snapshot]=await Promise.all([params,searchParams,readErpCredits()]);if(segments.length>3)notFound();return <CreditsWorkspace snapshot={snapshot} segments={segments} customerId={query.customer} typeId={query.type} chargeId={query.charge}/>;}
