import {notFound} from 'next/navigation';
import {readErpInsurance} from '@/lib/data/erp-insurance';
import {InsuranceWorkspace} from '@/components/erp/insurance/workspace';
export default async function Page({params}:{params:Promise<{segments?:string[]}>}){const[{segments=[]},snapshot]=await Promise.all([params,readErpInsurance()]);if(segments.length>3)notFound();return <InsuranceWorkspace snapshot={snapshot} segments={segments}/>;}
