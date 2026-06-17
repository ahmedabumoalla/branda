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

export async function submitCustomerExperienceRewardProofAction(input: {
  cafeSlug: string;
  experienceUrl: string;
  currentViews: number;
  currentComments: number;
  customerNotes?: string;
}) {
  return submitCustomerExperienceRewardProof(input);
}

export async function fetchCustomerExperienceRewardsAction(cafeSlug: string) {
  return getCustomerExperienceRewardSubmissions(cafeSlug);
}

export async function fetchOwnerExperienceRewardReviewsAction() {
  return getOwnerExperienceRewardReviews();
}

export async function approveExperienceRewardSubmissionAction(input: {
  submissionId: string;
  rewardExpiresAt: string;
  reviewNotes?: string;
  items: Array<{ productId: string; productName: string; quantity: number }>;
}) {
  return approveOwnerExperienceRewardSubmission(input);
}

export async function rejectExperienceRewardSubmissionAction(
  submissionId: string,
  reviewNotes: string
) {
  return rejectOwnerExperienceRewardSubmission(submissionId, reviewNotes);
}

export async function cashierRedeemExperienceRewardAction(rewardCode: string) {
  return redeemCashierExperienceReward(rewardCode);
}

export async function ownerRedeemExperienceRewardAction(rewardCode: string) {
  return redeemOwnerExperienceReward(rewardCode);
}
