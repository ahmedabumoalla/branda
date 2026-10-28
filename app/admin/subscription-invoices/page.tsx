import { requirePlatformAdmin } from "@/lib/data/cafes";
import { getSubscriptionInvoicePlans, listSubscriptionInvoices } from "@/lib/data/subscription-invoices";
import { SubscriptionInvoicesPage } from "@/components/admin/pages/subscription-invoices-page";
import type { InvoiceList, InvoicePlan } from "@/lib/platform/subscription-invoices";
export const dynamic="force-dynamic";
export default async function Page(){
  await requirePlatformAdmin();
  let plans:InvoicePlan[]=[],invoices:InvoiceList={rows:[],total:0,page:0,search:''},configError:string|undefined;
  try{[plans,invoices]=await Promise.all([getSubscriptionInvoicePlans(),listSubscriptionInvoices()]);}
  catch{configError="تعذر تحميل فواتير الاشتراكات والباقات حاول تحديث الصفحة";}
  return <SubscriptionInvoicesPage plans={plans} initialInvoices={invoices} configError={configError}/>;
}
