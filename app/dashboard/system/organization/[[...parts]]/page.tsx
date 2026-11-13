import {notFound} from 'next/navigation';
import {z} from 'zod';
import {readOrganization} from '@/lib/data/erp-organization';
import {organizationKindSchema} from '@/lib/erp/organization';
import {OrganizationWorkspace} from '@/components/erp/organization/organization-workspace';
export const dynamic='force-dynamic';
export default async function OrganizationPage({params}:{params:Promise<{parts?:string[]}>}){
 const {parts=[]}=await params;const [section='department',id,mode]=parts;
 if(parts.length>3||(section==='chart'?parts.length!==1:!organizationKindSchema.safeParse(section).success)||(id&&id!=='create'&&!z.uuid().safeParse(id).success)||(mode&&mode!=='edit')||(mode&&id==='create'))notFound();
 const data=await readOrganization();if(id&&id!=='create'&&!data.snapshot.units.some(u=>u.id===id&&u.kind===section))notFound();
 return <OrganizationWorkspace key={parts.join('/')} initial={data.snapshot} slug={data.slug} segments={parts}/>;
}
