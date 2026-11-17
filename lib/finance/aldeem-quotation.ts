import { quotePayloadSchema, riyadhDate, type QuotePayload } from "./quotation";

/** Pure local draft: no snapshot, request, invoice number or financial posting. */
export function newAldeemQuote(): QuotePayload {
  return quotePayloadSchema.parse({
    date: riyadhDate(), validUntil: "", status: "draft",
    document: {
      invoice: { lines: [{ key: 1, productId: "", quantity: 1, price: 0 }], warehouseId: "", partyId: "", accountId: "", paymentKind: "credit", discountValue: 0, discountKind: "amount", discountEnabled: false, vatRate: 0, taxInclusive: true, note: "" },
      template: "standard", extraFields: [], deliveryMethod: "print",
    },
  });
}
