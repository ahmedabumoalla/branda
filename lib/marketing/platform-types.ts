export type PlatformCampaignBrand = { id: string; name: string };
export type PlatformCampaignSummary = {
  id: string;
  title: string;
  body: string;
  status: "queued" | "sending" | "completed" | "cancelled";
  createdAt: string;
  scheduledAt: string;
  mediaKind: "image" | "video" | null;
  total: number;
  accepted: number;
  pending: number;
  failed: number;
  uncertain: number;
  cancelled: number;
  suppressed: number;
};
export type PlatformCampaignDashboard = {
  sender: { phone: string | null; ready: boolean; status: string };
  brands: PlatformCampaignBrand[];
  campaigns: PlatformCampaignSummary[];
};
export type PlatformCampaignAudienceMember = {
  id: string;
  name: string;
  phone: string;
  brands: PlatformCampaignBrand[];
};
export type PlatformCampaignAudiencePage = {
  items: PlatformCampaignAudienceMember[];
  page: number;
  pageSize: number;
  total: number;
};
export type PlatformCampaignAudience =
  | { mode: "selected"; phones: string[]; brandId?: string; search?: string }
  | { mode: "filtered"; brandId?: string; search?: string };
export type PlatformCampaignMedia = {
  id: string;
  kind: "image" | "video";
  mimeType: string;
  fileName: string;
  size: number;
};
export type PlatformCampaignCreateInput = {
  action: "createCampaign";
  idempotencyKey: string;
  title: string;
  body: string;
  mediaId?: string;
  scheduledAt?: string;
  audience: PlatformCampaignAudience;
};
