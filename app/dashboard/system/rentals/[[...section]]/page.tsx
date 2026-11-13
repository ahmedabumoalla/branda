import {notFound} from 'next/navigation';
import {getErpRentals} from '@/lib/data/erp-rentals';
import {readOptionalDocumentTemplates} from '@/lib/data/erp-templates';
import {rentalTabs,type RentalTab} from '@/lib/erp/rentals';
import {RentalWorkspace} from '@/components/erp/rentals/rental-workspace';
export const dynamic='force-dynamic';
export default async function RentalPage({params}:{params:Promise<{section?:string[]}>}){const {section}=await params;const tab=(section?.[0]??'units') as RentalTab;if((section?.length??0)>1||!rentalTabs.some(t=>t[0]===tab))notFound();const data=await getErpRentals();const templates=(await Promise.all(['rental_reservation','rental_contract'].map(kind=>readOptionalDocumentTemplates(kind,data.slug)))).flat();return <RentalWorkspace key={tab} initial={data.snapshot} slug={data.slug} brand={data.brand} canSettings={data.canSettings} tab={tab} templates={templates}/>}
