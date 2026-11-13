import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {readVerifiedCustomerPortal} from '@/lib/data/erp-customer-portal';
import {getCustomerLoginHref} from '@/lib/cafe/theme-links';
import {CustomerPortal} from '@/components/erp/customers/portal';
export default async function Page({params}:{params:Promise<{slug:string}>}){const{slug}=await params,result=await readVerifiedCustomerPortal(slug);if(result.state==='missing')notFound();if(result.state==='login')redirect(getCustomerLoginHref(slug,`/c/${slug}/portal`));if(result.state==='unavailable')return <main dir="rtl" style={{padding:32}}><h1>{result.brand}</h1><p>بوابة الخدمات غير مفعلة لهذا الحساب</p><p>يمكن للعلامة ربط حسابك بملفك المالي وتحديد صلاحيات عرضه</p><Link href={`/c/${slug}/account`}>العودة إلى حسابي</Link></main>;return <CustomerPortal data={result.data} brand={result.brand} slug={slug}/>;}
