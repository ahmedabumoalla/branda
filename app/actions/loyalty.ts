"use server";

import {
  deleteLoyaltyReward,
  getOwnerLoyalty,
  saveLoyaltySettings,
  upsertLoyaltyReward,
} from "@/lib/data/loyalty";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";

export async function fetchOwnerLoyaltyAction() {
  return getOwnerLoyalty();
}

export async function saveLoyaltySettingsAction(settings: LoyaltySettings) {
  await saveLoyaltySettings({
    enabled: settings.enabled,
    pointsPerSar: settings.pointsPerSar,
    welcomePoints: settings.welcomePoints,
    earnRules: settings.earnRules,
    redemptionRules: settings.redemptionRules,
  });
}

export async function saveLoyaltyRewardAction(reward: LoyaltyReward) {
  return upsertLoyaltyReward({
    id: /^[0-9a-f-]{36}$/i.test(reward.id) ? reward.id : undefined,
    title: reward.title,
    points: reward.points,
    description: reward.description,
    active: reward.active,
  });
}

export async function deleteLoyaltyRewardAction(rewardId: string) {
  await deleteLoyaltyReward(rewardId);
}
