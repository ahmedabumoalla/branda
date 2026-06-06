import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { assertCustomerIdMatchesSession } from "@/lib/data/customers";
import {
  type ExperienceCampaign,
  type ExperienceSubmission,
} from "@/lib/mock/experience-campaigns";

function mapDbCampaign(slug: string, row: Record<string, unknown>): ExperienceCampaign {
  return {
    id: row.id as string,
    cafeSlug: slug,
    title: row.title as string,
    description: row.description as string,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    terms: (row.terms as string) ?? "",
    platforms: (row.platforms as ExperienceCampaign["platforms"]) ?? [],
    minFollowers: row.min_followers as number | undefined,
    basePoints: row.base_points as number,
    pointsPerView: Number(row.points_per_view),
    pointsPerLike: Number(row.points_per_like),
    pointsPerComment: Number(row.points_per_comment),
    maxPointsPerSubmission: row.max_points_per_submission as number,
    requiresManualApproval: row.requires_manual_approval as boolean,
    status: row.status as ExperienceCampaign["status"],
    createdAt: (row.created_at as string).slice(0, 10),
  };
}

function mapDbSubmission(slug: string, row: Record<string, unknown>): ExperienceSubmission {
  return {
    id: row.id as string,
    campaignId: row.campaign_id as string,
    cafeSlug: slug,
    customerId: row.customer_id as string,
    customerName: (row.customer_name as string) ?? "",
    platform: row.platform as ExperienceSubmission["platform"],
    videoUrl: row.video_url as string,
    platformUsername: row.platform_username as string | undefined,
    note: row.note as string | undefined,
    status: row.status as ExperienceSubmission["status"],
    views: row.views as number | undefined,
    likes: row.likes as number | undefined,
    comments: row.comments as number | undefined,
    shares: row.shares as number | undefined,
    suggestedPoints: row.suggested_points as number | undefined,
    awardedPoints: row.awarded_points as number | undefined,
    rejectionReason: row.rejection_reason as string | undefined,
    createdAt: (row.created_at as string).slice(0, 10),
    reviewedAt: row.reviewed_at as string | undefined,
  };
}

export async function getPublicExperienceCampaigns(slug: string): Promise<ExperienceCampaign[]> {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("experience_campaigns")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => mapDbCampaign(slug, row));
}

export async function getOwnerExperienceData() {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const [{ data: campaigns }, { data: submissions }] = await Promise.all([
    supabase
      .from("experience_campaigns")
      .select("*")
      .eq("cafe_id", cafe.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("experience_submissions")
      .select("*, customer_profiles(full_name)")
      .eq("cafe_id", cafe.id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    campaigns: (campaigns ?? []).map((row) => mapDbCampaign(cafe.slug, row)),
    submissions: (submissions ?? []).map((row) => {
      const profile = row.customer_profiles as { full_name: string } | null;
      return mapDbSubmission(cafe.slug, {
        ...row,
        customer_name: profile?.full_name,
      });
    }),
  };
}

const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  terms: z.string().optional(),
  platforms: z.array(z.string()),
  minFollowers: z.number().optional().nullable(),
  basePoints: z.number().int(),
  pointsPerView: z.number(),
  pointsPerLike: z.number(),
  pointsPerComment: z.number(),
  maxPointsPerSubmission: z.number().int(),
  requiresManualApproval: z.boolean(),
  status: z.string(),
});

export async function upsertExperienceCampaign(input: z.infer<typeof campaignSchema>) {
  const parsed = campaignSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    title: parsed.title,
    description: parsed.description,
    start_date: parsed.startDate,
    end_date: parsed.endDate,
    terms: parsed.terms ?? null,
    platforms: parsed.platforms,
    min_followers: parsed.minFollowers ?? null,
    base_points: 0,
    points_per_view: 0,
    points_per_like: 0,
    points_per_comment: 0,
    max_points_per_submission: 0,
    requires_manual_approval: parsed.requiresManualApproval,
    status: parsed.status,
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("experience_campaigns")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapDbCampaign(cafe.slug, data);
  }

  const { data, error } = await supabase
    .from("experience_campaigns")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapDbCampaign(cafe.slug, data);
}

const submissionSchema = z.object({
  cafeSlug: z.string(),
  customerId: z.string().uuid(),
  campaignId: z.string().uuid(),
  platform: z.string(),
  videoUrl: z.string().url().optional(),
  platformUsername: z.string().optional(),
  note: z.string().optional(),
});

export async function createExperienceSubmission(input: z.infer<typeof submissionSchema>) {
  const parsed = submissionSchema.parse(input);
  await assertCustomerIdMatchesSession(parsed.cafeSlug, parsed.customerId);
  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();
  const { data: submissionId, error } = await supabase.rpc("submit_experience_submission", {
    p_cafe_id: cafe.id,
    p_campaign_id: parsed.campaignId,
    p_platform: parsed.platform,
    p_video_url: parsed.videoUrl ?? null,
    p_platform_username: parsed.platformUsername ?? null,
    p_note: parsed.note ?? null,
  });

  if (error) throw error;

  const { data } = await supabase
    .from("experience_submissions")
    .select("*")
    .eq("id", submissionId)
    .single();

  if (!data) throw new Error("Submission not found after create");
  return mapDbSubmission(parsed.cafeSlug, data);
}

export async function updateExperienceMetrics(
  submissionId: string,
  metrics: { views?: number; likes?: number; comments?: number; shares?: number }
) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("update_experience_submission_metrics", {
    p_submission_id: submissionId,
    p_views: metrics.views ?? null,
    p_likes: metrics.likes ?? null,
    p_comments: metrics.comments ?? null,
    p_shares: metrics.shares ?? null,
  });

  if (error) throw error;
  if (!data) throw new Error("Submission not found after metrics update");
  return mapDbSubmission(cafe.slug, data as Record<string, unknown>);
}

export async function approveExperienceSubmission(submissionId: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("approve_experience_submission_without_reward", {
    p_submission_id: submissionId,
  });

  if (error) throw error;
  return mapDbSubmission(cafe.slug, data as Record<string, unknown>);
}

export async function rejectExperienceSubmission(submissionId: string, reason: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_experience_submission", {
    p_submission_id: submissionId,
    p_rejection_reason: reason.trim() || "لم تستوفِ شروط الحملة",
  });

  if (error) throw error;
  if (!data) throw new Error("Submission not found after reject");
  return mapDbSubmission(cafe.slug, data as Record<string, unknown>);
}
