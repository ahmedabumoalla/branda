import Link from 'next/link';
import {rentalCustomerCall,type RentalCustomerSnapshot} from '@/lib/data/erp-rentals-customer';
import {getCustomerLoginHref} from '@/lib/cafe/theme-links';
import {CustomerRentals} from '@/components/erp/rentals/customer-rentals';
export const dynamic='force-dynamic';
export default async function CustomerRentalPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;let data:RentalCustomerSnapshot|undefined;let error='';try{data=await rentalCustomerCall(slug,'read') as RentalCustomerSnapshot}catch(e){error=e instanceof Error?e.message:'تعذر تحميل الحجز'}return data?<CustomerRentals initial={data} slug={slug}/>:<main dir="rtl" style={{padding:32}}><h1>حجز الوحدات</h1><p>{error}</p><Link href={getCustomerLoginHref(slug,`/rentals/${slug}`)}>الدخول بحساب العميل</Link></main>}
