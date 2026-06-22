"use server";

import {
  approveExperienceSubmission,
  getOwnerExperienceData,
  rejectExperienceSubmission,
  softDeleteExperienceCampaign,
  updateExperienceMetrics,
  upsertExperienceCampaign,
} from "@/lib/data/experience";
import { getOwnerMenu } from "@/lib/data/menu";
import { getOwnerReservationServices } from "@/lib/data/platform-upgrade";
import { generateMarketingCard } from "@/lib/ai/marketing-card-generator";
import type { ExperienceCampaign } from "@/lib/mock/experience-campaigns";

export async function fetchOwnerExperienceAction() {
  return getOwnerExperienceData();
}

export async function saveExperienceCampaignAction(campaign: ExperienceCampaign) {
  return upsertExperienceCampaign({
    id: /^[0-9a-f-]{36}$/i.test(campaign.id) ? campaign.id : undefined,
    title: campaign.title,
    description: campaign.description,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    terms: campaign.terms,
    platforms: campaign.platforms,
    minFollowers: campaign.minFollowers ?? null,
    basePoints: 0,
    pointsPerView: 0,
    pointsPerLike: 0,
    pointsPerComment: 0,
    maxPointsPerSubmission: 0,
    requiresManualApproval: campaign.requiresManualApproval,
    requirements: campaign.requirements ?? {},
    excludedContentRules: campaign.excludedContentRules ?? [],
    rewardType: campaign.rewardType ?? "product",
    rewardProductId: campaign.rewardProductId ?? null,
    rewardReservationServiceId: campaign.rewardReservationServiceId ?? null,
    rewardDiscountPercent: campaign.rewardDiscountPercent ?? null,
    cardStoragePath: campaign.cardStoragePath ?? null,
    cardGenerationStatus: campaign.cardGenerationStatus ?? "idle",
    cardGenerationError: campaign.cardGenerationError ?? null,
    cardGeneratedAt: campaign.cardGeneratedAt ?? null,
    status: campaign.status,
  });
}

export async function generateExperienceCampaignCardAction(campaignId: string) {
  const [experience, menu, services] = await Promise.all([
    getOwnerExperienceData(),
    getOwnerMenu(),
    getOwnerReservationServices(),
  ]);
  const campaign = experience.campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error("الحملة غير موجودة");

  await saveExperienceCampaignAction({
    ...campaign,
    cardGenerationStatus: "generating",
    cardGenerationError: undefined,
  });

  const products = campaign.rewardProductId
    ? menu.products.filter((product) => product.id === campaign.rewardProductId)
    : [];
  const reservationService =
    services.find((service) => service.id === campaign.rewardReservationServiceId) ?? null;
  const result = await generateMarketingCard({
    entityId: campaign.id,
    kind: "experience_campaign",
    title: campaign.title,
    description: campaign.description,
    brand: { cafeName: menu.cafe.name ?? "Barndaksa" },
    products,
    reservationService,
  });

  const saved = await saveExperienceCampaignAction({
    ...campaign,
    cardStoragePath: result.ok ? result.storagePath : campaign.cardStoragePath,
    cardGenerationStatus: result.status,
    cardGenerationError: result.ok ? undefined : result.error,
    cardGeneratedAt: result.ok ? new Date().toISOString() : campaign.cardGeneratedAt,
  });

  return saved;
}

export async function deleteExperienceCampaignAction(campaignId: string) {
  await softDeleteExperienceCampaign(campaignId);
}

export async function updateExperienceMetricsAction(
  submissionId: string,
  metrics: { views?: number; likes?: number; comments?: number; shares?: number }
) {
  return updateExperienceMetrics(submissionId, metrics);
}

export async function approveExperienceSubmissionAction(submissionId: string) {
  return approveExperienceSubmission(submissionId);
}

export async function rejectExperienceSubmissionAction(submissionId: string, reason: string) {
  return rejectExperienceSubmission(submissionId, reason);
}

export async function createExperienceSubmissionAction(
  input: Parameters<typeof import("@/lib/data/experience").createExperienceSubmission>[0]
) {
  const { createExperienceSubmission } = await import("@/lib/data/experience");
  return createExperienceSubmission(input);
}
