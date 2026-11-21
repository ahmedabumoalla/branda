import { z } from "zod";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { AVAILABLE_BUSINESS_CATEGORY_IDS } from "@/lib/platform/business-categories";

const optionalName = z.union([z.literal(""), z.string().trim().min(2).max(120)]);
const optionalPhone = z.string().trim().max(24).transform(value => value ? normalizeSaudiPhone(value) : "").refine((value): value is string => value !== null);
const optionalPassword = z.union([z.literal(""), z.string().min(8).max(72).regex(/^\S+$/u)]);
const optionalEmail = z.union([z.literal(""), z.string().trim().email().max(254)]).transform(value => value.toLowerCase());
export const adminBrandAccountSchema = z.object({
  requestId: z.string().uuid(),
  brandName: z.string().trim().min(2).max(120),
  brandNameEn: z.string().trim().max(120),
  slug: z.union([z.literal(""), z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)]),
  category: z.enum(AVAILABLE_BUSINESS_CATEGORY_IDS),
  ownerName: optionalName,
  phone: optionalPhone,
  email: optionalEmail,
  password: optionalPassword,
});
export type AdminBrandAccountInput = z.input<typeof adminBrandAccountSchema>;
/** Packages the administrator picks for a new account; the trial clock still starts at the login handoff */
export const adminBrandPlanIdsSchema = z.array(z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/)).min(1).max(50);
export type AdminBrandAccountWithPlansInput = AdminBrandAccountInput & { planIds: string[] };
export const adminBrandProfileSchema = z.object({
  cafeId: z.string().uuid(),
  brandName: z.string().trim().min(2).max(120),
  brandNameEn: z.string().trim().max(120),
  slug: z.string().trim().toLowerCase().min(1).max(120),
  category: z.string().trim().min(1).max(60),
});
export type AdminBrandProfileInput = z.input<typeof adminBrandProfileSchema>;
export const adminBrandOwnerSchema = z.object({ requestId: z.string().uuid(), cafeId: z.string().uuid(), ownerName: optionalName, phone: optionalPhone, email: optionalEmail, password: optionalPassword });
export type AdminBrandOwnerInput = z.input<typeof adminBrandOwnerSchema>;
export type BrandOwnerDelivery = { state: "ready" | "editing" | "sending" | "uncertain" | "sent"; sentAt: string | null; detailsReady?: boolean; passwordReady?: boolean };
