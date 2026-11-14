import {notFound} from 'next/navigation';
import {FinanceLogin} from '@/components/finance/finance-login';
import {HospitalLogin} from '@/components/finance/hospital-login';
import {isHospitalStore} from '@/lib/commerce/hospital-profile';
export default async function Page({params}:{params:Promise<{slug:string}>}){const{slug}=await params;if(!/^[a-z0-9-]{1,120}$/.test(slug))notFound();return isHospitalStore(slug)?<HospitalLogin slug={slug}/>:<FinanceLogin slug={slug} destination="system"/>;}
