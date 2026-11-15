import { z } from "zod";

const amount = z.number().finite();
export const hospitalDoctorStatementSchema = z.object({
  brand: z.object({ name: z.string(), slug: z.literal("mind-hospital"), logoUrl: z.string().nullable() }),
  doctor: z.object({ id: z.string().uuid(), name: z.string(), phone: z.string() }),
  invoices: z.array(z.object({
    id: z.string().uuid(), number: z.union([z.string(), z.number()]), createdAt: z.string(),
    total: amount, paid: amount, outstanding: amount, refundedTotal: amount.optional(), status: z.string(),
    items: z.array(z.object({ name: z.string(), quantity: amount, unitPrice: amount, total: amount })),
  })),
  totalInvoiced: amount, totalPaid: amount, balance: amount,
});

export type HospitalDoctorStatement = z.infer<typeof hospitalDoctorStatementSchema>;
export type HospitalDoctorPortalState =
  | { state: "ready"; data: HospitalDoctorStatement }
  | { state: "missing" | "login" | "verify-phone" | "unlinked" | "unavailable" };

export function hospitalDoctorAccountHref(slug = "mind-hospital") {
  return `/c/${encodeURIComponent(slug)}/hospital-account`;
}
