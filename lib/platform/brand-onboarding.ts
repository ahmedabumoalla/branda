import { z } from "zod";
import { normalizeBrandPhone, inferPhoneCountry, isBrandPhoneCountry, type BrandPhoneCountry } from "@/lib/auth/brand-phone";
import { AVAILABLE_BUSINESS_CATEGORY_IDS } from "@/lib/platform/business-categories";

const optionalName = z.union([z.literal(""), z.string().trim().min(2).max(120)]);
const optionalPassword = z.union([z.literal(""), z.string().min(8).max(72).regex(/^\S+$/u)]);
const optionalEmail = z.union([z.literal(""), z.string().trim().email().max(254)]).transform(value => value.toLowerCase());
export const adminBrandAccountSchema = z.object({
  requestId: z.string().uuid(),
  brandName: z.string().trim().min(2).max(120),
  brandNameEn: z.string().trim().max(120),
  slug: z.union([z.literal(""), z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)]),
  category: z.enum(AVAILABLE_BUSINESS_CATEGORY_IDS),
  ownerName: optionalName,
  phone: z.string().trim().max(24),
  email: optionalEmail,
  password: optionalPassword,
  phoneCountry: z.custom<BrandPhoneCountry>(isBrandPhoneCountry).optional(),
}).check(ctx => {
  if (!ctx.value.phone) return;
  const phoneCountry = ctx.value.phoneCountry ?? inferPhoneCountry(ctx.value.phone) ?? "SA";
  const phone = normalizeBrandPhone(ctx.value.phone, phoneCountry);
  if (phone === null) {
    ctx.issues.push({ code: "custom", input: ctx.value.phone, path: ["phone"], message: "أدخل جوالًا صحيحًا لدولة الحساب المختارة" });
  } else {
    ctx.value = { ...ctx.value, phone, phoneCountry };
  }
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
export const adminBrandOwnerFor = (country: BrandPhoneCountry) => z.object({ requestId: z.string().uuid(), cafeId: z.string().uuid(), ownerName: optionalName, phone: z.string().trim().max(24).transform(value => value ? normalizeBrandPhone(value, country) : "").refine((value): value is string => value !== null), email: optionalEmail, password: optionalPassword });
export const adminBrandOwnerSchema = adminBrandOwnerFor("SA");
export type AdminBrandOwnerInput = z.input<typeof adminBrandOwnerSchema>;
export type BrandOwnerDelivery = { state: "ready" | "editing" | "sending" | "uncertain" | "sent"; sentAt: string | null; detailsReady?: boolean; passwordReady?: boolean };
