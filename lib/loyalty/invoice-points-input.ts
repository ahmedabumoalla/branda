import { z } from "zod";
import { isCashierLoyaltyCode, normalizeLoyaltyReadPhone } from "./read-identifier";

export const invoiceScopeSchema = z.object({ cafeId: z.string().uuid(), cashierId: z.string().uuid() }).strict();
const terms = z.object({
  scope: invoiceScopeSchema, requestId: z.string().uuid(),
  amountHalalas: z.number().int().min(1).max(100_000_000),
  rateSar: z.number().finite().positive(), rateQuantity: z.number().int().positive(),
});
const phone = z.string().min(1).max(50).transform(normalizeLoyaltyReadPhone).pipe(z.string());
export const invoiceCreditSchema = z.union([
  terms.extend({ phone }).strict(),
  terms.extend({ cardCode: z.string().min(1).max(100).refine(isCashierLoyaltyCode) }).strict(),
  // Previously loaded cashiers use a resolve step and retain its result as cardCode.
  // The international '+' prefix is disjoint from the card-code alphabet.
  terms.extend({ cardCode: z.string().regex(/^\+9665\d{8}$/) }).strict()
    .transform(({ cardCode, ...invoice }) => ({ ...invoice, phone: cardCode.slice(1) })),
]);
