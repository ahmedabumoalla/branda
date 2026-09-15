"use server";



import { getOwnerCustomersDashboard } from "@/lib/data/customers";



export async function fetchOwnerCustomersDashboardAction() {

  return getOwnerCustomersDashboard();

}

