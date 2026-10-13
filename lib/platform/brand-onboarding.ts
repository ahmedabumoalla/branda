import { z } from "zod";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";

export const adminBrandAccountSchema = z.object({
  requestId: z.string().uuid(),
  brandName: z.string().trim().min(2).max(120),
  brandNameEn: z.string().trim().max(120),
  slug: z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  category: z.enum(["cafes_coffee", "restaurants", "events_conferences"]),
  ownerName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(24).transform(normalizeSaudiPhone).refine((value): value is string => Boolean(value)),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]).transform(value => value.toLowerCase()),
  password: z.string().min(8).max(72).regex(/^\S+$/u),
});
export type AdminBrandAccountInput = z.input<typeof adminBrandAccountSchema>;
export type BrandOwnerDelivery = { state: "ready" | "sending" | "uncertain" | "sent"; sentAt: string | null };
