import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import type { CafeBranch } from "@/lib/mock/branches";

function mapDbBranch(row: Record<string, unknown>): CafeBranch {
  const hours = row.hours as Record<string, string> | null;
  const lat = row.lat != null ? Number(row.lat) : undefined;
  const lng = row.lng != null ? Number(row.lng) : undefined;
  return {
    id: row.id as string,
    name: row.name as string,
    address: (row.address as string) ?? "",
    city: (row.city as string) ?? "",
    phone: (row.phone as string) ?? undefined,
    workingHours: hours?.summary ?? (hours?.default as string) ?? "",
    lat,
    lng,
    mapUrl: lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : undefined,
    active: row.active as boolean,
  };
}

export async function getPublicBranchesBySlug(slug: string): Promise<CafeBranch[]> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort_order");

  return (data ?? []).map(mapDbBranch);
}

export async function getOwnerBranches(): Promise<CafeBranch[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .order("sort_order");

  if (error) throw error;
  return (data ?? []).map(mapDbBranch);
}

const branchSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  workingHours: z.string().optional(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int().optional(),
});

export async function upsertBranch(input: z.infer<typeof branchSchema>) {
  const parsed = branchSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    name: parsed.name,
    address: parsed.address ?? null,
    city: parsed.city ?? null,
    phone: parsed.phone ?? null,
    hours: parsed.workingHours ? { summary: parsed.workingHours } : {},
    lat: parsed.lat ?? null,
    lng: parsed.lng ?? null,
    active: parsed.active,
    sort_order: parsed.sortOrder ?? 0,
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("branches")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapDbBranch(data);
  }

  const { data, error } = await supabase.from("branches").insert(payload).select("*").single();
  if (error) throw error;
  return mapDbBranch(data);
}

export async function softDeleteBranch(branchId: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("branches")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", branchId)
    .eq("cafe_id", cafe.id);
  if (error) throw error;
}
