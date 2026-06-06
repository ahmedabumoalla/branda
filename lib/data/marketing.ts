import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import type { MarketingCampaign } from "@/lib/mock/marketing";

function mapDbMarketing(row: Record<string, unknown>): MarketingCampaign {
  const payload = (row.payload as Record<string, unknown>) ?? {};
  return {
    id: row.id as string,
    title: row.title as string,
    channel: row.channel as MarketingCampaign["channel"],
    audience: (payload.audience as string) ?? "",
    message: (payload.message as string) ?? "",
    code: payload.code as string | undefined,
    discountPercent: payload.discountPercent as number | undefined,
    influencerName: payload.influencerName as string | undefined,
    influencerPhone: payload.influencerPhone as string | undefined,
    commissionPercent: payload.commissionPercent as number | undefined,
    status: row.status as MarketingCampaign["status"],
    startDate: payload.startDate as string | undefined,
    endDate: payload.endDate as string | undefined,
    visits: Number(payload.visits ?? 0),
    conversions: Number(payload.conversions ?? 0),
    createdAt: (row.created_at as string).slice(0, 10),
    imageAssetId: row.image_storage_path as string | undefined,
  };
}

export async function getOwnerMarketingCampaigns(): Promise<MarketingCampaign[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .select("*")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapDbMarketing);
}

const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  channel: z.string(),
  status: z.string(),
  payload: z.record(z.string(), z.unknown()),
  imageStoragePath: z.string().optional().nullable(),
});

export async function upsertMarketingCampaign(input: z.infer<typeof campaignSchema>) {
  const parsed = campaignSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    title: parsed.title,
    channel: parsed.channel,
    status: parsed.status,
    payload: parsed.payload,
    image_storage_path: parsed.imageStoragePath ?? null,
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("marketing_campaigns")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapDbMarketing(data);
  }

  const { data, error } = await supabase
    .from("marketing_campaigns")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapDbMarketing(data);
}

export async function softDeleteMarketingCampaign(campaignId: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketing_campaigns")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("cafe_id", cafe.id);
  if (error) throw error;
}
