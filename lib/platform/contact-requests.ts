import { z } from "zod";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";

export const contactStatusSchema = z.enum(["new", "reviewing", "closed"]);
export const contactRequestSchema = z.object({
  requestId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().max(24).transform(value => normalizeSaudiPhone(value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632)))).refine((value): value is string => Boolean(value)),
  business: z.string().trim().min(2).max(150),
  businessType: z.string().trim().min(2).max(80),
  selectedPlan: z.string().trim().max(150).default(""),
  website: z.string().max(0).default(""),
});
export type ContactRequestInput = z.input<typeof contactRequestSchema>;
export type ContactRequest = {
  id: string; fullName: string; phone: string | null; email: string | null;
  business: string | null; businessType: string | null; selectedPlan: string | null;
  message: string; status: z.infer<typeof contactStatusSchema>; createdAt: string;
};
