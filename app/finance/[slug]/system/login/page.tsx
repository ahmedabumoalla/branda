import {notFound} from 'next/navigation';
import {FinanceLogin} from '@/components/finance/finance-login';
export default async function Page({params}:{params:Promise<{slug:string}>}){const{slug}=await params;if(!/^[a-z0-9-]{1,120}$/.test(slug))notFound();return <FinanceLogin slug={slug} destination="system"/>;}
