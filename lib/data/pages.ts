import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import type { CafeInfoPage } from "@/lib/mock/cafe-pages";

function mapDbPage(row: Record<string, unknown>): CafeInfoPage {
  return {
    id: row.id as string,
    title: row.title as string,
    slug: row.slug as string,
    description: (row.description as string) ?? "",
    content: row.content as string,
    visible: row.published as boolean,
    updatedAt: (row.updated_at as string).slice(0, 10),
  };
}

export async function getOwnerPages(): Promise<CafeInfoPage[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cafe_pages")
    .select("*")
    .eq("cafe_id", cafe.id)
    .order("sort_order");

  if (error) throw error;
  return (data ?? []).map(mapDbPage);
}

export async function getPublicPagesBySlug(slug: string): Promise<CafeInfoPage[]> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("cafe_pages")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("published", true)
    .order("sort_order");

  return (data ?? []).map(mapDbPage);
}

const pageSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  content: z.string(),
  visible: z.boolean(),
  sortOrder: z.number().int().optional(),
});

export async function upsertPage(input: z.infer<typeof pageSchema>) {
  const parsed = pageSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    title: parsed.title,
    slug: parsed.slug,
    description: parsed.description ?? null,
    content: parsed.content,
    published: parsed.visible,
    sort_order: parsed.sortOrder ?? 0,
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("cafe_pages")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapDbPage(data);
  }

  const { data, error } = await supabase.from("cafe_pages").insert(payload).select("*").single();
  if (error) throw error;
  return mapDbPage(data);
}

export async function deletePage(pageId: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase.from("cafe_pages").delete().eq("id", pageId).eq("cafe_id", cafe.id);
  if (error) throw error;
}
