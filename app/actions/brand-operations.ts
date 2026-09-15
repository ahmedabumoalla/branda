"use server";

import { z } from "zod";
import { getAdminOperationsCenter } from "@/lib/data/admin-operations-center";

const inputSchema = z.object({
  brandId: z.string().uuid(),
  from: z.string().date().or(z.literal("")),
  to: z.string().date().or(z.literal("")),
});

export async function fetchBrandOperationsAction(input: z.infer<typeof inputSchema>) {
  const filters = inputSchema.parse(input);
  // The existing data service enforces platform-admin authorization.
  const data = await getAdminOperationsCenter(filters);
  return {
    brand: data.brands.find(brand => brand.id === filters.brandId) ?? null,
    filters: { ...data.activeFilters, brandId: filters.brandId },
  };
}
