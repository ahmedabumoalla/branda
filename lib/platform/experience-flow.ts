import { TRANSACTIONS_KEY, type CustomerTransaction } from "@/lib/mock/customer-activity";
import type { BrandaCustomerSession } from "@/lib/customer/session";
import {
  EXPERIENCE_CAMPAIGNS_KEY,
  EXPERIENCE_SUBMISSIONS_KEY,
  calculateExperiencePoints,
  type ExperienceCampaign,
  type ExperiencePlatform,
  type ExperienceSubmission,
} from "@/lib/mock/experience-campaigns";
import {
  PLATFORM_CUSTOMERS_KEY,
  mockPlatformCustomers,
  type PlatformCustomer,
} from "@/lib/platform/admin-data";
import { notifyCafe, notifyCustomer } from "@/lib/platform/notification-flow";

function readJson<T>(key: string, fallback: T): T {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : fallback;
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function submitExperienceCampaign(input: {
  slug: string;
  customer: BrandaCustomerSession;
  campaignId: string;
  platform: ExperiencePlatform;
  videoUrl: string;
  platformUsername?: string;
  note?: string;
}) {
  const campaigns = readJson<ExperienceCampaign[]>(EXPERIENCE_CAMPAIGNS_KEY, []);
  const campaign = campaigns.find(
    (c) => c.id === input.campaignId && c.status === "active"
  );
  if (!campaign) {
    return { ok: false as const, error: "الحملة غير متاحة" };
  }

  const submission: ExperienceSubmission = {
    id: crypto.randomUUID(),
    campaignId: campaign.id,
    cafeSlug: input.slug,
    customerId: input.customer.id,
    customerName: input.customer.fullName,
    platform: input.platform,
    videoUrl: input.videoUrl.trim(),
    platformUsername: input.platformUsername?.trim(),
    note: input.note?.trim(),
    status: "pending",
    createdAt: new Date().toISOString().slice(0, 10),
  };

  const submissions = readJson<ExperienceSubmission[]>(EXPERIENCE_SUBMISSIONS_KEY, []);
  writeJson(EXPERIENCE_SUBMISSIONS_KEY, [submission, ...submissions]);

  notifyCafe({
    cafeSlug: input.slug,
    title: "مشاركة جديدة — وثّق تجربتك",
    body: `${input.customer.fullName} أرسل فيديو على ${input.platform}`,
    type: "experience_submission",
    meta: { submissionId: submission.id, campaignId: campaign.id },
  });

  notifyCustomer({
    cafeSlug: input.slug,
    customerId: input.customer.id,
    title: "تم إرسال مشاركتك",
    body: "مشاركتك بانتظار مراجعة الكوفي. سنبلغك عند الموافقة وإضافة النقاط.",
    type: "experience_submission",
    meta: { submissionId: submission.id },
  });

  return { ok: true as const, submission };
}

export function updateExperienceMetrics(
  submissionId: string,
  metrics: { views?: number; likes?: number; comments?: number; shares?: number }
) {
  const submissions = readJson<ExperienceSubmission[]>(EXPERIENCE_SUBMISSIONS_KEY, []);
  const submission = submissions.find((s) => s.id === submissionId);
  if (!submission) return { ok: false as const, error: "المشاركة غير موجودة" };

  const campaigns = readJson<ExperienceCampaign[]>(EXPERIENCE_CAMPAIGNS_KEY, []);
  const campaign = campaigns.find((c) => c.id === submission.campaignId);
  const suggestedPoints = campaign
    ? calculateExperiencePoints(campaign, metrics)
    : submission.suggestedPoints;

  const next = submissions.map((s) =>
    s.id === submissionId
      ? { ...s, ...metrics, suggestedPoints }
      : s
  );
  writeJson(EXPERIENCE_SUBMISSIONS_KEY, next);

  return {
    ok: true as const,
    submission: next.find((s) => s.id === submissionId)!,
  };
}

export function approveExperienceSubmission(
  submissionId: string,
  awardedPoints: number,
  cafeSlug = "qatrah"
) {
  const submissions = readJson<ExperienceSubmission[]>(EXPERIENCE_SUBMISSIONS_KEY, []);
  const submission = submissions.find((s) => s.id === submissionId);
  if (!submission || submission.status !== "pending") {
    return { ok: false as const, error: "المشاركة غير متاحة للموافقة" };
  }

  const reviewedAt = new Date().toISOString();
  const next = submissions.map((s) =>
    s.id === submissionId
      ? {
          ...s,
          status: "approved" as const,
          awardedPoints,
          reviewedAt,
        }
      : s
  );
  writeJson(EXPERIENCE_SUBMISSIONS_KEY, next);

  const transaction: CustomerTransaction = {
    id: crypto.randomUUID(),
    cafeSlug: submission.cafeSlug,
    customerId: submission.customerId,
    type: "نقاط",
    title: "مكافأة وثّق تجربتك",
    description: `تمت الموافقة على مشاركتك — ${awardedPoints} نقطة`,
    points: awardedPoints,
    createdAt: reviewedAt.slice(0, 10),
  };

  const transactions = readJson<CustomerTransaction[]>(TRANSACTIONS_KEY, []);
  writeJson(TRANSACTIONS_KEY, [transaction, ...transactions]);

  const customers = readJson<PlatformCustomer[]>(
    PLATFORM_CUSTOMERS_KEY,
    mockPlatformCustomers
  );
  writeJson(
    PLATFORM_CUSTOMERS_KEY,
    customers.map((c) =>
      c.id === submission.customerId
        ? { ...c, loyaltyPoints: c.loyaltyPoints + awardedPoints }
        : c
    )
  );

  notifyCustomer({
    cafeSlug,
    customerId: submission.customerId,
    title: "تمت الموافقة على مشاركتك",
    body: `حصلت على ${awardedPoints} نقطة ولاء من حملة وثّق تجربتك.`,
    type: "experience_approved",
    meta: { submissionId, points: String(awardedPoints) },
  });

  return { ok: true as const, submission: next.find((s) => s.id === submissionId)! };
}

export function rejectExperienceSubmission(
  submissionId: string,
  reason: string,
  cafeSlug = "qatrah"
) {
  const submissions = readJson<ExperienceSubmission[]>(EXPERIENCE_SUBMISSIONS_KEY, []);
  const submission = submissions.find((s) => s.id === submissionId);
  if (!submission || submission.status !== "pending") {
    return { ok: false as const, error: "المشاركة غير متاحة للرفض" };
  }

  const reviewedAt = new Date().toISOString();
  const next = submissions.map((s) =>
    s.id === submissionId
      ? {
          ...s,
          status: "rejected" as const,
          rejectionReason: reason.trim() || "لم تستوفِ شروط الحملة",
          reviewedAt,
        }
      : s
  );
  writeJson(EXPERIENCE_SUBMISSIONS_KEY, next);

  notifyCustomer({
    cafeSlug,
    customerId: submission.customerId,
    title: "تم رفض مشاركتك",
    body: reason.trim() || "لم تستوفِ شروط حملة وثّق تجربتك.",
    type: "experience_approved",
    meta: { submissionId },
  });

  return { ok: true as const, submission: next.find((s) => s.id === submissionId)! };
}

export function saveExperienceCampaign(campaign: ExperienceCampaign) {
  const campaigns = readJson<ExperienceCampaign[]>(EXPERIENCE_CAMPAIGNS_KEY, []);
  const exists = campaigns.some((c) => c.id === campaign.id);
  writeJson(
    EXPERIENCE_CAMPAIGNS_KEY,
    exists
      ? campaigns.map((c) => (c.id === campaign.id ? campaign : c))
      : [campaign, ...campaigns]
  );
}
