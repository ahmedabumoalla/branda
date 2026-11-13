import { notFound } from "next/navigation";
import { readPublicStore } from "@/lib/data/erp-store-public";
import { PublicStorefront } from "@/components/store/public-storefront";
export const dynamic="force-dynamic";
export default async function StorePage({params}:{params:Promise<{slug:string;segments?:string[]}>}){const {slug,segments=[]}=await params;const store=await readPublicStore(slug);if(!store)notFound();const [kind,id]=segments;if(segments.length>2||kind&&!['page','product','category','products'].includes(kind)||kind==='page'&&!store.pages.some(p=>p.id===id&&p.data.kind==='page')||kind==='product'&&!store.products.some(p=>p.id===id)||kind==='category'&&!store.products.some(p=>p.category===id)||kind==='products'&&id)notFound();return <PublicStorefront store={store} kind={kind} id={id}/>;}
