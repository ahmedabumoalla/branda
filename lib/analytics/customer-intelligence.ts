import { z } from "zod";

export const customerIntelligenceFilters = z.object({
  search: z.string().trim().max(100).default(""), brandId: z.string().uuid().or(z.literal("")).default(""),
  segment: z.enum(["all", "recent", "shared", "unmeasured"]).default("all"),
  sort: z.enum(["recent", "name", "time"]).default("recent"), page: z.number().int().min(1).max(100000).default(1),
});
export type CustomerIntelligenceFilters = z.infer<typeof customerIntelligenceFilters>;
export const defaultCustomerFilters: CustomerIntelligenceFilters = { search: "", brandId: "", segment: "all", sort: "recent", page: 1 };
export type CustomerDevice = { type: "mobile" | "tablet" | "desktop" | "unknown"; name: string; os: string; browser: string };
export type CustomerActivity = { at: string; kind: string; brandName: string; source: "browser" | "loyalty" | "wallet" };
export type CustomerBrand = { id: string; name: string; slug: string; joinedAt: string; status: string; stamps: number; scans: number; rewards: number };
export type IntelligenceCustomer = {
  id: string; name: string; phone: string; email: string | null; status: string; joinedAt: string;
  brands: CustomerBrand[]; brandCount: number; identityMatch: "phone" | "account" | "profile";
  lastActivity: CustomerActivity | null; lastSeenAt: string | null; device: CustomerDevice | null;
  activeSeconds: number | null; sessions: number; menuSessions: number; loyaltySessions: number;
  scans: number; stamps: number; rewards: number;
};
export type CustomerIntelligencePage = {
  customers: IntelligenceCustomer[]; total: number; page: number; pageSize: number;
  brands: { id: string; name: string }[];
  summary: { customers: number; shared: number; activeToday: number; measured: number; activeSeconds: number };
  recordingStartedAt: string; generatedAt: string;
};
export type CustomerTimelineEvent = {
  id: string; at: string; kind: string; source: "browser" | "loyalty" | "wallet";
  brandName: string; outcome: string; activeSeconds: number | null; device: CustomerDevice | null; detail: string | null;
};
export type CustomerIntelligenceDetail = {
  customer: IntelligenceCustomer; events: CustomerTimelineEvent[]; total: number; page: number; pageSize: number;
  recordingStartedAt: string; generatedAt: string;
};
export const customerDetailInput = z.object({ customerId: z.string().uuid(), page: z.number().int().min(1).max(100000).default(1), kind: z.enum(["all", "browser", "loyalty", "wallet"]).default("all") });
export const customerActivityLabels: Record<string, string> = {
  joined: "التسجيل لدى العلامة", card_issued: "إصدار بطاقة الولاء", reward_earned: "الحصول على مكافأة",
  menu_view: "تصفح المنيو", menu_loyalty_click: "انتقال من المنيو للولاء", loyalty_menu_visit: "زيارة الولاء من المنيو",
  loyalty_qr_visit: "فتح الولاء من رابط QR", loyalty_direct_visit: "زيارة صفحة الولاء", scan: "قراءة بطاقة الولاء",
  stamp: "إضافة ختم", redeem: "استبدال مكافأة", void: "إلغاء عملية ولاء", download: "تنزيل بطاقة المحفظة",
  save_link: "فتح رابط حفظ البطاقة", installed: "تسجيل البطاقة في محفظة Apple", unregistered: "إزالة البطاقة من المحفظة",
};
