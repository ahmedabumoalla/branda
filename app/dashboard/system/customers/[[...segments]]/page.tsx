import { notFound, redirect } from "next/navigation";
import { readErpCustomers } from "@/lib/data/erp-customers";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { CustomersWorkspace } from "@/components/erp/customers/workspace";
import { MindCustomerTabs } from "@/components/erp/customers/mind-customer-tabs";
import { OwnerLoyaltyPage } from "@/components/loyalty/owner-loyalty-page";

export default async function Page({ params, searchParams }: {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<{ customer?: string }>;
}) {
  const [{ segments = [] }, query] = await Promise.all([params, searchParams]);
  if (segments.length > 2) notFound();
  const { cafe } = await getBrandFinanceContext();
  const mind = cafe.slug === "mind-hospital";
  if (mind && ["appointments", "contacts", "crm", "settings"].includes(segments[0])) redirect("/dashboard/system/customers");
  if (segments[0] === "loyalty") {
    if (!mind || segments.length !== 1) notFound();
    return <><MindCustomerTabs active="loyalty" /><OwnerLoyaltyPage requestedView="customers" /></>;
  }
  const snapshot = await readErpCustomers();
  return <>{mind && <MindCustomerTabs active="branch" />}<CustomersWorkspace snapshot={snapshot} segments={segments} selectedCustomer={query.customer} /></>;
}
