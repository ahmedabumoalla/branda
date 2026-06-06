"use server";

import {
  getOwnerMarketingCampaigns,
  softDeleteMarketingCampaign,
  upsertMarketingCampaign,
} from "@/lib/data/marketing";
import type { MarketingCampaign } from "@/lib/mock/marketing";

export async function fetchOwnerMarketingAction() {
  return getOwnerMarketingCampaigns();
}

export async function saveMarketingCampaignAction(campaign: MarketingCampaign) {
  return upsertMarketingCampaign({
    id: /^[0-9a-f-]{36}$/i.test(campaign.id) ? campaign.id : undefined,
    title: campaign.title,
    channel: campaign.channel,
    status: campaign.status,
    imageStoragePath: campaign.imageAssetId ?? null,
    payload: {
      audience: campaign.audience,
      message: campaign.message,
      code: campaign.code,
      discountPercent: campaign.discountPercent,
      influencerName: campaign.influencerName,
      influencerPhone: campaign.influencerPhone,
      commissionPercent: campaign.commissionPercent,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      visits: campaign.visits,
      conversions: campaign.conversions,
    },
  });
}

export async function deleteMarketingCampaignAction(campaignId: string) {
  await softDeleteMarketingCampaign(campaignId);
}
