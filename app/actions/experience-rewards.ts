"use server";

import {
  approveOwnerExperienceRewardSubmission,
  getCustomerExperienceRewardSubmissions,
  getOwnerExperienceRewardReviews,
  redeemCashierExperienceReward,
  redeemOwnerExperienceReward,
  rejectOwnerExperienceRewardSubmission,
  submitCustomerExperienceRewardProof,
} from "@/lib/data/experience-rewards";
import {
  getOwnerFeatureCodes,
  getPublicCafeFeatureCodesBySlug,
} from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

async function publicExperienceReviewsEnabled(cafeSlug: string) {
  try {
    const features = await getPublicCafeFeatureCodesBySlug(cafeSlug);
    return featureCodesAllow(features, "experience_reviews");
  } catch (error) {
    console.warn("[experience-rewards/public-feature-gate]", error);
    return false;
  }
}

async function assertOwnerExperienceReviewsEnabled() {
  const features = await getOwnerFeatureCodes();
  if (!featureCodesAllow(features, "experience_reviews")) {
    throw new Error("توثيق التجارب غير مفعل في باقتك الحالية");
  }
}

export async function submitCustomerExperienceRewardProofAction(input: {
  cafeSlug: string;
  experienceUrl: string;
  currentViews: number;
  currentComments: number;
  customerNotes?: string;
}) {
  if (!(await publicExperienceReviewsEnabled(input.cafeSlug))) {
    throw new Error("توثيق التجارب غير مفعل لهذه العلامة التجارية");
  }

  return submitCustomerExperienceRewardProof(input);
}

export async function fetchCustomerExperienceRewardsAction(cafeSlug: string) {
  if (!(await publicExperienceReviewsEnabled(cafeSlug))) return [];
  return getCustomerExperienceRewardSubmissions(cafeSlug);
}

export async function fetchOwnerExperienceRewardReviewsAction() {
  await assertOwnerExperienceReviewsEnabled();
  return getOwnerExperienceRewardReviews();
}

export async function approveExperienceRewardSubmissionAction(input: {
  submissionId: string;
  rewardExpiresAt: string;
  reviewNotes?: string;
  items: Array<{ productId: string; productName: string; quantity: number }>;
}) {
  await assertOwnerExperienceReviewsEnabled();
  return approveOwnerExperienceRewardSubmission(input);
}

export async function rejectExperienceRewardSubmissionAction(
  submissionId: string,
  reviewNotes: string
) {
  await assertOwnerExperienceReviewsEnabled();
  return rejectOwnerExperienceRewardSubmission(submissionId, reviewNotes);
}

export async function cashierRedeemExperienceRewardAction(rewardCode: string) {
  return redeemCashierExperienceReward(rewardCode);
}

export async function ownerRedeemExperienceRewardAction(rewardCode: string) {
  await assertOwnerExperienceReviewsEnabled();
  return redeemOwnerExperienceReward(rewardCode);
}

export async function ownerOperationalRedeemExperienceRewardAction(rewardCode: string) {
  const features = await getOwnerFeatureCodes();
  if (!featureCodesAllow(features, "cashier")) {
    throw new Error("خدمات التشغيل غير مفعلة في باقتك الحالية");
  }
  return redeemOwnerExperienceReward(rewardCode);
}
