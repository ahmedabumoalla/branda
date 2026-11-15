import "server-only";
import type { SubscriptionQuote } from "@/lib/platform/subscription-quotes";
import { createSubscriptionInvoicePdf } from "./subscription-invoice-pdf";

/** The original invoice template, embedded assets and print pipeline remain shared. */
export function createSubscriptionQuotePdf(quote:SubscriptionQuote,preview=false){
  return createSubscriptionInvoicePdf(quote,preview);
}
