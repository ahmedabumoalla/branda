import { z } from "zod";
import { ARAB_COUNTRIES, canonicalBrandMobile } from "@/lib/auth/brand-phone";
import { isCashierLoyaltyCode, normalizeLoyaltyReadPhone } from "./read-identifier";

export const invoiceScopeSchema = z.object({ cafeId: z.string().uuid(), cashierId: z.string().uuid() }).strict();
const terms = z.object({
  scope: invoiceScopeSchema, requestId: z.string().uuid(),
  amountHalalas: z.number().int().min(1).max(100_000_000),
  rateSar: z.number().finite().positive(), rateQuantity: z.number().int().positive(),
});
// The authenticated action checks against the cashier's actual brand country
const phone = z.string().min(1).max(50).refine(value => ARAB_COUNTRIES.some(country => Boolean(normalizeLoyaltyReadPhone(value, country.code))));
export const invoiceCreditSchema = z.union([
  terms.extend({ phone }).strict(),
  terms.extend({ cardCode: z.string().min(1).max(100).refine(isCashierLoyaltyCode) }).strict(),
  // Previously loaded cashiers use a resolve step and retain its result as cardCode.
  // The international '+' prefix is disjoint from the card-code alphabet.
  terms.extend({ cardCode: z.string().refine(value => value.startsWith("+") && canonicalBrandMobile.test(value.slice(1))) }).strict()
    .transform(({ cardCode, ...invoice }) => ({ ...invoice, phone: cardCode.slice(1) })),
]);
