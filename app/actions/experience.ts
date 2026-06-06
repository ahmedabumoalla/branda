"use server";

import {
  approveExperienceSubmission,
  getOwnerExperienceData,
  rejectExperienceSubmission,
  updateExperienceMetrics,
  upsertExperienceCampaign,
} from "@/lib/data/experience";
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
    status: campaign.status,
  });
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
