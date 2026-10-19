export type MarketingConnectionStatus = "disconnected" | "provisioning" | "pairing" | "connected" | "mismatch" | "uncertain" | "error" | "disconnecting";
export type MarketingCampaignStatus = "queued" | "scheduled" | "sending" | "completed" | "cancelled" | "paused";
export type MarketingCampaignSummary = {
  id: string; title: string; body: string; status: MarketingCampaignStatus;
  scheduledAt: string; createdAt: string; total: number; queued: number;
  accepted: number; delivered: number; read: number; failed: number; uncertain: number;
  cancelled: number; suppressed: number;
};
export type MarketingDashboard = {
  brandName: string; eligible: boolean; configured: boolean; optOutCount: number;
  connection: { status: MarketingConnectionStatus; phone: string; verifiedPhone: string | null; lastError: string | null } | null;
  campaigns: MarketingCampaignSummary[];
};
export type MarketingResult = { dashboard: MarketingDashboard; qr?: string; qrStatus?: string };
export type MarketingAction =
  | { action: "connect"; phone: string }
  | { action: "refresh" | "qr" | "disconnect" }
  | { action: "createCampaign"; idempotencyKey: string; title: string; body: string; recipients: string[]; consent: true; scheduledAt?: string }
  | { action: "cancelCampaign"; campaignId: string }
  | { action: "optOut"; phone: string };
