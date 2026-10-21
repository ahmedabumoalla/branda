export type MarketingConnectionStatus = "disconnected" | "provisioning" | "pairing" | "connected" | "mismatch" | "uncertain" | "error" | "disconnecting";
export type MarketingCampaignStatus = "queued" | "scheduled" | "sending" | "completed" | "cancelled" | "paused";
export type MarketingAudienceMember = {
  id: string; name: string; phone: string; suppressed: boolean; source: "customer" | "loyalty" | "both";
};
export type MarketingCampaignMedia = {
  id: string; kind: "image" | "video"; mimeType: string; fileName: string; size: number;
};
export type MarketingCampaignSummary = {
  id: string; title: string; body: string; status: MarketingCampaignStatus;
  scheduledAt: string; createdAt: string; total: number; queued: number;
  accepted: number; delivered: number; read: number; failed: number; uncertain: number;
  cancelled: number; suppressed: number;
  media?: MarketingCampaignMedia | null;
};
export type MarketingDashboard = {
  brandName: string; eligible: boolean; configured: boolean; optOutCount: number;
  connection: { status: MarketingConnectionStatus; phone: string; verifiedPhone: string | null; lastError: string | null } | null;
  campaigns: MarketingCampaignSummary[];
  audience: MarketingAudienceMember[];
};
export type MarketingResult = { dashboard: MarketingDashboard; qr?: string; qrStatus?: string };
export type MarketingAction =
  | { action: "connect"; phone: string }
  | { action: "refresh" | "qr" | "disconnect" }
  | { action: "createCampaign"; idempotencyKey: string; title: string; body: string; customerIds: string[]; consent: true; scheduledAt?: string; mediaId?: string }
  | { action: "cancelCampaign"; campaignId: string }
  | { action: "optOut"; customerId: string };
