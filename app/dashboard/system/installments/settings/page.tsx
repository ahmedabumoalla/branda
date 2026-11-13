import {getErpInstallments} from "@/lib/data/erp-installments";
import {InstallmentWorkspace} from "@/components/erp/installments/installment-workspace";
export const dynamic='force-dynamic';
export default async function Page(){const data=await getErpInstallments();return <InstallmentWorkspace initial={data.snapshot} slug={data.slug} brand={data.brand} initialFilters={data.filters} settingsPage/>}
