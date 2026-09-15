"use server";

import {
  deleteLoyaltyReward,
  getOwnerLoyalty,
  saveLoyaltySettings,
  upsertLoyaltyReward,
} from "@/lib/data/loyalty";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";

async function assertOwnerLoyaltyEnabled() {
  const features = await getOwnerFeatureCodes();
  if (!featureCodesAllow(features, "loyalty")) {
    throw new Error("الولاء غير مفعل في هذه الباقة");
  }
}

export async function fetchOwnerLoyaltyAction() {
  await assertOwnerLoyaltyEnabled();
  return getOwnerLoyalty();
}

export async function saveLoyaltySettingsAction(settings: LoyaltySettings) {
  await assertOwnerLoyaltyEnabled();
  await saveLoyaltySettings({
    enabled: settings.enabled,
    pointsPerSar: settings.pointsPerSar,
    welcomePoints: settings.welcomePoints,
    earnRules: settings.earnRules,
    redemptionRules: settings.redemptionRules,
  });
}

export async function saveLoyaltyRewardAction(reward: LoyaltyReward) {
  await assertOwnerLoyaltyEnabled();
  return upsertLoyaltyReward({
    id: /^[0-9a-f-]{36}$/i.test(reward.id) ? reward.id : undefined,
    title: reward.title,
    points: reward.points,
    description: reward.description,
    active: reward.active,
  });
}

export async function deleteLoyaltyRewardAction(rewardId: string) {
  await assertOwnerLoyaltyEnabled();
  await deleteLoyaltyReward(rewardId);
}
