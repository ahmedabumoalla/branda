import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getActiveUser } from "@/lib/auth/active-user";
import { createAdminClient } from "@/lib/supabase/admin";

export const managedBrandCookie = "branda_managed_brand";
export type ManagedBrand = { id: string; slug: string; name: string; businessCategory: string; logoPath?: string | null };
export type BrandManagement = { userId: string; name: string; brands: ManagedBrand[] };

export async function readBrandManagement(client: SupabaseClient, user: User): Promise<BrandManagement | null> {
  // The protected Auth flag is only a fast path. Live RLS and ownership authorize access.
  if (user.app_metadata?.brand_management !== true) return null;
  const { data, error } = await client.rpc("get_brand_management_dashboard");
  if (error) throw new Error("تعذر تحميل العلامات حاول مرة أخرى");
  if (!data || typeof data.name !== "string" || !Array.isArray(data.brands)) throw new Error("حساب إدارة العلامات غير متاح");
  return { userId: user.id, name: data.name, brands: data.brands };
}

export const getBrandManagement = cache(async () => {
  const client = await createClient();
  const user = await getActiveUser(client);
  return user ? readBrandManagement(client, user) : null;
});

export async function selectedManagedBrand(management: BrandManagement) {
  const value = (await cookies()).get(managedBrandCookie)?.value;
  return management.brands.find(brand => value === `${management.userId}:${brand.id}`) ?? null;
}

/** The path comes only from the live authorized brand list, never from a caller. */
export async function managedBrandLogo(cafeId: string) {
  const management = await getBrandManagement();
  const brand = management?.brands.find(brand => brand.id === cafeId);
  const path = brand?.logoPath;
  if (!path || !path.startsWith(`${cafeId}/`) || path.includes("..") || path.includes("\\")) return undefined;
  const { data, error } = await createAdminClient().storage.from("cafe-logos").createSignedUrl(path, 300);
  if (error) return undefined;
  return data?.signedUrl;
}
