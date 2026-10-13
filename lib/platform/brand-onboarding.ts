import { z } from "zod";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";

const optionalName = z.union([z.literal(""), z.string().trim().min(2).max(120)]);
const optionalPhone = z.string().trim().max(24).transform(value => value ? normalizeSaudiPhone(value) : "").refine((value): value is string => value !== null);
const optionalPassword = z.union([z.literal(""), z.string().min(8).max(72).regex(/^\S+$/u)]);
const optionalEmail = z.union([z.literal(""), z.string().trim().email().max(254)]).transform(value => value.toLowerCase());
export const adminBrandAccountSchema = z.object({
  requestId: z.string().uuid(),
  brandName: z.string().trim().min(2).max(120),
  brandNameEn: z.string().trim().max(120),
  slug: z.union([z.literal(""), z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)]),
  category: z.enum(["cafes_coffee", "restaurants", "events_conferences"]),
  ownerName: optionalName,
  phone: optionalPhone,
  email: optionalEmail,
  password: optionalPassword,
});
export type AdminBrandAccountInput = z.input<typeof adminBrandAccountSchema>;
export const adminBrandOwnerSchema = z.object({ requestId: z.string().uuid(), cafeId: z.string().uuid(), ownerName: optionalName, phone: optionalPhone, email: optionalEmail, password: optionalPassword });
export type AdminBrandOwnerInput = z.input<typeof adminBrandOwnerSchema>;
export type BrandOwnerDelivery = { state: "ready" | "editing" | "sending" | "uncertain" | "sent"; sentAt: string | null; detailsReady?: boolean; passwordReady?: boolean };
