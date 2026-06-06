import type { BrandaCustomerSession } from "@/lib/customer/session";
import type { ExperienceCampaign, ExperiencePlatform } from "@/lib/mock/experience-campaigns";
import {
  approveExperienceSubmission as approveSubmissionDb,
  createExperienceSubmission,
  rejectExperienceSubmission as rejectSubmissionDb,
  updateExperienceMetrics as updateMetricsDb,
  upsertExperienceCampaign,
} from "@/lib/data/experience";
import { createNotification } from "@/lib/data/notifications";

export async function submitExperienceCampaign(input: {
  slug: string;
  customer: BrandaCustomerSession;
  campaignId: string;
  platform: ExperiencePlatform;
  videoUrl: string;
  platformUsername?: string;
  note?: string;
}) {
  const submission = await createExperienceSubmission({
    cafeSlug: input.slug,
    customerId: input.customer.id,
    campaignId: input.campaignId,
    platform: input.platform,
    videoUrl: input.videoUrl,
    platformUsername: input.platformUsername,
    note: input.note,
  });

  await createNotification({
    cafeSlug: input.slug,
    audience: "customer",
    customerId: input.customer.id,
    title: "تم إرسال مشاركتك",
    body: "مشاركتك بانتظار مراجعة العلامة التجارية وسنبلغك عند اعتمادها",
    type: "experience_submission",
    meta: { submissionId: submission.id },
  });

  return { ok: true as const, submission };
}

export async function updateExperienceMetrics(
  submissionId: string,
  metrics: { views?: number; likes?: number; comments?: number; shares?: number }
) {
  try {
    const submission = await updateMetricsDb(submissionId, metrics);
    return { ok: true as const, submission };
  } catch {
    return { ok: false as const, error: "المشاركة غير موجودة" };
  }
}

export async function approveExperienceSubmission(
  submissionId: string,
  _awardedPoints: number,
  cafeSlug = "qatrah"
) {
  try {
    const submission = await approveSubmissionDb(submissionId);

    await createNotification({
      cafeSlug,
      audience: "customer",
      customerId: submission.customerId,
      title: "تمت الموافقة على مشاركتك",
      body: "تم اعتماد مشاركتك في حملة توثيق التجربة",
      type: "experience_approved",
      meta: { submissionId },
    });

    return { ok: true as const, submission };
  } catch {
    return { ok: false as const, error: "المشاركة غير متاحة للموافقة" };
  }
}

export async function rejectExperienceSubmission(
  submissionId: string,
  reason: string,
  cafeSlug = "qatrah"
) {
  try {
    const submission = await rejectSubmissionDb(submissionId, reason);

    await createNotification({
      cafeSlug,
      audience: "customer",
      customerId: submission.customerId,
      title: "تم رفض مشاركتك",
      body: reason.trim() || "لم تستوفِ شروط حملة توثيق التجربة",
      type: "experience_approved",
      meta: { submissionId },
    });

    return { ok: true as const, submission };
  } catch {
    return { ok: false as const, error: "المشاركة غير متاحة للرفض" };
  }
}

export async function saveExperienceCampaign(campaign: ExperienceCampaign) {
  await upsertExperienceCampaign({
    id: /^[0-9a-f-]{36}$/i.test(campaign.id) ? campaign.id : undefined,
    title: campaign.title,
    description: campaign.description,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    terms: campaign.terms,
    platforms: campaign.platforms,
    minFollowers: campaign.minFollowers ?? null,
    basePoints: campaign.basePoints,
    pointsPerView: campaign.pointsPerView,
    pointsPerLike: campaign.pointsPerLike,
    pointsPerComment: campaign.pointsPerComment,
    maxPointsPerSubmission: campaign.maxPointsPerSubmission,
    requiresManualApproval: campaign.requiresManualApproval,
    status: campaign.status,
  });
}
