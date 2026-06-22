export type ExperiencePlatform = "tiktok" | "instagram" | "snapchat" | "youtube_shorts" | "x";

export type ExperienceCampaignStatus = "draft" | "active" | "ended";

export type ExperienceRewardType = "free_order" | "product" | "reservation" | "discount";

export type ExperienceCardGenerationStatus = "idle" | "generating" | "ready" | "failed";

export type ExperienceCampaignRequirements = {
  views?: number;
  likes?: number;
  comments?: number;
  extra?: string;
};

export type ExperienceCampaign = {
  id: string;
  cafeSlug: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  terms: string;
  platforms: ExperiencePlatform[];
  minFollowers?: number;
  basePoints: number;
  pointsPerView: number;
  pointsPerLike: number;
  pointsPerComment: number;
  maxPointsPerSubmission: number;
  requiresManualApproval: boolean;
  requirements?: ExperienceCampaignRequirements;
  excludedContentRules?: string[];
  rewardType?: ExperienceRewardType;
  rewardProductId?: string;
  rewardReservationServiceId?: string;
  rewardDiscountPercent?: number;
  cardStoragePath?: string;
  cardGenerationStatus?: ExperienceCardGenerationStatus;
  cardGenerationError?: string;
  cardGeneratedAt?: string;
  status: ExperienceCampaignStatus;
  createdAt: string;
};

export type ExperienceSubmissionStatus = "pending" | "approved" | "rejected";

export type ExperienceSubmission = {
  id: string;
  campaignId: string;
  cafeSlug: string;
  customerId: string;
  customerName: string;
  platform: ExperiencePlatform;
  videoUrl: string;
  platformUsername?: string;
  note?: string;
  status: ExperienceSubmissionStatus;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  suggestedPoints?: number;
  awardedPoints?: number;
  rejectionReason?: string;
  createdAt: string;
  reviewedAt?: string;
};

export const EXPERIENCE_CAMPAIGNS_KEY = "barndaksa_qatrah_experience_campaigns";
export const EXPERIENCE_SUBMISSIONS_KEY = "barndaksa_qatrah_experience_submissions";

export const platformLabels: Record<ExperiencePlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  snapchat: "Snapchat",
  youtube_shorts: "YouTube Shorts",
  x: "X",
};

export const mockExperienceCampaigns: ExperienceCampaign[] = [
  {
    id: "exp_wathiq_1",
    cafeSlug: "qatrah",
    title: "وثّق تجربتك",
    description:
      "صوّر تجربتك في الكوفي وانشرها على TikTok أو Instagram واحصل على نقاط ولاء.",
    startDate: "2026-05-01",
    endDate: "2026-06-30",
    terms:
      "يجب أن يظهر اسم الكوفي أو المنتج في الفيديو. لا تُقبل المحتوى المسيء أو المضلل.",
    platforms: ["tiktok", "instagram", "snapchat"],
    minFollowers: 500,
    basePoints: 25,
    pointsPerView: 2,
    pointsPerLike: 1,
    pointsPerComment: 3,
    maxPointsPerSubmission: 200,
    requiresManualApproval: true,
    status: "active",
    createdAt: "2026-05-01",
  },
];

export const mockExperienceSubmissions: ExperienceSubmission[] = [];

export function calculateExperiencePoints(
  campaign: ExperienceCampaign,
  metrics: { views?: number; likes?: number; comments?: number }
) {
  const views = metrics.views ?? 0;
  const likes = metrics.likes ?? 0;
  const comments = metrics.comments ?? 0;
  const raw =
    campaign.basePoints +
    Math.floor(views / 100) * campaign.pointsPerView +
    likes * campaign.pointsPerLike +
    comments * campaign.pointsPerComment;
  return Math.min(raw, campaign.maxPointsPerSubmission);
}
